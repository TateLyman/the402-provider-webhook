# Tate Programs the402 Provider Webhook

Cloudflare Worker webhook for Tate Programs services listed on the402:

- `$49` x402 Launch Re-check
- `$149` x402 Launch Review
- `$299` x402 Fix Sprint

These are human-fulfilled, escrowed services for x402, Pay.sh, MCP, and agent-payment launch surfaces.

## Routes

- `GET https://the402.tateprograms.com/health` returns a no-store health check.
- `GET https://the402.tateprograms.com/webhook/the402` returns a non-secret onboarding/readiness readback for the provider webhook.
- `POST https://the402.tateprograms.com/webhook/the402` receives provider events from the402.
- `GET https://the402.tateprograms.com/.well-known/x402` exposes the public x402 manifest for direct marketplace crawlers and agent-payment directories.
- `POST https://the402.tateprograms.com/api/x402/triage` and `/api/x402/index-watch` are paid x402 APIs.
  They advertise Base mainnet USDC to the known Tate Programs receive address by default.
  Solana is opt-in only when `SOLANA_PAY_TO` is deliberately configured.
  Their unpaid `402` responses include machine-readable `x402Version`, `resource`, `accepts`, and Bazaar discovery metadata in a base64-encoded `Payment-Required` header and a readable JSON body for agent marketplace validators.
  Triage results also include focused attack checks for settlement finality, replay/idempotency, proxy/cache handling, browser payment headers, and discovery-selection risk.
- `GET https://the402.tateprograms.com/.well-known/agent.json` exposes an A2A-style AgentCard for current agent marketplaces and registries.
- `POST https://the402.tateprograms.com/a2a` is a paid JSON-RPC/A2A entrypoint for agent-payment surface triage, x402 index watching, and agent-skill trust checks.
  It uses the same HTTP-layer x402 Base USDC guard as the direct `/api/x402/*` APIs.
- `POST https://the402.tateprograms.com/api/provider/triage` and `/api/provider/index-watch` are proxy-marketplace upstream routes.
  They do not return x402 challenges. Instead, a marketplace such as APIHub can collect buyer payment, inject `X-Tate-Provider-Token`, forward the call, and settle payout through that marketplace.
  Use these only behind a configured `PROVIDER_PROXY_TOKEN`; public x402 buyers should use the `/api/x402/*` routes.
- `POST https://the402.tateprograms.com/api/agent402/triage`, `/api/agent402/index-watch`, and `/api/agent402/skill-trust-check` are Agent402 upstream routes.
  They do not return x402 challenges because Agent402 collects and verifies the buyer payment before forwarding the request.
  Public direct buyers should use the `/api/x402/*` routes instead.

The webhook verifies:

- `X-Platform-Secret` against `THE402_API_KEY` when present.
- `X-Webhook-Signature` and `X-Webhook-Timestamp` against `THE402_WEBHOOK_SECRET`.

It acknowledges promptly, optionally forwards a notification to `NOTIFY_WEBHOOK_URL`, and marks fixed-price jobs as `in_progress` through the platform callback URL.

## Local Checks

```bash
npm install
npm run check
```

## Deploy

```bash
npm install
npx wrangler secret put THE402_API_KEY
npx wrangler secret put THE402_WEBHOOK_SECRET
npx wrangler deploy
```

Optional:

```bash
npx wrangler secret put NOTIFY_WEBHOOK_URL
```

Set a public Base receive address when we want Agentic Market / Base-first x402 directories to validate the paid APIs:

```bash
npx wrangler secret put BASE_PAY_TO
```

Optional Solana support is deliberately disabled unless a controlled settlement wallet is configured:

```bash
npx wrangler secret put SOLANA_PAY_TO
```

Set a private upstream token before listing proxy-marketplace routes:

```bash
npx wrangler secret put PROVIDER_PROXY_TOKEN
```

For APIHub-style provider dashboards:

```text
Base URL: https://the402.tateprograms.com
Endpoint path: /api/provider/triage
Endpoint path: /api/provider/index-watch
Method: POST
Price per request: 10000 microdollars ($0.01)
Upstream auth header: X-Tate-Provider-Token
```

For A2A/A2X-style agent registries:

```text
AgentCard URL: https://the402.tateprograms.com/.well-known/agent.json
Paid endpoint: https://the402.tateprograms.com/a2a
Method: POST
Payment: x402 over HTTP, Base mainnet USDC, $0.01 per call
```

Set the provider webhook URL in the402:

```text
https://the402.tateprograms.com/webhook/the402
```

The Worker is deployed on the custom domain `the402.tateprograms.com`; no `workers.dev` subdomain is required.

## Create Services

After the provider account exists and `THE402_API_KEY` is available locally:

```bash
THE402_API_KEY=sk_... bash docs/create-services.sh
```

## Operations

- Guardian onboarding checklist: `docs/guardian-onboarding-checklist.md`
- Paid-job fulfillment runbook: `docs/fulfillment-runbook.md`

Do not commit platform API keys, webhook secrets, wallet recovery data, or customer payloads.
