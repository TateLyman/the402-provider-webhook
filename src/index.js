import { Hono } from "hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_PAY_TO = "2Zfwj9JCmNfkhNxXKouHFMBq4Hb2h3zAa6Togyf8wQev";
const PAID_TRIAGE_PATH = "/api/x402/triage";
const PAYAI_FACILITATOR_URL = "https://facilitator.payai.network";
const INDEX_402_VERIFICATION_HASH = "bc0b0234db538932601eed25e0ee1b333b19eca066f6e6904e774c19a5d1525c";

const ALLOWED_EVENT_TYPES = new Set([
  "job_dispatch",
  "thread_inquiry",
  "quote_request",
  "new_inquiry",
  "new_message",
  "price_accepted"
]);

const SERVICE_CATALOG = [
  {
    id: "x402-launch-recheck",
    name: "x402 Launch Re-check",
    price_usd: 49,
    delivery: "24h",
    url: "https://tateprograms.com/x402-fix-sprint.html"
  },
  {
    id: "x402-launch-review",
    name: "x402 Launch Review",
    price_usd: 149,
    delivery: "48h",
    url: "https://tateprograms.com/x402-fix-sprint.html"
  },
  {
    id: "x402-fix-sprint",
    name: "x402 Fix Sprint",
    price_usd: 299,
    delivery: "72h",
    url: "https://tateprograms.com/x402-fix-sprint.html"
  },
  {
    id: "x402-public-triage-api",
    name: "x402 Public Triage API",
    price_usd: 0.01,
    delivery: "instant",
    url: "https://the402.tateprograms.com/api/triage"
  },
  {
    id: "x402-paid-triage-api",
    name: "x402 Paid Triage API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
    network: "Solana mainnet USDC"
  }
];

const app = new Hono();
let paidTriageMiddleware;

function getPaidTriageMiddleware() {
  if (!paidTriageMiddleware) {
    const facilitator = new HTTPFacilitatorClient({ url: PAYAI_FACILITATOR_URL });
    paidTriageMiddleware = paymentMiddlewareFromConfig(
      {
        [`POST ${PAID_TRIAGE_PATH}`]: {
          accepts: {
            scheme: "exact",
            price: "$0.01",
            network: SOLANA_MAINNET,
            payTo: SOLANA_PAY_TO,
            extra: {
              provider: "Tate Programs",
              category: "agent-payments",
              service: "x402-public-triage",
              resource: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`
            }
          },
          resource: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
          description: "Paid no-payment triage for public x402, MPP, Pay.sh, and agent-payment launch surfaces.",
          mimeType: "application/json",
          unpaidResponseBody: () => ({
            contentType: "application/json",
            body: {
              error: "payment_required",
              service: "x402 Public Triage API",
              price: "$0.01",
              network: SOLANA_MAINNET,
              payTo: SOLANA_PAY_TO,
              scope: "Submit a public HTTPS endpoint or manifest. No payment header, wallet signature, private endpoint guessing, or paid upstream call is attempted."
            }
          })
        }
      },
      facilitator,
      [{ network: "solana:*", server: new ExactSvmScheme() }],
      { appName: "Tate Programs", testnet: false }
    );
  }

  return paidTriageMiddleware;
}

app.get("/health", c => c.json({
  ok: true,
  service: "tateprograms-the402-provider",
  brand: c.env.BRAND_NAME || "Tate Programs",
  paid_endpoint: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`
}, 200, JSON_HEADERS));

app.get("/services", c => c.json({
  provider: c.env.BRAND_NAME || "Tate Programs",
  services: SERVICE_CATALOG
}, 200, JSON_HEADERS));

app.get("/.well-known/agent-card.json", c => c.json(agentCard(c.env), 200, JSON_HEADERS));

app.get("/.well-known/402index-verify.txt", c => new Response(INDEX_402_VERIFICATION_HASH, {
  status: 200,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  }
}));

app.post("/api/triage", c => triageSurface(c.req.raw));

app.use(PAID_TRIAGE_PATH, async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) });
  }

  const response = await getPaidTriageMiddleware()(c, next);
  const target = response instanceof Response ? response : c.res;
  applyCors(target.headers, c.req.header("origin"));
  target.headers.set("cache-control", "no-store");
  target.headers.set("access-control-expose-headers", "payment-required,x-payment-response");
  return target;
});

app.post(PAID_TRIAGE_PATH, async c => {
  const response = await triageSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-solana");
  return response;
});

app.post("/webhook/the402", c => handleWebhook(c.req.raw, c.env, c.executionCtx));

app.notFound(c => c.json({ error: "not_found" }, 404, JSON_HEADERS));

export default app;

