# the402 Guardian Onboarding Checklist

Use this when the402 sends the secure onboarding channel for the Tate Programs provider account.

## Account Holder

Tate is under 18, so the provider account must be operated by a parent or legal guardian.

The parent/legal guardian should be the person who:

- accepts the402 provider terms;
- confirms the payout wallet ownership details required by the402;
- handles any tax/reporting information;
- approves activating the paid provider services.

Do not claim the guardian account-holder step is complete until the parent or legal guardian has actually completed it.

## Provider Details

- Provider name: Tate Programs
- Contact email: hello@tateprograms.com
- Public site: https://tateprograms.com
- Service catalog: https://tateprograms.com/services.json
- Webhook URL: https://the402.tateprograms.com/webhook/the402
- Base payout wallet: 0x7bc5e304ca289823dec021012d6bb361ddf6b368

## Services To Activate

| Service | Price | Delivery |
| --- | ---: | --- |
| x402 Launch Re-check | $49 | 24h |
| x402 Launch Review | $149 | 48h |
| x402 Fix Sprint | $299 | 72h |

## After Credentials Arrive

Store the credentials as Cloudflare Worker secrets:

```bash
npx wrangler secret put THE402_API_KEY
npx wrangler secret put THE402_WEBHOOK_SECRET
```

Then deploy:

```bash
npx wrangler deploy
```

Create the services only after the provider account is active:

```bash
THE402_API_KEY=... bash docs/create-services.sh
```

Never commit API keys, webhook secrets, tax details, wallet recovery data, or customer payloads.
