# LLM crossword

A crossword puzzle builder, powered by LLM.

## Billing Policy

Billing is a business-critical path in this product. The billing flow is intentionally fail-closed.

- Checkout, portal access, webhook processing, reconciliation, and customer-link resolution must use explicitly required billing data.
- Every deployment must be able to accept live payments for configured credit packs before the application is allowed to start.
- Missing or inconsistent billing data is treated as a product or operational defect to fix, not as a reason to guess, infer, or unlock a fallback path.
- Do not add defensive billing fallbacks such as alternate customer lookup heuristics or optimistic UI unlocks for portal access.
- When required billing state is unavailable, the correct behavior is to return an error and keep the path blocked until the underlying issue is corrected.
- `configs/config.yml` is the backend source of truth for billing packs and the credit economy values used for generation, grants, and rewards. Browser-facing auth settings live in `configs/frontend-config.yml`.

## Auth config

Set `GOOGLE_CLIENT_ID` in `configs/.env.tauth.local` for local work and in `configs/.env.tauth.production` for production deployment so TAuth and related tooling use the expected client. Keep backend settings in `configs/config.yml` and browser-facing auth settings in `configs/frontend-config.yml`. The generated `js/runtime-auth-config.js` is the single browser runtime config. It contains browser-safe localhost and hosted profiles, and the browser selects the matching profile from the serving host before the rest of the app bootstraps.

Direct GitHub Pages publishing uses the committed `js/runtime-auth-config.js`. If you intentionally need to regenerate that tracked file, run `bash scripts/render-runtime-auth-config.sh`. The script renders both the localhost profile from `configs/.env.crosswordapi.local` and the hosted profile from `configs/.env.crosswordapi.production` unless you override the hosted env file with `CROSSWORDAPI_ENV_FILE`.

For split-origin deployments, the browser runtime config also supports explicit service URLs:

- `LLM_CROSSWORD_API_BASE_URL` — browser origin for `LLM Crossword API`
- `LLM_CROSSWORD_AUTH_BASE_URL` — browser origin for TAuth auth endpoints
- `LLM_CROSSWORD_CONFIG_URL` — frontend YAML config URL used by the browser
- `LLM_CROSSWORD_TAUTH_SCRIPT_URL` — explicit CDN or alternate `tauth.js` URL override

If these are unset, the localhost runtime profile keeps same-origin browser calls by defaulting API and auth base URLs to `""`, while the hosted runtime profile falls back to the current split-origin production topology. When `LLM_CROSSWORD_CONFIG_URL` is not set, the hosted profile defaults to `/configs/frontend-config.yml`. When `LLM_CROSSWORD_TAUTH_SCRIPT_URL` is unset, runtime config defaults `tauth.js` to the pinned CDN helper.

## GitHub Pages

The repository includes `.nojekyll` so branch-based GitHub Pages publishing can serve the static frontend directly from the repository contents without relying on a Jekyll build step or a Pages Actions workflow.

## Local Docker

Use `make up` to start the stack and `make down` to stop it. If the default site port `8000` or one of the other exposed host ports is already occupied, `make up` automatically picks the next available port and writes the resolved values to `.runtime/ports.env`.

Local Paddle sandbox needs a public HTTPS billing callback even when the app itself runs on `http://localhost`. `make up` now keeps the browser on localhost and resolves the callback origin separately:

- if `BILLING_CALLBACK_PUBLIC_URL` is set, `make up` uses it directly
- otherwise, `make up` will start an `ngrok` tunnel for the local site and record the public callback origin in `.runtime/ports.env`
- if `ngrok` is unavailable, set `BILLING_CALLBACK_PUBLIC_URL=https://<your-public-host>` before starting the stack

Use that callback origin for both:

- Paddle sandbox webhook destination: `<callback-origin>/api/billing/paddle/webhook`
- Paddle default payment link URL: `<callback-origin>/`

The local stack builds only the local `crossword-api` image. Ledger is pulled from `ghcr.io/tyemirov/ledger:latest` and configured locally through `.runtime/ledger.config.yml`; it is not rebuilt from `tools/ledger`.

