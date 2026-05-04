package crosswordapi

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func openRawStoreDB(t *testing.T, dsn string) *gorm.DB {
	t.Helper()

	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("gorm.Open(%q): %v", dsn, err)
	}
	if err := db.AutoMigrate(&Puzzle{}, &PuzzleItem{}, &UserProfile{}, &AdminGrantRecord{}); err != nil {
		t.Fatalf("AutoMigrate(%q): %v", dsn, err)
	}
	return db
}

func TestOpenDatabase_InvalidDSN(t *testing.T) {
	_, err := OpenDatabase(t.TempDir())
	if err == nil {
		t.Fatal("expected invalid dsn error")
	}
}

func TestOpenDatabase_AutoMigrateError(t *testing.T) {
	path := filepath.Join(t.TempDir(), "readonly.db")
	if err := os.WriteFile(path, []byte{}, 0o644); err != nil {
		t.Fatalf("WriteFile(%q): %v", path, err)
	}

	_, err := OpenDatabase(fmt.Sprintf("file:%s?mode=ro", path))
	if err == nil {
		t.Fatal("expected automigrate error")
	}
}

func TestOpenDatabase_BackfillsMissingShareToken(t *testing.T) {
	path := filepath.Join(t.TempDir(), "backfill.db")
	setupDB := openRawStoreDB(t, path)

	legacyPuzzle := Puzzle{
		ID:         "legacy-puzzle",
		UserID:     "user-1",
		Title:      "Legacy Puzzle",
		ShareToken: "",
	}
	if err := setupDB.Create(&legacyPuzzle).Error; err != nil {
		t.Fatalf("create legacy puzzle: %v", err)
	}

	store, err := OpenDatabase(path)
	if err != nil {
		t.Fatalf("OpenDatabase(%q): %v", path, err)
	}

	persistedStore, ok := store.(*gormStore)
	if !ok {
		t.Fatalf("expected *gormStore, got %T", store)
	}

	var persisted Puzzle
	if err := persistedStore.db.First(&persisted, "id = ?", legacyPuzzle.ID).Error; err != nil {
		t.Fatalf("query persisted puzzle: %v", err)
	}
	if persisted.ShareToken == "" {
		t.Fatal("expected share token backfill")
	}
}

func TestOpenDatabase_BackfillsPuzzleMetadataDefaults(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy-metadata.db")
	setupDB := openRawStoreDB(t, path)

	crosswordLegacy := Puzzle{
		ID:            "legacy-crossword",
		UserID:        "user-1",
		Title:         "Legacy Crossword",
		ShareToken:    "shared-crossword",
		PuzzleType:    "",
		LayoutSeed:    "",
		LayoutVersion: 0,
		OptionsJSON:   "",
	}
	wordSearchLegacy := Puzzle{
		ID:            "legacy-word-search",
		UserID:        "user-2",
		Title:         "Legacy Word Search",
		ShareToken:    "shared-word-search",
		PuzzleType:    puzzleTypeWordSearch,
		LayoutSeed:    "",
		LayoutVersion: 0,
		OptionsJSON:   "",
	}

	if err := setupDB.Create(&crosswordLegacy).Error; err != nil {
		t.Fatalf("create legacy crossword: %v", err)
	}
	if err := setupDB.Create(&wordSearchLegacy).Error; err != nil {
		t.Fatalf("create legacy word search: %v", err)
	}
	if err := setupDB.Exec(
		`UPDATE puzzles SET share_token = ?, puzzle_type = '', layout_seed = '', layout_version = 0, options_json = '' WHERE id = ?`,
		crosswordLegacy.ShareToken,
		crosswordLegacy.ID,
	).Error; err != nil {
		t.Fatalf("downgrade legacy crossword fields: %v", err)
	}
	if err := setupDB.Exec(
		`UPDATE puzzles SET share_token = ?, puzzle_type = ?, layout_seed = '', layout_version = 0, options_json = '' WHERE id = ?`,
		wordSearchLegacy.ShareToken,
		string(puzzleTypeWordSearch),
		wordSearchLegacy.ID,
	).Error; err != nil {
		t.Fatalf("downgrade legacy word search fields: %v", err)
	}

	store, err := OpenDatabase(path)
	if err != nil {
		t.Fatalf("OpenDatabase(%q): %v", path, err)
	}

	persistedStore := store.(*gormStore)
	var persistedCrossword Puzzle
	if err := persistedStore.db.First(&persistedCrossword, "id = ?", crosswordLegacy.ID).Error; err != nil {
		t.Fatalf("query persisted crossword: %v", err)
	}
	if persistedCrossword.PuzzleType != puzzleTypeCrossword {
		t.Fatalf("expected crossword puzzle type, got %q", persistedCrossword.PuzzleType)
	}
	if persistedCrossword.LayoutVersion != currentLayoutVersion {
		t.Fatalf("expected layout version %d, got %d", currentLayoutVersion, persistedCrossword.LayoutVersion)
	}
	if persistedCrossword.LayoutSeed != crosswordLegacy.ShareToken {
		t.Fatalf("expected layout seed %q, got %q", crosswordLegacy.ShareToken, persistedCrossword.LayoutSeed)
	}
	if persistedCrossword.OptionsJSON != "{}" {
		t.Fatalf("expected crossword options {}, got %q", persistedCrossword.OptionsJSON)
	}

	var persistedWordSearch Puzzle
	if err := persistedStore.db.First(&persistedWordSearch, "id = ?", wordSearchLegacy.ID).Error; err != nil {
		t.Fatalf("query persisted word search: %v", err)
	}
	if persistedWordSearch.LayoutSeed != wordSearchLegacy.ShareToken {
		t.Fatalf("expected word-search layout seed %q, got %q", wordSearchLegacy.ShareToken, persistedWordSearch.LayoutSeed)
	}
	if persistedWordSearch.LayoutVersion != currentLayoutVersion {
		t.Fatalf("expected word-search layout version %d, got %d", currentLayoutVersion, persistedWordSearch.LayoutVersion)
	}
	if !strings.Contains(persistedWordSearch.OptionsJSON, `"directions"`) {
		t.Fatalf("expected word-search options JSON with directions, got %q", persistedWordSearch.OptionsJSON)
	}
}

