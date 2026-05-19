# Tate Programs the402 Provider Webhook

Cloudflare Worker webhook for Tate Programs services listed on the402:

- `$49` x402 Launch Re-check
- `$149` x402 Launch Review
- `$299` x402 Fix Sprint

These are human-fulfilled, escrowed services for x402, Pay.sh, MCP, and agent-payment launch surfaces.

## Routes

- `GET https://the402.tateprograms.com/health` returns a no-store health check.
- `POST https://the402.tateprograms.com/webhook/the402` receives provider events from the402.
- `POST https://the402.tateprograms.com/api/x402/triage` and `/api/x402/index-watch` are paid x402 APIs.
  They always advertise Solana mainnet USDC and add a Base mainnet USDC accept leg when `BASE_PAY_TO` is configured.

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

Do not commit platform API keys, webhook secrets, wallet recovery data, or customer payloads.