async function triageSurface(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const target = String(input.url || input.surface_url || "").trim();
  const method = String(input.method || "GET").trim().toUpperCase();
  const origin = String(input.origin || "").trim();

  if (!["GET", "POST", "OPTIONS"].includes(method)) {
    return json({ error: "unsupported_method", allowed: ["GET", "POST", "OPTIONS"] }, { status: 400 });
  }

  const safe = validatePublicHttpsUrl(target);
  if (!safe.ok) {
    return json({ error: safe.reason }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 8000);

  try {
    const headers = new Headers({
      accept: "application/json,text/plain,*/*"
    });
    if (origin) headers.set("origin", origin);
    if (method === "OPTIONS") {
      headers.set("access-control-request-method", "POST");
      headers.set("access-control-request-headers", "x-payment,content-type");
    }

    const response = await fetch(target, {
      method,
      headers,
      body: method === "POST" ? "{}" : undefined,
      signal: controller.signal
    });

    const raw = await response.text();
    const body = raw.slice(0, 65536);
    const parsed = parseJson(body);
    const paymentHeaders = pickHeaders(response.headers, [
      "www-authenticate",
      "x-payment-required",
      "x-price-usdc",
      "x-payment-requirements",
      "cache-control",
      "access-control-allow-origin",
      "access-control-allow-headers",
      "access-control-expose-headers"
    ]);

    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      input: { url: target, method, origin: origin || null },
      response: {
        status: response.status,
        content_type: response.headers.get("content-type"),
        headers: paymentHeaders
      },
      x402: summarizeX402(parsed, response.headers),
      findings: buildTriageFindings(response, parsed),
      scope: "Public no-payment triage only. No wallet, payment header, signature, private endpoint guessing, or paid call was attempted."
    });
  } catch (error) {
    return json({
      ok: false,
      error: "fetch_failed",
      reason: error?.message || String(error)
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function agentCard(env) {
  return {
    name: "Tate Programs x402 Launch Triage",
    description: "Public no-payment triage for x402, MPP, Pay.sh, and agent-payment launch surfaces. Returns status, payment headers, challenge summary, cache/CORS notes, and the fixed-scope paid review path.",
    url: env.PUBLIC_SITE || "https://tateprograms.com",
    provider: {
      name: env.BRAND_NAME || "Tate Programs",
      email: "hello@tateprograms.com"
    },
    endpoints: [
      {
        name: "x402_public_triage",
        url: "https://the402.tateprograms.com/api/triage",
        method: "POST",
        input_schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "Public HTTPS manifest, paid endpoint, OpenAPI file, or discovery URL."
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "OPTIONS"],
              default: "GET"
            },
            origin: {
              type: "string",
              description: "Optional browser Origin for CORS checks."
            }
          }
        }
      },
      {
        name: "x402_paid_triage",
        url: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
        method: "POST",
        price: "$0.01",
        network: SOLANA_MAINNET,
        payTo: SOLANA_PAY_TO,
        input_schema: {
          type: "object",
          required: ["url"],
          properties: {
            url: {
              type: "string",
              description: "Public HTTPS manifest, paid endpoint, OpenAPI file, or discovery URL."
            },
            method: {
              type: "string",
              enum: ["GET", "POST", "OPTIONS"],
              default: "GET"
            },
            origin: {
              type: "string",
              description: "Optional browser Origin for CORS checks."
            }
          }
        }
      }
    ],
    service_catalog: "https://tateprograms.com/services.json",
    paid_fix_sprint: env.FIX_SPRINT_URL || "https://tateprograms.com/x402-fix-sprint.html"
  };
}

async function handleWebhook(request, env, ctx) {
  const body = await request.text();
  const auth = await verifyRequest(request, body, env);

  if (!auth.ok) {
    return json({ error: auth.reason }, { status: auth.status });
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const eventType = normalizeType(payload.type);
  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return json({ error: "unsupported_event_type", type: payload.type }, { status: 400 });
  }

  ctx.waitUntil(processEvent(eventType, payload, env));

  return json({
    ok: true,
    accepted: true,
    type: eventType,
    received_at: new Date().toISOString()
  });
}

async function verifyRequest(request, body, env) {
  const requireSignature = env.REQUIRE_SIGNATURE !== "false";
  const platformSecret = request.headers.get("X-Platform-Secret");
  const signature = request.headers.get("X-Webhook-Signature");
  const timestamp = request.headers.get("X-Webhook-Timestamp");

  if (env.THE402_API_KEY && platformSecret !== env.THE402_API_KEY) {
    return { ok: false, status: 401, reason: "invalid_platform_secret" };
  }

  if (!env.THE402_WEBHOOK_SECRET) {
    if (requireSignature) {
      return { ok: false, status: 500, reason: "missing_webhook_secret" };
    }
    return { ok: true };
  }

  if (!signature || !timestamp) {
    return { ok: false, status: 401, reason: "missing_signature" };
  }

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) {
    return { ok: false, status: 401, reason: "stale_signature" };
  }

  const expected = await hmacSha256(`${timestamp}.${body}`, env.THE402_WEBHOOK_SECRET);
  const actual = signature.startsWith("sha256=") ? signature : `sha256=${signature}`;

  if (!timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, reason: "invalid_signature" };
  }

  return { ok: true };
}

