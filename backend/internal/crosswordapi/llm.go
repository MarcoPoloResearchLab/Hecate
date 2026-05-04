package crosswordapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// WordItem represents a single generated puzzle item with clue-like metadata.
type WordItem struct {
	Word       string `json:"word"`
	Definition string `json:"definition"`
	Hint       string `json:"hint"`
}

// PuzzleMetadata represents generated UI copy for a Hecate puzzle.
type PuzzleMetadata struct {
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Description string `json:"description"`
}

// llmProxyResponse is the JSON wrapper returned by llm-proxy with format=application/json.
type llmProxyResponse struct {
	Request  string `json:"request"`
	Response string `json:"response"`
}

// llmProxyError distinguishes upstream errors by HTTP status code.
type llmProxyError struct {
	StatusCode int
	Body       string
}

func (e *llmProxyError) Error() string {
	return fmt.Sprintf("llm proxy returned %d: %s", e.StatusCode, truncate(e.Body, 200))
}

var generatedWordPattern = regexp.MustCompile(`^[A-Z]{3,12}$`)
var crosswordWordPattern = regexp.MustCompile(`(?i)\bcrossword\b`)
var wordSearchPattern = regexp.MustCompile(`(?i)\bword\s+search\b`)
var whitespacePattern = regexp.MustCompile(`\s+`)

const maxGeneratedTitleLength = 100
const punctuationTrimCutset = " \t\r\n-–—:|,.;!/?"
const llmVerificationRetryAttempts = 2

const crosswordWordSystemPrompt = `You are a crossword puzzle word generator. Return ONLY a valid JSON array, no markdown fences, no commentary.
Each element must have exactly three fields: "word", "definition", "hint".
Rules:
- "word" must be a single English word, 3-12 ASCII letters (A-Z only; no accents, spaces, hyphens, or numbers).
- "definition" is a concise crossword-style clue (5-15 words).
- "hint" is an additional clue that approaches the answer from a different angle (5-15 words).
- All words must be distinct.
- Words should be thematically related to the given topic.
- Prefer common, well-known words over obscure ones.
- Aim for a mix of word lengths (some short 3-5 letters, some medium 5-8, some longer 8-12).
- CRITICAL: Every definition must be unique and creative. Never use ordinal/positional patterns like "first X", "second X", "third X", "Nth X in the list/cycle/series". Instead describe the word by its distinctive characteristics, mythology, behavior, appearance, or cultural significance. Each clue should feel like it was written by a different person.`

const wordSearchWordSystemPrompt = `You are a word search puzzle word generator. Return ONLY a valid JSON array, no markdown fences, no commentary.
Each element must have exactly three fields: "word", "definition", "hint".
Rules:
- "word" must be a single English word, 3-12 ASCII letters (A-Z only; no accents, spaces, hyphens, or numbers).
- "definition" is a concise factual descriptor of the word's meaning or significance (4-12 words).
- "hint" is a short assistive clue that helps the player recognize the target word without spelling it out directly (4-12 words).
- All words must be distinct.
- Words should be thematically related to the given topic.
- Prefer common, well-known words over obscure ones.
- Aim for a mix of word lengths (some short 3-5 letters, some medium 5-8, some longer 8-12).
- The set must work well in a word-search grid, so avoid apostrophes, plurals that duplicate singular forms, and near-duplicates.`

const metadataSystemPrompt = `You are a word puzzle metadata writer. Return ONLY a valid JSON object, no markdown fences, no commentary.
The object must contain exactly three string fields: "title", "subtitle", and "description".
Rules:
- "title" must describe the actual generated words, must not contain the words "crossword" or "word search", and must be 100 characters or fewer.
- "subtitle" must be slightly longer than the title and refer to something concrete from the provided words, clues, or hints.
- "description" must be a single detailed paragraph about the generated puzzle content.
- Use only information supported by the provided topic, words, clues, and hints.
- Do not use markdown in any field.`

func wordSystemPromptForPuzzleType(puzzleType string) string {
	if normalizePuzzleType(puzzleType) == puzzleTypeWordSearch {
		return wordSearchWordSystemPrompt
	}
	return crosswordWordSystemPrompt
}

