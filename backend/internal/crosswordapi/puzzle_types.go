package crosswordapi

import (
	"encoding/json"
	"strings"
)

type PuzzleType string

const (
	puzzleTypeCrossword  PuzzleType = "crossword"
	puzzleTypeWordSearch PuzzleType = "word_search"

	currentLayoutVersion = 1
)

var wordSearchDirections = []string{"N", "NE", "E", "SE", "S", "SW", "W", "NW"}

func normalizePuzzleType(raw string) PuzzleType {
	switch PuzzleType(strings.TrimSpace(raw)) {
	case puzzleTypeWordSearch:
		return puzzleTypeWordSearch
	case puzzleTypeCrossword:
		return puzzleTypeCrossword
	default:
		return puzzleTypeCrossword
	}
}

func puzzleTypeSupported(raw string) bool {
	switch PuzzleType(strings.TrimSpace(raw)) {
	case puzzleTypeCrossword, puzzleTypeWordSearch:
		return true
	default:
		return false
	}
}

func cloneStringSlice(values []string) []string {
	cloned := make([]string, len(values))
	copy(cloned, values)
	return cloned
}

func defaultOptionsForPuzzleType(puzzleType PuzzleType) map[string]any {
	switch normalizePuzzleType(string(puzzleType)) {
	case puzzleTypeWordSearch:
		return map[string]any{
			"directions": cloneStringSlice(wordSearchDirections),
		}
	default:
		return map[string]any{}
	}
}

func marshalPuzzleOptions(options map[string]any, puzzleType PuzzleType) string {
	resolvedOptions := options
	if resolvedOptions == nil {
		resolvedOptions = defaultOptionsForPuzzleType(puzzleType)
	}
	encoded, err := json.Marshal(resolvedOptions)
	if err != nil {
		encoded, _ = json.Marshal(defaultOptionsForPuzzleType(puzzleType))
	}
	return string(encoded)
}

func parsePuzzleOptions(raw string, puzzleType PuzzleType) map[string]any {
	defaults := defaultOptionsForPuzzleType(puzzleType)
	if strings.TrimSpace(raw) == "" {
		return defaults
	}

	var parsed map[string]any
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil || parsed == nil {
		return defaults
	}

	if normalizePuzzleType(string(puzzleType)) == puzzleTypeWordSearch {
		rawDirections, ok := parsed["directions"].([]any)
		if !ok || len(rawDirections) == 0 {
			return defaults
		}
		directions := make([]string, 0, len(rawDirections))
		for _, direction := range rawDirections {
			text, ok := direction.(string)
			if ok && strings.TrimSpace(text) != "" {
				directions = append(directions, strings.TrimSpace(text))
			}
		}
		if len(directions) == 0 {
			return defaults
		}
		return map[string]any{"directions": directions}
	}

	return parsed
}