async function processEvent(eventType, payload, env) {
  const summary = summarizeEvent(eventType, payload, env);

  await Promise.allSettled([
    notify(summary, payload, env),
    markJobInProgress(eventType, payload, env)
  ]);
}

async function notify(summary, payload, env) {
  if (!env.NOTIFY_WEBHOOK_URL) return;

  await fetch(env.NOTIFY_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: summary,
      source: "the402",
      event: payload,
      received_at: new Date().toISOString()
    })
  });
}

async function markJobInProgress(eventType, payload, env) {
  if (eventType !== "job_dispatch" || !payload.callback_url || !env.THE402_API_KEY) {
    return;
  }

  await fetch(payload.callback_url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-API-Key": env.THE402_API_KEY
    },
    body: JSON.stringify({
      status: "in_progress",
      notes: "Received by Tate Programs. Scope is queued for private review and delivery through this thread."
    })
  });
}

function summarizeEvent(eventType, payload, env) {
  const service = payload.service_name || payload.service_id || "unknown service";
  const thread = payload.thread_id || payload.job_id || payload.quote_id || "no thread id";
  const site = payload.brief?.site_url || payload.brief?.project_url || payload.brief?.surface_url || "";
  const base = `${env.BRAND_NAME || "Tate Programs"} received ${eventType} for ${service} (${thread}).`;
  return site ? `${base} Target: ${site}` : base;
}

function normalizeType(type) {
  return String(type || "").trim().toLowerCase();
}

function validatePublicHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "https_required" };
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname)
  ) {
    return { ok: false, reason: "private_or_local_target_blocked" };
  }

  return { ok: true };
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function pickHeaders(headers, names) {
  const picked = {};
  for (const name of names) {
    const value = headers.get(name);
    if (value) picked[name] = value;
  }
  return picked;
}

function summarizeX402(parsed, headers) {
  const accepts = Array.isArray(parsed?.accepts) ? parsed.accepts : [];
  const firstAccept = accepts[0] || null;
  const requirementsHeader = headers.get("x-payment-requirements") || headers.get("www-authenticate");

  return {
    challenge_like: Boolean(parsed?.x402Version || accepts.length || requirementsHeader),
    version: parsed?.x402Version || parsed?.version || null,
    accepts_count: accepts.length,
    first_accept: firstAccept
      ? {
          scheme: firstAccept.scheme || null,
          network: firstAccept.network || null,
          asset: firstAccept.asset || null,
          maxAmountRequired: firstAccept.maxAmountRequired || firstAccept.amount || null,
          has_resource: Boolean(firstAccept.resource || firstAccept.extra?.resource)
        }
      : null,
    resource_url: parsed?.resource?.url || parsed?.resource || null
  };
}

function buildTriageFindings(response, parsed) {
  const findings = [];
  const cacheControl = response.headers.get("cache-control") || "";
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const exposeHeaders = response.headers.get("access-control-expose-headers") || "";
  const accepts = Array.isArray(parsed?.accepts) ? parsed.accepts : [];

  if (response.status === 402) {
    findings.push("Payment challenge returned before content.");
    if (!/no-store|private/i.test(cacheControl)) {
      findings.push("402 response does not advertise no-store/private cache policy.");
    }
    if (!allowOrigin) {
      findings.push("402 response does not expose Access-Control-Allow-Origin for browser agents.");
    }
    if (!/x-payment|payment/i.test(exposeHeaders)) {
      findings.push("402 response does not expose payment-related headers to browser agents.");
    }
    if (accepts.length && accepts.some((accept) => !(accept.resource || accept.extra?.resource))) {
      findings.push("At least one accept leg does not repeat the charged resource URL.");
    }
  } else if (response.status >= 200 && response.status < 300) {
    findings.push("Target returned success without a payment challenge for this no-payment probe.");
  } else {
    findings.push(`Target returned HTTP ${response.status}.`);
  }

  return findings;
}

async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return `sha256=${hex(signature)}`;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;

  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left[i] ^ right[i];
  }
  return result === 0;
}

function corsHeaders(origin) {
  const headers = new Headers({
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-payment,payment-signature",
    "access-control-expose-headers": "payment-required,x-payment-response",
    "access-control-max-age": "600",
    "cache-control": "no-store"
  });
  applyCors(headers, origin);
  return headers;
}

function applyCors(headers, origin) {
  const allowedOrigin = origin && /^https:\/\/([a-z0-9-]+\.)?tateprograms\.com$/i.test(origin)
    ? origin
    : "https://tateprograms.com";
  headers.set("access-control-allow-origin", allowedOrigin);
  headers.append("vary", "Origin");
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {})
    }
  });
}