Billing is required for this app. `crossword-api` enforces that requirement during startup and exits if billing is not fully configured or if Paddle catalog validation fails.

To force a specific host port instead of auto-allocation, pass it explicitly, for example `make up CROSSWORD_PORT=8010`.

## Environment Profiles

Keep localhost and production settings separate.

- `configs/.env.crosswordapi.local`, `configs/.env.tauth.local`, and `tauth.config.local.yaml` are the local Docker inputs used by `make up`.
- `configs/.env.crosswordapi.production`, `configs/.env.tauth.production`, and `tauth.config.production.yaml` are the production profile files.
- `.runtime/config.yml`, `.runtime/public-configs/frontend-config.yml`, `.runtime/tauth.config.yaml`, and `.runtime/ledger.config.yml` are generated local-only artifacts.
- `js/runtime-auth-config.js` is the generated browser runtime config checked into the repo. It contains browser-safe localhost and hosted profiles selected by the current serving host.
- Local and production secret files stay untracked.

For the current production topology:

- frontend origin: `https://llm-crossword.mprlab.com`
- API origin: `https://llm-crossword-api.mprlab.com`
- TAuth auth origin: `https://tauth-api.mprlab.com`
- TAuth script URL: `https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js`

Production deployments should align all three places:

1. browser runtime service URLs
2. crossword API CORS and TAuth base URL
3. TAuth CORS, tenant origins, and cookie domain

Typical production inputs are:

- browser runtime:
  `LLM_CROSSWORD_API_BASE_URL=https://llm-crossword-api.mprlab.com`
  `LLM_CROSSWORD_AUTH_BASE_URL=https://tauth-api.mprlab.com`
  `LLM_CROSSWORD_TAUTH_SCRIPT_URL=https://cdn.jsdelivr.net/gh/tyemirov/TAuth@v1.0.1/web/tauth.js`
- crossword API:
  `CROSSWORDAPI_ALLOWED_ORIGINS=https://llm-crossword.mprlab.com`
  `CROSSWORDAPI_TAUTH_BASE_URL=http://tauth-api:8080`
- TAuth:
  allow `https://llm-crossword.mprlab.com` for credentialed browser traffic
  keep cookie domain `.mprlab.com`
  keep insecure HTTP disabled in hosted TLS deployments

To render browser runtime config against a specific profile, point the script at that profile's env files:

```bash
CROSSWORDAPI_ENV_FILE=configs/.env.crosswordapi.production \
TAUTH_ENV_FILE=configs/.env.tauth.production \
bash scripts/render-runtime-auth-config.sh
```

## Publishing The API Image

Publish the production API image with:

```bash
make publish
```

`make publish` pushes `ghcr.io/marcopoloresearchlab/llm-crossword-api:latest`
as a multi-arch image for `linux/amd64,linux/arm64` using `backend/Dockerfile`.
When `HEAD` is exactly on a git tag, it also pushes the matching version tag.

This is the image name expected by the `mprlab-gateway` deployment contract.

## Core Docs

- [PRD](./docs/prd.md)
- [Architecture](./docs/architecture.md)
- [Paddle Credit-Pack Runbook](./docs/paddle-credit-pack-runbook.md)

## Planning Docs

- [Word Illustration Feature Plan](./docs/word-illustrations-plan.md)

## Using the Crossword

1. Choose a puzzle from the selector at the top of the page. Each puzzle loads with its own grid and clue list.
2. Click any cell and type to fill in letters. Use the arrow keys or the Tab key to move around the grid.
3. Drag the grid with the mouse or touch to pan around large puzzles.
4. Selecting a clue or a cell highlights the entire word and its clue. Solved clues are marked to show progress.
5. Press **Check** to verify your work. Correct letters are highlighted in green, while incorrect letters are marked in red.
6. Press **Reveal** to show all answers. The button toggles to **Hide** so you can return to your previous entries.
7. The status bar provides feedback after checking or revealing answers.

## License

This project is proprietary software. All rights reserved by Marco Polo Research Lab LLC.  
See the [LICENSE](./LICENSE) file for details.
