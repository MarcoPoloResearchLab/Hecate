# LLM Crossword Architecture

## System Overview

LLM Crossword is a split-origin browser application backed by the Go `hecate-api`, TAuth for authentication, Ledger for credits, and Paddle for payment processing. Billing is a required subsystem, not an optional integration.

## Startup Contract

`hecate-api` must complete this sequence before it can accept traffic:

1. Load config and validate the required billing provider, pack definitions, and Paddle credentials.
2. Construct the billing service and provider.
3. Validate the configured billing pack catalog against the live Paddle catalog.
4. Start HTTP serving only after the billing preflight succeeds.

If any step fails, startup fails and the process exits. There is no supported startup path that serves the app without a working payment processor and matching product catalog.

## Billing Architecture

- `configs/config.yml` defines the canonical billing packs and credit economy.
- Paddle is the single supported billing provider for this product shape.
- The browser receives only public Paddle runtime config.
- Checkout creates a provider-backed transaction id and opens Paddle’s overlay directly from the browser via the Paddle CDN.
- Credits are granted only after webhook-confirmed settlement or reconciliation.
- Billing UI refreshes from backend-owned billing events rather than frontend checkout return state.
- Portal access depends on the persisted billing customer link for the authenticated user.

## UI Contract

- The Settings account view assumes a live billing deployment and renders balance, packs, and billing activity through a single payment-enabled path.
- The UI must not branch into a deployment-disabled billing state.
- When billing calls fail, the UI surfaces an error or empty activity result for the current user session rather than claiming that purchases are disabled for the deployment.

## Operational Invariants

1. Billing is fail-closed at startup and at runtime.
2. Missing provider config, missing catalog entries, mismatched price amounts, or provider unavailability are deployment defects.
3. Billing-critical flows must not use heuristic customer lookup, optimistic unlocks, or alternate disabled-mode UI.
4. Tests must cover startup failure for missing provider configuration and catalog validation failure so the deployment contract stays enforced.
