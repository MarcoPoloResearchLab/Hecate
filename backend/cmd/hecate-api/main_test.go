package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MarcoPoloResearchLab/llm-crossword/backend/internal/crosswordapi"
	"github.com/spf13/cobra"
)

func TestNewRootCommand(t *testing.T) {
	cmd := newRootCommand()
	if cmd.Use != "hecate-api" {
		t.Fatalf("expected use 'hecate-api', got %q", cmd.Use)
	}
	if cmd.Short == "" {
		t.Fatal("expected non-empty short description")
	}
	// Verify all flags are registered.
	flags := []string{
		flagListenAddr, flagLedgerAddr, flagLedgerInsecure, flagLedgerTimeout,
		flagDefaultTenant, flagDefaultLedger, flagAllowedOrigins,
		flagJWTSigningKey, flagJWTIssuer, flagJWTCookieName, flagTAuthBaseURL,
		flagLLMProxyURL, flagLLMProxyKey, flagLLMProxyTimeout,
	}
	for _, f := range flags {
		if cmd.Flags().Lookup(f) == nil {
			t.Errorf("missing flag: %s", f)
		}
	}
}

func TestLoadConfig_MissingRequired(t *testing.T) {
	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	// No env vars or flags set — should fail on first required field.
	err := loadConfig(cmd, cfg)
	if err == nil {
		t.Fatal("expected error for missing required fields")
	}
}

func TestLoadConfig_AllSet(t *testing.T) {
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", ":9090")
	t.Setenv("HECATEAPI_DEFAULT_TENANT_ID", "t1")
	t.Setenv("HECATEAPI_DEFAULT_LEDGER_ID", "l1")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "test-key")
	useTestAppConfig(t, "")

	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	if err := loadConfig(cmd, cfg); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.ListenAddr != ":9090" {
		t.Errorf("expected :9090, got %q", cfg.ListenAddr)
	}
	if !cfg.LedgerInsecure {
		t.Error("expected LedgerInsecure true")
	}
	if len(cfg.AllowedOrigins) != 1 || cfg.AllowedOrigins[0] != "http://localhost:8000" {
		t.Errorf("unexpected origins: %v", cfg.AllowedOrigins)
	}
}

func TestLoadConfig_AdminEmailsFromConfigYAML(t *testing.T) {
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", ":9090")
	t.Setenv("HECATEAPI_DEFAULT_TENANT_ID", "t1")
	t.Setenv("HECATEAPI_DEFAULT_LEDGER_ID", "l1")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "test-key")
	useTestAppConfig(t, "administrators:\n  - \"admin@example.com\"\n")

	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	if err := loadConfig(cmd, cfg); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(cfg.AdminEmails) != 1 || cfg.AdminEmails[0] != "admin@example.com" {
		t.Fatalf("unexpected admin emails: %v", cfg.AdminEmails)
	}
}

func TestLoadConfig_AdminEmailsMergeEnvAndConfig(t *testing.T) {
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", ":9090")
	t.Setenv("HECATEAPI_DEFAULT_TENANT_ID", "t1")
	t.Setenv("HECATEAPI_DEFAULT_LEDGER_ID", "l1")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "test-key")
	t.Setenv("HECATEAPI_ADMIN_EMAILS", "env-admin@example.com")
	useTestAppConfig(t, "administrators:\n  - \"file-admin@example.com\"\n")

	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	if err := loadConfig(cmd, cfg); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(cfg.AdminEmails) != 2 {
		t.Fatalf("expected merged admin emails, got %v", cfg.AdminEmails)
	}
	if cfg.AdminEmails[0] != "env-admin@example.com" || cfg.AdminEmails[1] != "file-admin@example.com" {
		t.Fatalf("unexpected merged admin emails: %v", cfg.AdminEmails)
	}
}

func TestLoadConfig_EconomyFromConfigYAML(t *testing.T) {
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", ":9090")
	t.Setenv("HECATEAPI_DEFAULT_TENANT_ID", "t1")
	t.Setenv("HECATEAPI_DEFAULT_LEDGER_ID", "l1")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "test-key")
	configYAML := strings.Join([]string{
		"economy:",
		"  coin_value_cents: 10",
		"  grants:",
		"    bootstrap_credits: 300",
		"    daily_login_credits: 80",
		"    low_balance_floor_credits: 40",
		"  generation:",
		"    cost_credits: 40",
		"  rewards:",
		"    owner_solve_credits: 30",
		"    owner_no_hint_bonus_credits: 10",
		"    owner_daily_solve_bonus_credits: 10",
		"    owner_daily_solve_bonus_limit: 3",
		"    creator_shared_solve_credits: 10",
		"    creator_shared_per_puzzle_cap_credits: 100",
		"    creator_shared_daily_cap_credits: 200",
		"",
	}, "\n")
	useTestAppConfig(t, configYAML)

	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	if err := loadConfig(cmd, cfg); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if cfg.CoinValueCents != 10 || cfg.GenerateCoins != 40 || cfg.BootstrapCoins != 300 {
		t.Fatalf("unexpected configured economy: %#v", cfg)
	}
	if cfg.CreatorSharedPerPuzzleCap != 100 || cfg.CreatorSharedDailyCap != 200 {
		t.Fatalf("unexpected configured reward caps: %#v", cfg)
	}
}

