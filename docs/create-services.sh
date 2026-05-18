#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${THE402_API_KEY:-}" ]]; then
  echo "Set THE402_API_KEY first." >&2
  exit 1
fi

jq -c '.[] | del(.slug)' docs/service-listings.json | while read -r service; do
  curl -fsS -X POST "https://api.the402.ai/v1/services" \
    -H "X-API-Key: ${THE402_API_KEY}" \
    -H "Content-Type: application/json" \
    --data "${service}"
  echo
done
