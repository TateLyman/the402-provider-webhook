# the402 Fulfillment Runbook

This runbook is for paid human-service dispatches from the402.

## Intake

When a job arrives, the Worker should:

- verify the platform secret and webhook signature;
- acknowledge the event quickly;
- mark the job `in_progress` through the callback URL;
- notify the operator through `NOTIFY_WEBHOOK_URL` if configured.

Record the following before doing any work:

- service name and service id;
- thread id or job id;
- callback URL;
- buyer contact or reply channel;
- submitted target URL, repo URL, PR URL, or route list;
- authorized scope;
- delivery deadline.

## Service Scopes

### x402 Launch Re-check, $49, 24h

Use for one public endpoint, manifest, docs page, registry PR, or post-fix route set.

Deliver:

- pass/fail summary;
- remaining blockers, if any;
- concise before/after evidence;
- optional public wording only if the buyer wants it.

### x402 Launch Review, $149, 48h

Use for one project surface with multiple public routes or docs.

Deliver:

- spend map;
- evidence table;
- payment challenge and route consistency notes;
- browser/CORS/cache posture;
- patch order.

### x402 Fix Sprint, $299, 72h

Use only when the buyer owns the repo or has explicit authorization to change it.

Deliver:

- branch or PR link;
- changes summary;
- verification commands;
- one follow-up re-check.

## Review Rules

Default to no-payment external checks:

```bash
npx --yes x402-surface-check@latest <manifest-or-openapi-url> --limit 12 --origin <origin>
npx --yes x402-surface-check@latest --endpoint --method POST <endpoint-url> --origin <origin>
```

Do not send payment headers, wallet signatures, credentials, or paid calls unless the buyer explicitly provides a safe test fixture and authorization.

Keep suspected bypasses, auth weaknesses, or sensitive exploit details private to the buyer.

## Completion

Reply through the402 callback or thread with:

- what was checked;
- what changed or what remains blocked;
- exact commands or URLs used for verification;
- the final deliverable text or report URL.

Only mark a job complete when the deliverable is attached or pasted into the buyer-visible thread.