func TestNewRootCommand_ExecuteNoArgs(t *testing.T) {
	// Execute without any env/flags — PreRunE should fail with missing required field.
	cmd := newRootCommand()
	err := cmd.Execute()
	if err == nil {
		t.Fatal("expected error when no config is provided")
	}
}

func TestRun_MissingFlags(t *testing.T) {
	// run() with no env vars or flags should fail because required config is missing.
	code := run()
	if code == 0 {
		t.Fatal("expected non-zero exit code when required flags are missing")
	}
}

func TestRun_SuccessPath(t *testing.T) {
	// Override os.Args to pass --help so Execute() returns nil without running RunE.
	origArgs := os.Args
	os.Args = []string{"hecate-api", "--help"}
	defer func() { os.Args = origArgs }()

	code := run()
	if code != 0 {
		t.Fatalf("expected exit code 0 for --help, got %d", code)
	}
}

func TestRun_RunE_WithEnvVars(t *testing.T) {
	// Set ALL required env vars so PreRunE (loadConfig) succeeds,
	// but use an unreachable ledger address so RunE fails with a connection error.
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", ":0")
	t.Setenv("HECATEAPI_LEDGER_ADDR", "127.0.0.1:1")
	t.Setenv("HECATEAPI_LEDGER_TIMEOUT", "1s")
	t.Setenv("HECATEAPI_ALLOWED_ORIGINS", "http://localhost")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "test-secret-key-long-enough-for-hmac")
	t.Setenv("HECATEAPI_LLM_PROXY_TIMEOUT", "1s")
	useTestAppConfig(t, "")

	// Use newRootCommand directly with a context that has a timeout,
	// so the connection attempt to the unreachable address times out.
	cmd := newRootCommand()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd.SetContext(ctx)

	err := cmd.Execute()
	// Should fail with a connection error (not a config error).
	if err == nil {
		t.Fatal("expected error for unreachable ledger")
	}
	if !strings.Contains(err.Error(), "connect ledger") {
		t.Fatalf("expected connection error, got: %v", err)
	}
}

func TestLoadConfig_BindPFlagError(t *testing.T) {
	// Use a bare cobra.Command with no flags registered.
	// cmd.Flags().Lookup will return nil, causing BindPFlag to panic or error.
	cmd := &cobra.Command{}
	cfg := &crosswordapi.Config{}
	err := loadConfig(cmd, cfg)
	if err == nil {
		t.Fatal("expected error when flags are not registered")
	}
}

func TestLoadAdminEmailsFromConfigPaths(t *testing.T) {
	tempDir := t.TempDir()
	configDir := filepath.Join(tempDir, "configs")
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		t.Fatalf("mkdir configs: %v", err)
	}
	configPath := filepath.Join(configDir, "config.yml")
	if err := os.WriteFile(configPath, []byte("administrators:\n  - \"admin@example.com\"\n"), 0o644); err != nil {
		t.Fatalf("write config.yml: %v", err)
	}

	adminEmails, err := loadAdminEmailsFromConfigPaths([]string{
		filepath.Join(tempDir, "missing.yaml"),
		configPath,
	})
	if err != nil {
		t.Fatalf("loadAdminEmailsFromConfigPaths() error = %v", err)
	}
	if len(adminEmails) != 1 || adminEmails[0] != "admin@example.com" {
		t.Fatalf("unexpected admin emails: %v", adminEmails)
	}
}

func TestLoadConfig_ValidationError(t *testing.T) {
	setRequiredConfigEnv(t)
	t.Setenv("HECATEAPI_LISTEN_ADDR", "   ")
	t.Setenv("HECATEAPI_DEFAULT_TENANT_ID", "t1")
	t.Setenv("HECATEAPI_DEFAULT_LEDGER_ID", "l1")
	t.Setenv("HECATEAPI_ALLOWED_ORIGINS", "http://localhost")
	t.Setenv("HECATEAPI_JWT_SIGNING_KEY", "key")
	t.Setenv("HECATEAPI_JWT_COOKIE_NAME", "sess")
	t.Setenv("HECATEAPI_TAUTH_BASE_URL", "http://localhost")
	t.Setenv("HECATEAPI_LLM_PROXY_URL", "http://localhost")
	t.Setenv("HECATEAPI_LLM_PROXY_KEY", "key")
	useTestAppConfig(t, "")

	cmd := newRootCommand()
	cfg := &crosswordapi.Config{}
	err := loadConfig(cmd, cfg)
	if err == nil {
		t.Fatal("expected validation error for whitespace listen addr")
	}
}