func TestPuzzlePersistenceDefaults(t *testing.T) {
	t.Run("apply runtime defaults uses share token and id fallbacks", func(t *testing.T) {
		puzzle := &Puzzle{
			ID:            "puzzle-id",
			ShareToken:    "",
			PuzzleType:    "",
			LayoutSeed:    "",
			LayoutVersion: 0,
			OptionsJSON:   "",
		}

		applyPuzzleRuntimeDefaults(puzzle)

		if puzzle.PuzzleType != puzzleTypeCrossword {
			t.Fatalf("expected crossword default type, got %q", puzzle.PuzzleType)
		}
		if puzzle.LayoutSeed != "puzzle-id" {
			t.Fatalf("expected id fallback layout seed, got %q", puzzle.LayoutSeed)
		}
		if puzzle.LayoutVersion != currentLayoutVersion {
			t.Fatalf("expected layout version %d, got %d", currentLayoutVersion, puzzle.LayoutVersion)
		}
		if puzzle.OptionsJSON != "{}" {
			t.Fatalf("expected default options json, got %q", puzzle.OptionsJSON)
		}
	})

	t.Run("prepare puzzle for persist applies defaults and preserves provided values", func(t *testing.T) {
		crossword := &Puzzle{}
		preparePuzzleForPersist(crossword)
		if crossword.PuzzleType != puzzleTypeCrossword {
			t.Fatalf("expected crossword default type, got %q", crossword.PuzzleType)
		}
		if crossword.LayoutSeed == "" {
			t.Fatal("expected generated layout seed")
		}
		if crossword.LayoutVersion != currentLayoutVersion {
			t.Fatalf("expected crossword layout version %d, got %d", currentLayoutVersion, crossword.LayoutVersion)
		}
		if crossword.OptionsJSON != "{}" {
			t.Fatalf("expected crossword options {}, got %q", crossword.OptionsJSON)
		}

		wordSearch := &Puzzle{
			PuzzleType:    puzzleTypeWordSearch,
			LayoutSeed:    "provided-seed",
			LayoutVersion: 7,
			Options: map[string]any{
				"directions": []string{"E", "S"},
			},
		}
		preparePuzzleForPersist(wordSearch)
		if wordSearch.LayoutSeed != "provided-seed" {
			t.Fatalf("expected provided layout seed, got %q", wordSearch.LayoutSeed)
		}
		if wordSearch.LayoutVersion != 7 {
			t.Fatalf("expected preserved layout version, got %d", wordSearch.LayoutVersion)
		}
		if !strings.Contains(wordSearch.OptionsJSON, `"directions":["E","S"]`) {
			t.Fatalf("expected serialized directions, got %q", wordSearch.OptionsJSON)
		}
	})
}

func TestUpsertUserProfile_NilAndEmptyUserID(t *testing.T) {
	store := testStore(t).(*gormStore)

	if err := store.UpsertUserProfile(nil); err != nil {
		t.Fatalf("UpsertUserProfile(nil) error = %v", err)
	}
	if err := store.UpsertUserProfile(&UserProfile{}); err != nil {
		t.Fatalf("UpsertUserProfile(empty) error = %v", err)
	}

	users, err := store.ListAdminUsers()
	if err != nil {
		t.Fatalf("ListAdminUsers() error = %v", err)
	}
	if len(users) != 0 {
		t.Fatalf("expected no users, got %v", users)
	}
}

