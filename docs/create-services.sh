#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${THE402_API_KEY:-}" ]]; then
  echo "Set THE402_API_KEY first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required to create the402 services." >&2
  exit 1
fi

THE402_API_URL="${THE402_API_URL:-https://api.the402.ai/v1/services}"

jq -c '.[]' docs/service-listings.json | while read -r listing; do
  slug="$(jq -r '.slug' <<<"${listing}")"
  name="$(jq -r '.name' <<<"${listing}")"
  service="$(jq -c 'del(.slug)' <<<"${listing}")"

  echo "Creating ${name} (${slug})..."

  response="$(curl -fsS -X POST "${THE402_API_URL}" \
    -H "X-API-Key: ${THE402_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "${service}")"

  jq -r '
    {
      id: (.id // .service_id // null),
      name: (.name // null),
      status: (.status // "created"),
      webhook_url: (.webhook_url // null)
    }
  ' <<<"${response}"
done
