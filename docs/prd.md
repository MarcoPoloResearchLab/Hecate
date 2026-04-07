# LLM Crossword PRD

## Product Summary

LLM Crossword sells one-time credit packs that unlock crossword generation and related paid actions in the browser app. The product is not valid in a deployment that cannot accept payments.

## Product Requirements

1. The application must not start unless a supported payment provider is configured and the configured credit-pack catalog is available from that provider.
2. The startup preflight must fail closed when the provider is missing, unreachable, misconfigured, or returns a catalog that does not match `configs/config.yml`.
3. The browser app, account settings, checkout flow, portal flow, webhook flow, and reconciliation flow must assume that payments are live for the deployment.
4. The product must not expose a "billing disabled", "credits unavailable on this deployment", or "packs not configured for this deployment" mode.
5. Credit grants must remain webhook-confirmed and reconciliation-backed. Checkout initiation alone must never unlock credits.
6. If runtime billing data becomes unavailable after startup, the product must return explicit errors and keep billing paths blocked until the underlying issue is fixed.

## User Experience Requirements

1. Signed-in users can view available credit packs in Settings and start checkout.
2. Settings shows billing activity and balance for a live billing deployment, not a deployment-disabled placeholder state.
3. If billing summary or portal calls fail, the UI reports an error state instead of pretending that billing is intentionally unavailable.

## Deployment Requirements

1. Every environment must configure Paddle credentials, webhook secret, client token, and pack price IDs before rollout.
2. Every environment must provide a working Paddle catalog whose one-time prices and amounts match `configs/config.yml`.
3. Deployments that fail the billing preflight are invalid and must not serve traffic.

## Non-Goals

- Supporting a free-only deployment mode that omits payment processing.
- Rendering Settings or billing UI for a deployment that is not able to accept payments.
- Adding fallback billing providers or heuristic recovery paths without an explicit product change.
