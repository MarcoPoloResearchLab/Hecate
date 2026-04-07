# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## [v0.2.0] - 2026-04-07

### Features ✨
- Enforce that every deployment accepts live payments for configured credit packs before startup.
- Added reusable test helpers for config and environment setup to improve testing consistency.

### Improvements ⚙️
- Refactored many tests to use common environment and config setup helpers, reducing duplication.
- Updated README to clarify local stack build details and introduce core documentation links.
- Enhanced environment variable coverage in tests for better configuration validation.
- Improved billing service initialization to error on missing or unsupported billing providers.

### Bug Fixes 🐛
- Fixed potential nil-pointer panic by adding checks in billing service methods.
- Addressed billing service availability errors and added appropriate error handling semantics.

### Testing 🧪
- Extensive test refactors in backend, including coverage tests, integration tests, and command tests.
- Added new test to verify loading of empty app config returns empty but valid results.
- Tests now consistently set required billing-related environment variables.

### Docs 📚
- Expanded architecture and runbook documentation.
- Updated README with detailed notes on billing requirements and deployment constraints.
- Added links to major docs including PRD, architecture, and Paddle Credit-Pack runbook.

## [v0.1.6] - 2026-04-06

### Features ✨
- Remove legacy auth-pending logic and integrate authentication state management with mpr-ui config handling.
- Migrate app configuration to use mpr-ui's dynamic YAML config loader and runtime bundle.

### Improvements ⚙️
- Simplify auth state management by syncing with the new managed header attributes and mpr-ui auth events.
- Update frontend-config.yml to point to new tauth API URL.
- Revamp application initialization scripts to load and apply mpr-ui configs with proper error handling.
- Modernize UI header scripts to utilize mpr-ui's built-in authentication lifecycle events.
- Clean up obsolete session verification and retry logic for authentication state restoration.

### Bug Fixes 🐛
- Fix auth state inconsistencies by removing duplicated persisted storage and manual session validation.
- Resolve race conditions in authentication flow by deferring auth state sync to mpr-ui orchestration events.

### Testing 🧪
- _No changes._

### Docs 📚
- _No changes._

## [v0.1.5] - 2026-04-05

### Features ✨
- Simplify billing sync handler branch mapping for clearer processing.
- Make crossword credit economy configurable for flexible gameplay.

### Improvements ⚙️
- Normalize billing sync response handling to improve consistency.
- Harden Paddle billing reconciliation to enhance reliability.
- Move local profile templates under configs for better organization.
- Load frontend auth config from a dedicated YAML file.
- Remove backend public config route to tighten security.
- Set Paddle sandbox billing defaults for testing environments.
- Migrate workflow guidance documentation from `.mprl` to `.mprlab`.
- Document the frontend and backend config split to clarify deployment.

### Bug Fixes 🐛
- Retry processProviderEvent after unresolved grant recipient to prevent data loss.
- Fix billing handler handling of race conditions and error states.

### Testing 🧪
- Expand crossword test coverage for rewards and edge scenarios.
- Add extensive coverage tests for billing service, API, and server behavior.
- Enhance targeted verification tests in backend and frontend Playwright suites to maintain 100% coverage.

### Docs 📚
- Updated workflow guidance and integration docs under `.mprlab/`.
- Revise README and related config documentation to reflect updated config topology and deployment defaults.

## [v0.1.4] - 2026-03-31

### Features ✨
- Add mandatory ledger secret key for per-RPC authentication to enhance security

### Improvements ⚙️
- Require ledger secret key in configuration validation
- Pass ledger secret key as authorization bearer token for gRPC requests
- Add new flag and environment variable support for ledger secret key configuration
- Update docker-compose environment to set default ledger secret key

### Bug Fixes 🐛
- _No changes._

### Testing 🧪
- Add tests for ledger bearer authentication metadata and transport security
- Include ledger secret key in unit, integration, and coverage tests for coverage

### Docs 📚
- _No changes._

## [v0.1.3] - 2026-03-31

### Features ✨
- Replace share button arrow with Bootstrap Icons for consistent UI.
- Hide the share button when disabled to reduce clutter.

### Improvements ⚙️
- Update tenant ID to "crossword" in configuration and test setups.
- Load Bootstrap Icons stylesheet from CDN.
- Adjust E2E tests to match UI changes for share button.

### Bug Fixes 🐛
- Correct share button icon updates in app logic using innerHTML.

### Testing 🧪
- Refine E2E tests to verify share button visibility and icon updates.
- Validate tenant header wiring in isolated script tests.

### Docs 📚
- _No changes._

## [v0.1.2] - 2026-03-31

### Features ✨
- _No changes._

### Improvements ⚙️
- Updated default TAuth URLs to use `https://tauth-api.mprlab.com` as auth base URL.
- Changed default `tauth.js` CDN fallback to a pinned CDN URL for better reliability.
- Enhanced runtime configuration script to default `tauth.js` to the pinned CDN helper when unset.

### Bug Fixes 🐛
- _No changes._

### Testing 🧪
- _No changes._

### Docs 📚
- Clarified environment variable descriptions regarding TAuth URLs and script overrides.
- Updated documentation with new default URLs for production deployments.

## [v0.1.1] - 2026-03-31

### Features ✨
- Expand environment variables (e.g. `${GOOGLE_CLIENT_ID}`) in `config.yml` before serving and loading in Go backend.
- Added error handling for missing environment variables during configuration expansion.

### Improvements ⚙️
- Updated public config endpoint to serve expanded YAML with environment variables replaced.
- Cleaned up runtime auth config rendering script, removing embedded Google client ID and related resolution logic.
- Updated README and sample configs to document environment variable expansion in config file.

### Bug Fixes 🐛
- Fail startup or config load gracefully if required environment variables are missing.
- Prevent invalid config serving by expanding and validating env vars in config YAML.

### Testing 🧪
- Added tests for environment variable expansion in config file loading.
- Added tests for public config endpoint behavior with environment variable interpolation and error on missing vars.

### Docs 📚
- Clarified environment variable usage in `README.md` auth config section.
- Documented config file env var expansion behavior in `configs/config.yml`.

## [v0.1.0] - 2026-03-31

### Features ✨
- Add LLM-powered crossword generation with authentication and credit system
- Implement puzzle persistence with GORM + SQLite and share links
- Support split-origin service URLs and unify API URL construction
- Add admin panel with user management, credit granting, and audit tools
- Add multi-arch Docker image publishing to GHCR
- Add responsive crossword layout and controls for small screens

### Improvements ⚙️
- Improve session restore and tenant-aware authentication plumbing
- Refine crossword layout and improve compactness with weighted scoring
- Enhance billing UX and header puzzle controls
- Add credits and billing backend APIs with refunds on generation failure
- Add test coverage enforcement and improve CI environment profiles

### Bug Fixes 🐛
- Fix crossword grid layout and empty space issues
- Correct billing checkout return URLs and credit checks
- Fix theme toggle, login flow, and staticcheck lint warnings
- Resolve clue layout and hint toggle usability bugs

### Testing 🧪
- Add comprehensive test suite with 100% coverage including Playwright E2E tests
- Add blackbox integration tests with docker orchestration
- Refactor E2E tests to use route-based mocking via shared helpers
- Add regression tests for view state and content clipping

### Docs 📚
- Document legal and illustration integration updates
- Add user guide and integration documentation
- Maintain changelogs with contributions and issue planning notes
