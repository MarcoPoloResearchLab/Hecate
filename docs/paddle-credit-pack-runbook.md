# Paddle Credit-Pack Runbook

## Purpose

Use this runbook when configuring Paddle for one-time Hecate credit packs.

The app expects:

- one active billing provider: `paddle`
- one approved Paddle default payment link URL on the Hecate domain
- browser checkout opened directly from the app by transaction id
- webhook-driven credit settlement only

## Required Dashboard Setup

1. Create one Paddle price for each pack in `configs/config.yml`:
   - `starter`
   - `creator`
   - `publisher`
2. In Paddle `Checkout -> Checkout settings`, set the default payment link to any approved crossword URL:
   - local tunnel: `https://<your-public-host>/`
   - hosted: `https://llm-crossword.mprlab.com/`
   - Paddle requires this to create transactions, even though the app opens checkout directly by transaction id.
3. Create one webhook destination per environment:
   - sandbox: `https://<your-public-host>/api/billing/paddle/webhook`
   - production: `https://llm-crossword-api.mprlab.com/api/billing/paddle/webhook`
4. Subscribe the webhook destination to:
   - `transaction.created`
   - `transaction.updated`
   - `transaction.completed`
5. Keep sandbox and production secrets separate.

## Required Env Vars

Set these in the Hecate API profile file you are using, typically [configs/.env.hecateapi.local](/Users/tyemirov/Development/llm_crossword/configs/.env.hecateapi.local) for local work or [configs/.env.hecateapi.production](/Users/tyemirov/Development/llm_crossword/configs/.env.hecateapi.production) for production:

- `HECATEAPI_BILLING_PROVIDER=paddle`
- `HECATEAPI_PADDLE_ENVIRONMENT=sandbox|production`
- `HECATEAPI_PADDLE_API_KEY`
- `HECATEAPI_PADDLE_CLIENT_TOKEN`
- `HECATEAPI_PADDLE_WEBHOOK_SECRET`
- These must be Paddle `price IDs`, not Paddle product IDs:
- `HECATEAPI_PADDLE_PRICE_ID_PACK_STARTER`
- `HECATEAPI_PADDLE_PRICE_ID_PACK_CREATOR`
- `HECATEAPI_PADDLE_PRICE_ID_PACK_PUBLISHER`

## Startup Validation

`hecate-api` always validates the configured Paddle pack catalog during startup using live Paddle API calls. There is no supported deployment mode without live billing.

Startup fails if:

- the billing provider is missing or unsupported
- any configured pack price ID is missing in Paddle
- a configured price is not a one-time price
- the configured price amount does not match `configs/config.yml`

## Browser Runtime

Run:

```bash
cd /Users/tyemirov/Development/llm_crossword
./scripts/render-runtime-auth-config.sh
```

The generated runtime config only exposes browser-safe values:

- public service URLs
- Paddle environment
- Paddle client token

It must never expose:

- API keys
- webhook secrets

The generated file contains localhost and hosted profiles, and the browser selects the matching one from the current serving host.

## Local Sandbox

1. Start the Hecate stack with sandbox billing env vars.
2. If `BILLING_CALLBACK_PUBLIC_URL` is unset, `make up` will start an `ngrok` tunnel for the local site and write the resolved public callback origin to `.runtime/ports.env`.
3. If you do not want automatic tunneling, set `BILLING_CALLBACK_PUBLIC_URL=https://<your-public-host>` yourself before `make up`.
4. Point Paddle sandbox webhook delivery at `<callback-origin>/api/billing/paddle/webhook`.
5. Point the Paddle default payment link at `<callback-origin>/`.

## Smoke Test

1. Sign in and open the generator.
2. Click the header credit badge or exhaust credits and click `Buy credits`.
3. Confirm Settings -> Account shows pack cards and billing activity.
4. Start checkout and verify the app stays on the Hecate page while the Paddle overlay opens.
5. Complete a sandbox payment.
6. Verify the header badge and Settings activity update after the webhook lands.

## Failure Map

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Checkout fails with `transaction_default_checkout_url_not_set` | Paddle default payment link is missing | Configure any approved default payment link URL in Paddle Checkout settings. |
| Webhook returns `401` | wrong webhook secret or wrong environment | Match `HECATEAPI_PADDLE_ENVIRONMENT` and the environment-specific webhook secret. |
| Credits never arrive after payment | webhook destination is not public HTTPS or not subscribed to `transaction.completed` | Fix the destination URL and enabled events. |
| API fails during startup with a catalog validation error | Paddle price IDs or amounts do not match the configured packs | Fix the Paddle catalog or the configured `HECATEAPI_PADDLE_PRICE_ID_PACK_*` values, then restart. |
| The app shows packs but no Paddle modal opens | missing client token, wrong sandbox/production runtime config, or unsupported local callback/payment-link setup | Re-run `./scripts/render-runtime-auth-config.sh` with the correct env vars, confirm `GET /api/billing/summary` returns `client_token` plus `environment`, and confirm local sandbox has a public HTTPS callback/default-link origin. |
| Paddle overlay opens and immediately shows an error | the transaction was rejected upstream or the environment/token pair does not match | Confirm the live runtime config, the transaction environment, and the Paddle account settings match. |