func puzzleLabelForPrompt(puzzleType string) string {
	if normalizePuzzleType(puzzleType) == puzzleTypeWordSearch {
		return "word search"
	}
	return "crossword"
}

func (handler *httpHandler) callLLMProxy(ctx context.Context, topic string, puzzleType string, wordCount int) ([]WordItem, error) {
	userPrompt := fmt.Sprintf("Generate exactly %d %s words about the topic: %q", wordCount, puzzleLabelForPrompt(puzzleType), topic)

	return retryVerifiedLLMCall(
		llmVerificationRetryAttempts,
		func() ([]WordItem, error) {
			responseText, err := handler.callLLMProxyText(ctx, userPrompt, wordSystemPromptForPuzzleType(puzzleType))
			if err != nil {
				return nil, err
			}
			return parseWordItems(responseText)
		},
		func(items []WordItem) error {
			return verifyWordItems(items, wordCount)
		},
	)
}

func (handler *httpHandler) callPuzzleMetadataLLMProxy(ctx context.Context, topic string, puzzleType string, items []WordItem) (*PuzzleMetadata, error) {
	itemsJSON, _ := json.Marshal(items)

	userPrompt := fmt.Sprintf(
		"Write metadata for a generated %s puzzle.\nTopic: %q\nFinal word list JSON:\n%s\nReturn the JSON object now.",
		puzzleLabelForPrompt(puzzleType),
		topic,
		string(itemsJSON),
	)

	responseText, err := handler.callLLMProxyText(ctx, userPrompt, metadataSystemPrompt)
	if err != nil {
		return nil, err
	}

	return parsePuzzleMetadata(responseText, topic)
}

func retryVerifiedLLMCall[T any](attempts int, invoke func() (T, error), verify func(T) error) (T, error) {
	var zero T
	if attempts < 1 {
		attempts = 1
	}

	lastErr := errors.New("llm call failed")
	for attempt := 0; attempt < attempts; attempt++ {
		value, err := invoke()
		if err != nil {
			lastErr = err
			continue
		}
		if verify != nil {
			if err := verify(value); err != nil {
				lastErr = err
				continue
			}
		}
		return value, nil
	}

	return zero, lastErr
}

func parseWordItems(responseText string) ([]WordItem, error) {
	var items []WordItem
	if err := json.Unmarshal([]byte(responseText), &items); err != nil {
		return nil, fmt.Errorf("parse word list: %w (response: %s)", err, truncate(responseText, 300))
	}

	validated := make([]WordItem, 0, len(items))
	seenWords := map[string]struct{}{}
	for _, item := range items {
		word, err := normalizeGeneratedWord(item.Word)
		if err != nil {
			continue
		}
		if _, exists := seenWords[word]; exists {
			continue
		}
		item.Definition = normalizeWhitespace(item.Definition)
		item.Hint = normalizeWhitespace(item.Hint)
		if item.Definition == "" || item.Hint == "" {
			continue
		}
		seenWords[word] = struct{}{}
		item.Word = word
		validated = append(validated, item)
	}
	return validated, nil
}

func normalizeGeneratedWord(rawWord string) (string, error) {
	trimmedWord := strings.TrimSpace(rawWord)
	if trimmedWord == "" {
		return "", fmt.Errorf("generated word is empty")
	}

	var normalizedBuilder strings.Builder
	for _, wordRune := range norm.NFD.String(trimmedWord) {
		if unicode.Is(unicode.Mn, wordRune) {
			continue
		}
		normalizedBuilder.WriteRune(wordRune)
	}

	word := strings.ToUpper(normalizedBuilder.String())
	if !generatedWordPattern.MatchString(word) {
		return "", fmt.Errorf("generated word %q must be 3-12 ASCII letters", rawWord)
	}
	return word, nil
}

func verifyWordItems(items []WordItem, expectedWordCount int) error {
	if len(items) == 0 {
		return fmt.Errorf("llm returned no valid words")
	}
	if expectedWordCount > 0 && len(items) != expectedWordCount {
		return fmt.Errorf("llm returned %d valid words, want %d", len(items), expectedWordCount)
	}
	return nil
}

