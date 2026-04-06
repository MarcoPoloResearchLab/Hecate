# AGENTS.md

## Purpose

- This is the only `AGENTS.md` in the repository root.
- Supporting workflow, policy, and stack-specific guidance lives under `.mprlab/`.
- Do not create or keep nested `AGENTS.md` files elsewhere in the repo.

## Read Order

1. `AGENTS.md`
2. `.mprlab/POLICY.md`
3. Relevant stack guides for the files being changed:
   - `.mprlab/AGENTS.FRONTEND.md`
   - `.mprlab/AGENTS.GO.md`
   - `.mprlab/AGENTS.PY.md`
   - `.mprlab/AGENTS.DOCKER.md`
   - `.mprlab/AGENTS.GIT.md`
4. Workflow documents when applicable:
   - `.mprlab/ISSUES.md`
   - `.mprlab/PLANNING.md`
   - `.mprlab/issues-md-format.md`
5. Relevant integration docs and runbooks in `docs/`
6. `README.md`

## Repo Focus

This repository is for **LLM Crossword**, not the allergy-wheel game.

- Frontend: browser-based crossword UI in `index.html`, `pay.html`, `js/*.js`, and `css/crossword.css`
- Backend: Go API in `backend/cmd/crossword-api` and `backend/internal/crosswordapi`
- Auth and service routing: browser runtime config in `js/runtime-auth-config*.js` plus `js/service-config.js`

## Current Deployment Shape

- The browser app may run split-origin.
- The backend is available at `https://llm-crossword-api.mprlab.com`.
- The browser-facing API base should point to `https://llm-crossword-api.mprlab.com` unless a task explicitly changes the runtime override setup.
- TAuth may be hosted separately, so frontend code should use the runtime service config helpers instead of hardcoding same-origin assumptions.

## Execution Contract

- For any implementation, bug fix, refactor, or test-affecting code change, run `make ci` before editing files.
- If the preflight `make ci` fails, stop and report the exact failing step before changing code, unless the task is explicitly to fix CI or the user explicitly says to continue from a red baseline.
- Use targeted verification while iterating, but do not finish the task until post-change `make ci` passes.
- Treat `100%` backend Go coverage and `100%` frontend coverage as binding invariants.
- If logic or behavior changes, add or update tests in the same change.
- Do not claim success or completion unless post-change `make ci` was run and passed.
- Final summaries must state preflight `make ci` status and postflight `make ci` status explicitly.

## Working Rules

### 1. Stay on Product

- Keep work scoped to the crossword generator, puzzle solving UI, auth, sharing, billing, and related backend endpoints.
- Do not replace the app with unrelated demos, games, or alternate products.

### 2. Match Existing Code Style

- Follow the style of the file you touch.
- The current frontend is mostly browser-native JavaScript with IIFEs and `"use strict"`, not an ES-module-only app.
- Prefer descriptive names, small helpers, and shared constants for repeated values.
- Use `Object.freeze` where the existing codebase uses it for config-like structures.

### 3. Service URLs

- Route browser-facing API, auth, config, and script URLs through the runtime service config layer.
- Prefer `window.LLMCrosswordServices.buildApiUrl(...)`, `buildAuthUrl(...)`, `getConfigUrl()`, and `getTauthScriptUrl()` where applicable.
- Preserve split-origin compatibility when changing fetches, redirects, or script/config loading.

### 4. Frontend Boundaries

- Keep DOM orchestration in the browser app files under `js/`.
- Keep auth, bootstrap, and runtime wiring in the existing frontend entrypoints instead of introducing parallel app shells without a clear reason.
- Preserve the current landing page, puzzle view, billing flow, and share flow unless the task explicitly changes them.

### 5. Backend Boundaries

- Keep API behavior in `backend/internal/crosswordapi`.
- Keep CLI and config bootstrapping in `backend/cmd/crossword-api`.
- When changing public endpoints or response shapes, update tests alongside the code.

### 6. Business-Critical Billing Paths

- Treat billing as a fail-closed system. Checkout, portal access, webhook processing, reconciliation, and customer-link resolution are business-critical paths.
- Do not add defensive fallbacks, heuristic recovery, optimistic UI unlocks, or alternate identity guesses on billing-critical paths.
- If required billing data is missing, stale, or inconsistent, the correct behavior is to return an error and leave the path blocked until the underlying issue is fixed.
- Do not bypass persisted billing-customer linkage requirements with email-based or other inferred portal fallbacks unless the product requirements explicitly change.

### 7. Testing

- Frontend/browser coverage lives primarily in Playwright under `tests/e2e`.
- Backend coverage lives in Go tests under `backend/...`.
- Prefer targeted verification while iterating, but `make ci` before and after implementation is mandatory.

### 8. Documentation

- When changing behavior or integrations, inspect the relevant docs in `docs/` before implementing.
- Keep `README.md`, runtime docs, and deployment docs aligned with the actual frontend/backend topology.
- If deployment defaults or integration behavior change, update the related docs in the same change.