func TestUpsertUserProfile_UpdatesExistingProfile(t *testing.T) {
	store := testStore(t).(*gormStore)
	firstSeenAt := time.Date(2025, time.January, 2, 3, 4, 5, 0, time.UTC)
	secondSeenAt := time.Date(2026, time.February, 3, 4, 5, 6, 0, time.UTC)

	if err := store.UpsertUserProfile(&UserProfile{
		UserID:      "user-1",
		Email:       "first@example.com",
		DisplayName: "First",
		AvatarURL:   "https://example.com/first.png",
		LastSeenAt:  firstSeenAt,
	}); err != nil {
		t.Fatalf("initial UpsertUserProfile: %v", err)
	}

	if err := store.UpsertUserProfile(&UserProfile{
		UserID:      "user-1",
		Email:       "updated@example.com",
		DisplayName: "Updated",
		AvatarURL:   "https://example.com/updated.png",
		LastSeenAt:  secondSeenAt,
	}); err != nil {
		t.Fatalf("second UpsertUserProfile: %v", err)
	}

	var persisted UserProfile
	if err := store.db.First(&persisted, "user_id = ?", "user-1").Error; err != nil {
		t.Fatalf("query user profile: %v", err)
	}
	if persisted.Email != "updated@example.com" {
		t.Fatalf("expected updated email, got %q", persisted.Email)
	}
	if persisted.DisplayName != "Updated" {
		t.Fatalf("expected updated display name, got %q", persisted.DisplayName)
	}
	if !persisted.LastSeenAt.Equal(secondSeenAt) {
		t.Fatalf("expected updated last_seen_at %v, got %v", secondSeenAt, persisted.LastSeenAt)
	}
}

func TestGetUserProfileByEmail_Coverage(t *testing.T) {
	store := testStore(t).(*gormStore)
	if err := store.UpsertUserProfile(&UserProfile{
		UserID:      "user-lookup",
		Email:       "Lookup@Example.com",
		DisplayName: "Lookup User",
		LastSeenAt:  time.Date(2026, time.March, 30, 9, 0, 0, 0, time.UTC),
	}); err != nil {
		t.Fatalf("UpsertUserProfile() error = %v", err)
	}

	profile, err := store.GetUserProfileByEmail(" lookup@example.com ")
	if err != nil {
		t.Fatalf("GetUserProfileByEmail(success) error = %v", err)
	}
	if profile.UserID != "user-lookup" {
		t.Fatalf("unexpected looked up profile %#v", profile)
	}

	_, err = store.GetUserProfileByEmail("missing@example.com")
	if err == nil {
		t.Fatal("expected missing user profile lookup to fail")
	}
}

func TestListAdminUsers_DatabaseError(t *testing.T) {
	store := testStore(t).(*gormStore)
	if err := store.db.Migrator().DropTable(&UserProfile{}); err != nil {
		t.Fatalf("DropTable(UserProfile): %v", err)
	}

	_, err := store.ListAdminUsers()
	if err == nil {
		t.Fatal("expected list admin users error")
	}
}

func TestCreateAdminGrantRecord_NilRecord(t *testing.T) {
	store := testStore(t).(*gormStore)
	if err := store.CreateAdminGrantRecord(nil); err != nil {
		t.Fatalf("CreateAdminGrantRecord(nil) error = %v", err)
	}
}

func TestListAdminGrantRecords_DefaultLimit(t *testing.T) {
	store := testStore(t).(*gormStore)

	for index := 0; index < 25; index++ {
		if err := store.CreateAdminGrantRecord(&AdminGrantRecord{
			AdminUserID:  "admin-1",
			AdminEmail:   "admin@example.com",
			TargetUserID: "target-user",
			TargetEmail:  "target@example.com",
			AmountCoins:  int64(index + 1),
			Reason:       fmt.Sprintf("grant-%02d", index),
			CreatedAt:    time.Date(2026, time.January, index+1, 0, 0, 0, 0, time.UTC),
		}); err != nil {
			t.Fatalf("CreateAdminGrantRecord(%d): %v", index, err)
		}
	}

	records, err := store.ListAdminGrantRecords("target-user", 0)
	if err != nil {
		t.Fatalf("ListAdminGrantRecords() error = %v", err)
	}
	if len(records) != 20 {
		t.Fatalf("expected default limit of 20, got %d", len(records))
	}
	if records[0].Reason != "grant-24" {
		t.Fatalf("expected descending order, got %q", records[0].Reason)
	}
}

func TestListAdminGrantRecords_DatabaseError(t *testing.T) {
	store := testStore(t).(*gormStore)
	if err := store.db.Migrator().DropTable(&AdminGrantRecord{}); err != nil {
		t.Fatalf("DropTable(AdminGrantRecord): %v", err)
	}

	_, err := store.ListAdminGrantRecords("target-user", 20)
	if err == nil {
		t.Fatal("expected list grant records error")
	}
}

func TestDeletePuzzle_DeleteWordFailure(t *testing.T) {
	store := testStore(t).(*gormStore)
	puzzle := &Puzzle{
		UserID: "user-1",
		Title:  "Delete word failure",
		Items:  []PuzzleItem{{Word: "TOKEN", Clue: "Word", Hint: "Hint"}},
	}
	if err := store.CreatePuzzle(puzzle); err != nil {
		t.Fatalf("CreatePuzzle: %v", err)
	}
	if err := store.db.Migrator().DropTable(&PuzzleItem{}); err != nil {
		t.Fatalf("DropTable(PuzzleItem): %v", err)
	}

	err := store.DeletePuzzle(puzzle.ID, "user-1")
	if err == nil {
		t.Fatal("expected delete error when puzzle words table is missing")
	}
}