func (handler *httpHandler) callLLMProxyText(ctx context.Context, userPrompt string, systemPrompt string) (string, error) {

	params := url.Values{}
	params.Set("prompt", userPrompt)
	params.Set("key", handler.cfg.LLMProxyKey)
	params.Set("format", "application/json")
	params.Set("system_prompt", systemPrompt)

	requestURL := handler.cfg.LLMProxyURL + "/?" + params.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return "", fmt.Errorf("build llm request: %w", err)
	}

	resp, err := handler.llmHTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("llm proxy call: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read llm response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", &llmProxyError{StatusCode: resp.StatusCode, Body: string(body)}
	}

	var wrapper llmProxyResponse
	if err := json.Unmarshal(body, &wrapper); err != nil {
		return "", fmt.Errorf("parse llm wrapper: %w", err)
	}

	responseText := strings.TrimSpace(wrapper.Response)
	responseText = stripMarkdownFences(responseText)
	return responseText, nil
}

func stripMarkdownFences(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```json") {
		s = strings.TrimPrefix(s, "```json")
	} else if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```")
	}
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func parsePuzzleMetadata(responseText string, topic string) (*PuzzleMetadata, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(responseText), &raw); err != nil {
		return nil, fmt.Errorf("parse puzzle metadata: %w (response: %s)", err, truncate(responseText, 300))
	}
	if len(raw) != 3 {
		return nil, fmt.Errorf("parse puzzle metadata: expected exactly 3 fields")
	}

	metadata := &PuzzleMetadata{}
	if err := decodeMetadataField(raw, "title", &metadata.Title); err != nil {
		return nil, err
	}
	if err := decodeMetadataField(raw, "subtitle", &metadata.Subtitle); err != nil {
		return nil, err
	}
	if err := decodeMetadataField(raw, "description", &metadata.Description); err != nil {
		return nil, err
	}

	metadata.Title = normalizeMetadataTitle(metadata.Title, topic)
	metadata.Subtitle = normalizeWhitespace(metadata.Subtitle)
	metadata.Description = normalizeWhitespace(metadata.Description)
	if metadata.Subtitle == "" {
		return nil, fmt.Errorf("parse puzzle metadata: subtitle is required")
	}
	if metadata.Description == "" {
		return nil, fmt.Errorf("parse puzzle metadata: description is required")
	}

	return metadata, nil
}

func decodeMetadataField(raw map[string]json.RawMessage, field string, target *string) error {
	value, ok := raw[field]
	if !ok {
		return fmt.Errorf("parse puzzle metadata: missing field %q", field)
	}
	if err := json.Unmarshal(value, target); err != nil {
		return fmt.Errorf("parse puzzle metadata: invalid field %q", field)
	}
	return nil
}

func normalizeWhitespace(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	return whitespacePattern.ReplaceAllString(s, " ")
}

func trimDecorativePunctuation(s string) string {
	return strings.Trim(s, punctuationTrimCutset)
}

func truncateRunes(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}

func normalizeMetadataTitle(title string, topic string) string {
	sanitizeTitle := func(value string) string {
		value = crosswordWordPattern.ReplaceAllString(value, " ")
		value = wordSearchPattern.ReplaceAllString(value, " ")
		return value
	}

	normalized := trimDecorativePunctuation(
		normalizeWhitespace(sanitizeTitle(title)),
	)
	normalized = truncateRunes(normalized, maxGeneratedTitleLength)
	normalized = trimDecorativePunctuation(normalizeWhitespace(normalized))
	if normalized != "" {
		return normalized
	}

	fallback := trimDecorativePunctuation(
		normalizeWhitespace(sanitizeTitle(sanitizeTopic(topic))),
	)
	fallback = truncateRunes(fallback, maxGeneratedTitleLength)
	fallback = trimDecorativePunctuation(normalizeWhitespace(fallback))
	if fallback != "" {
		return fallback
	}

	return "Untitled Topic"
}
