package crosswordapi

import (
	"encoding/json"
	"testing"
)

func TestPuzzleTypeHelpers(t *testing.T) {
	t.Run("normalize and validate puzzle types", func(t *testing.T) {
		if got := normalizePuzzleType("word_search"); got != puzzleTypeWordSearch {
			t.Fatalf("normalizePuzzleType(word_search) = %q", got)
		}
		if got := normalizePuzzleType(" crossword "); got != puzzleTypeCrossword {
			t.Fatalf("normalizePuzzleType(crossword) = %q", got)
		}
		if got := normalizePuzzleType("mystery"); got != puzzleTypeCrossword {
			t.Fatalf("normalizePuzzleType(mystery) = %q", got)
		}

		if !puzzleTypeSupported("crossword") {
			t.Fatal("expected crossword to be supported")
		}
		if !puzzleTypeSupported("word_search") {
			t.Fatal("expected word_search to be supported")
		}
		if puzzleTypeSupported("") {
			t.Fatal("expected blank puzzle type to be rejected")
		}
		if puzzleTypeSupported("mystery") {
			t.Fatal("expected unknown puzzle type to be rejected")
		}
	})

	t.Run("clone string slices without aliasing", func(t *testing.T) {
		cloned := cloneStringSlice(wordSearchDirections)
		if len(cloned) != len(wordSearchDirections) {
			t.Fatalf("expected %d directions, got %d", len(wordSearchDirections), len(cloned))
		}
		cloned[0] = "X"
		if wordSearchDirections[0] == "X" {
			t.Fatal("expected original directions slice to remain unchanged")
		}
	})

	t.Run("default options vary by puzzle type", func(t *testing.T) {
		crosswordDefaults := defaultOptionsForPuzzleType(puzzleTypeCrossword)
		if len(crosswordDefaults) != 0 {
			t.Fatalf("expected empty crossword defaults, got %#v", crosswordDefaults)
		}

		wordSearchDefaults := defaultOptionsForPuzzleType(puzzleTypeWordSearch)
		directions, ok := wordSearchDefaults["directions"].([]string)
		if !ok {
			t.Fatalf("expected []string directions, got %#v", wordSearchDefaults["directions"])
		}
		if len(directions) != len(wordSearchDirections) {
			t.Fatalf("expected %d directions, got %d", len(wordSearchDirections), len(directions))
		}
	})

	t.Run("marshal puzzle options covers defaults and fallback", func(t *testing.T) {
		defaultJSON := marshalPuzzleOptions(nil, puzzleTypeWordSearch)
		var defaultOptions map[string][]string
		if err := json.Unmarshal([]byte(defaultJSON), &defaultOptions); err != nil {
			t.Fatalf("Unmarshal(defaultJSON): %v", err)
		}
		if len(defaultOptions["directions"]) != len(wordSearchDirections) {
			t.Fatalf("expected default directions, got %#v", defaultOptions)
		}

		customJSON := marshalPuzzleOptions(map[string]any{"difficulty": "hard"}, puzzleTypeCrossword)
		if customJSON != `{"difficulty":"hard"}` {
			t.Fatalf("unexpected custom JSON %q", customJSON)
		}

		fallbackJSON := marshalPuzzleOptions(map[string]any{"broken": func() {}}, puzzleTypeCrossword)
		if fallbackJSON != `{}` {
			t.Fatalf("expected fallback crossword defaults, got %q", fallbackJSON)
		}
	})

	t.Run("parse puzzle options covers defaults and valid payloads", func(t *testing.T) {
		if got := parsePuzzleOptions("", puzzleTypeCrossword); len(got) != 0 {
			t.Fatalf("expected blank crossword defaults, got %#v", got)
		}
		if got := parsePuzzleOptions("{", puzzleTypeCrossword); len(got) != 0 {
			t.Fatalf("expected invalid crossword JSON to fall back, got %#v", got)
		}
		if got := parsePuzzleOptions("null", puzzleTypeCrossword); len(got) != 0 {
			t.Fatalf("expected null crossword JSON to fall back, got %#v", got)
		}

		wordSearchDefaults := parsePuzzleOptions("", puzzleTypeWordSearch)
		if len(wordSearchDefaults["directions"].([]string)) != len(wordSearchDirections) {
			t.Fatalf("expected word-search defaults, got %#v", wordSearchDefaults)
		}
		if got := parsePuzzleOptions(`{"directions":"E"}`, puzzleTypeWordSearch); len(got["directions"].([]string)) != len(wordSearchDirections) {
			t.Fatalf("expected invalid directions type to fall back, got %#v", got)
		}
		if got := parsePuzzleOptions(`{"directions":["", "   "]}`, puzzleTypeWordSearch); len(got["directions"].([]string)) != len(wordSearchDirections) {
			t.Fatalf("expected blank directions to fall back, got %#v", got)
		}

		validWordSearchOptions := parsePuzzleOptions(`{"directions":["E"," SW ","N"]}`, puzzleTypeWordSearch)
		validDirections := validWordSearchOptions["directions"].([]string)
		if len(validDirections) != 3 || validDirections[1] != "SW" {
			t.Fatalf("expected cleaned directions, got %#v", validDirections)
		}

		crosswordOptions := parsePuzzleOptions(`{"difficulty":"hard"}`, puzzleTypeCrossword)
		if crosswordOptions["difficulty"] != "hard" {
			t.Fatalf("expected crossword options to round-trip, got %#v", crosswordOptions)
		}
	})
}
