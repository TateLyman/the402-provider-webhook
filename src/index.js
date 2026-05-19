import { Hono } from "hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_PAY_TO = "2Zfwj9JCmNfkhNxXKouHFMBq4Hb2h3zAa6Togyf8wQev";
const SOLANA_USDC_ASSET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const BASE_MAINNET = "eip155:8453";
const BASE_USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_PRICE = "$0.01";
const USDC_ATOMIC_AMOUNT = "10000";
const MAX_PAYMENT_TIMEOUT_SECONDS = 300;
const PAID_TRIAGE_PATH = "/api/x402/triage";
const INDEX_WATCH_PATH = "/api/x402/index-watch";
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

const TRIAGE_DISCOVERY = declareDiscoveryExtension({
  input: {
    url: "https://api.example.com/.well-known/x402",
    method: "GET",
    origin: "https://tateprograms.com"
  },
  inputSchema: {
    properties: {
      url: {
        type: "string",
        format: "uri",
        description: "Public HTTPS manifest, paid endpoint, OpenAPI file, or discovery URL to review."
      },
      method: {
        type: "string",
        enum: ["GET", "POST", "OPTIONS"],
        default: "GET"
      },
      origin: {
        type: "string",
        format: "uri",
        description: "Optional browser Origin used for CORS/payment-header readability checks."
      }
    },
    required: ["url"]
  },
  bodyType: "json",
  output: {
    example: {
      ok: true,
      response: {
        status: 402,
        headers: {
          "cache-control": "no-store",
          "access-control-allow-origin": "https://tateprograms.com"
        }
      },
      x402: {
        challenge_like: true,
        accepts_count: 1
      },
      attack_checks: [
        {
          id: "replay_idempotency",
          status: "partial_pass"
        },
        {
          id: "header_proxy_cache",
          status: "pass"
        }
      ],
      findings: [
        "Payment challenge returned before content."
      ]
    }
  }
});

const INDEX_WATCH_DISCOVERY = declareDiscoveryExtension({
  input: {
    q: "example.com",
    protocol: "x402",
    health: "down",
    limit: 10
  },
  inputSchema: {
    properties: {
      q: {
        type: "string",
        description: "402 Index search term, provider name, domain, or service URL."
      },
      protocol: {
        type: "string",
        enum: ["x402", "L402", "MPP"],
        default: "x402"
      },
      health: {
        type: "string",
        enum: ["healthy", "degraded", "down", "unknown"]
      },
      limit: {
        type: "number",
        minimum: 1,
        maximum: 50,
        default: 25
      }
    },
    required: ["q"]
  },
  bodyType: "json",
  output: {
    example: {
      ok: true,
      source: "402 Index public API",
      summary: {
        total: 3,
        healthy: 1,
        degraded: 1,
        down: 1,
        payment_invalid: 2,
        domain_unverified: 1
      },
      findings: [
        "1 service(s) are down in 402 Index.",
        "2 service(s) do not currently have valid x402 payment requirements according to 402 Index."
      ]
    }
  }
});

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
    network: "Solana mainnet USDC; Base mainnet USDC when BASE_PAY_TO is configured"
  },
  {
    id: "x402-index-watch-api",
    name: "x402 Index Watch API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
    network: "Solana mainnet USDC; Base mainnet USDC when BASE_PAY_TO is configured"
  }
];

const app = new Hono();
let paidTriageMiddleware;
let paidTriageMiddlewareKey;

function getPaidTriageMiddleware(env = {}) {
  const basePayTo = normalizeEvmAddress(env.BASE_PAY_TO || env.BASE_USDC_PAY_TO || "");
  const middlewareKey = basePayTo || "solana-only";

  if (!paidTriageMiddleware || paidTriageMiddlewareKey !== middlewareKey) {
    const facilitator = new HTTPFacilitatorClient({ url: PAYAI_FACILITATOR_URL });
    const triageResource = `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`;
    const indexWatchResource = `https://the402.tateprograms.com${INDEX_WATCH_PATH}`;
    const triageConfig = () => buildPaidRouteConfig({
      service: "x402-paid-triage",
      displayName: "x402 Paid Triage API",
      resource: triageResource,
      description: "Paid no-payment triage for public x402, MPP, Pay.sh, and agent-payment launch surfaces.",
      discovery: TRIAGE_DISCOVERY,
      scope: "Submit a public HTTPS endpoint or manifest. No payment header, wallet signature, private endpoint guessing, or paid upstream call is attempted.",
      basePayTo
    });
    const indexWatchConfig = () => buildPaidRouteConfig({
      service: "x402-index-watch",
      displayName: "x402 Index Watch API",
      resource: indexWatchResource,
      description: "Paid 402 Index health watch for provider, domain, or service search terms.",
      discovery: INDEX_WATCH_DISCOVERY,
      scope: "Submit a provider, domain, or service query. Returns public 402 Index health and launch-readiness signals.",
      basePayTo
    });

    paidTriageMiddleware = paymentMiddlewareFromConfig(
      {
        [`GET ${PAID_TRIAGE_PATH}`]: triageConfig(),
        [`POST ${PAID_TRIAGE_PATH}`]: triageConfig(),
        [`GET ${INDEX_WATCH_PATH}`]: indexWatchConfig(),
        [`POST ${INDEX_WATCH_PATH}`]: indexWatchConfig()
      },
      facilitator,
      buildSchemes(basePayTo),
      { appName: "Tate Programs", testnet: false }
    );
    paidTriageMiddlewareKey = middlewareKey;
  }

  return paidTriageMiddleware;
}

function buildPaidRouteConfig({ service, displayName, resource, description, discovery, scope, basePayTo }) {
  return {
    accepts: buildAccepts({
      service,
      resource,
      basePayTo
    }),
    resource,
    description,
    mimeType: "application/json",
    extensions: {
      ...discovery
    },
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: buildPaymentRequiredBody({
        service,
        displayName,
        resource,
        description,
        discovery,
        scope,
        basePayTo
      })
    })
  };
}

function buildAccepts({ service, resource, basePayTo }) {
  const commonExtra = {
    provider: "Tate Programs",
    category: "agent-payments",
    service,
    resource
  };
  const accepts = [];

  if (basePayTo) {
    accepts.push({
      scheme: "exact",
      price: "$0.01",
      network: BASE_MAINNET,
      payTo: basePayTo,
      extra: commonExtra
    });
  }

  accepts.push({
    scheme: "exact",
    price: "$0.01",
    network: SOLANA_MAINNET,
    payTo: SOLANA_PAY_TO,
    extra: commonExtra
  });

  return accepts;
}

function buildPaymentRequiredBody({ service, displayName, resource, description, discovery, scope, basePayTo }) {
  return {
    x402Version: 2,
    error: "Payment required",
    code: "payment_required",
    service: displayName,
    price: USDC_PRICE,
    resource: {
      url: resource,
      description,
      mimeType: "application/json"
    },
    accepts: buildAtomicAccepts({ service, resource, basePayTo }),
    extensions: {
      ...discovery
    },
    networks: describePaidNetworks(basePayTo),
    payTo: describePayTo(basePayTo),
    scope
  };
}

function buildAtomicAccepts({ service, resource, basePayTo }) {
  const commonExtra = {
    provider: "Tate Programs",
    category: "agent-payments",
    service,
    resource
  };
  const accepts = [];

  if (basePayTo) {
    accepts.push({
      scheme: "exact",
      network: BASE_MAINNET,
      amount: USDC_ATOMIC_AMOUNT,
      asset: BASE_USDC_ASSET,
      payTo: basePayTo,
      maxTimeoutSeconds: MAX_PAYMENT_TIMEOUT_SECONDS,
      extra: {
        name: "USD Coin",
        version: "2",
        ...commonExtra
      }
    });
  }

  accepts.push({
    scheme: "exact",
    network: SOLANA_MAINNET,
    amount: USDC_ATOMIC_AMOUNT,
    asset: SOLANA_USDC_ASSET,
    payTo: SOLANA_PAY_TO,
    maxTimeoutSeconds: MAX_PAYMENT_TIMEOUT_SECONDS,
    extra: {
      ...commonExtra,
      feePayer: SOLANA_FEE_PAYER
    }
  });

  return accepts;
}

function buildSchemes(basePayTo) {
  const schemes = [{ network: "solana:*", server: new ExactSvmScheme() }];

  if (basePayTo) {
    schemes.unshift({ network: BASE_MAINNET, server: new ExactEvmScheme() });
  }

  return schemes;
}

function normalizeEvmAddress(value) {
  const address = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : "";
}

function describePaidNetworks(basePayTo) {
  return basePayTo ? [BASE_MAINNET, SOLANA_MAINNET] : [SOLANA_MAINNET];
}

function describePayTo(basePayTo) {
  return basePayTo
    ? { [BASE_MAINNET]: basePayTo, [SOLANA_MAINNET]: SOLANA_PAY_TO }
    : { [SOLANA_MAINNET]: SOLANA_PAY_TO };
}

function paidServiceWithEnv(service, env = {}) {
  if (![PAID_TRIAGE_PATH, INDEX_WATCH_PATH].some(path => String(service.url || "").includes(path))) {
    return service;
  }

  const basePayTo = normalizeEvmAddress(env.BASE_PAY_TO || env.BASE_USDC_PAY_TO || "");
  return {
    ...service,
    networks: describePaidNetworks(basePayTo),
    payTo: describePayTo(basePayTo),
    network: basePayTo ? "Base mainnet USDC + Solana mainnet USDC" : "Solana mainnet USDC"
  };
}

function paidEndpointInfo({ name, endpoint, useMethod, description, acceptedFields, basePayTo }) {
  return {
    ok: true,
    service: name,
    paid: true,
    price: USDC_PRICE,
    endpoint,
    use_method: useMethod,
    description,
    accepted_fields: acceptedFields,
    networks: describePaidNetworks(basePayTo),
    payTo: describePayTo(basePayTo),
    note: "This GET response is only returned after x402 payment; normal API execution uses the listed method."
  };
}

app.get("/health", c => c.json({
  ok: true,
  service: "tateprograms-the402-provider",
  brand: c.env.BRAND_NAME || "Tate Programs",
  paid_endpoints: [
    `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
    `https://the402.tateprograms.com${INDEX_WATCH_PATH}`
  ]
}, 200, JSON_HEADERS));

app.get("/services", c => c.json({
  provider: c.env.BRAND_NAME || "Tate Programs",
  services: SERVICE_CATALOG.map(service => paidServiceWithEnv(service, c.env))
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

async function paidRouteGuard(c, next) {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) });
  }

  const response = await getPaidTriageMiddleware(c.env)(c, next);
  const target = response instanceof Response ? response : c.res;
  applyCors(target.headers, c.req.header("origin"));
  target.headers.set("cache-control", "no-store");
  target.headers.set("access-control-expose-headers", "payment-required,x-payment-response");
  return target;
}

app.use(PAID_TRIAGE_PATH, paidRouteGuard);
app.use(INDEX_WATCH_PATH, paidRouteGuard);

app.get(PAID_TRIAGE_PATH, c => c.json(paidEndpointInfo({
  name: "x402 Paid Triage API",
  endpoint: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
  useMethod: "POST",
  description: "Submit a public HTTPS endpoint or manifest for a no-payment external x402 readiness pass.",
  acceptedFields: ["url", "method", "origin"],
  basePayTo: normalizeEvmAddress(c.env.BASE_PAY_TO || c.env.BASE_USDC_PAY_TO || "")
}), 200, JSON_HEADERS));

app.get(INDEX_WATCH_PATH, c => c.json(paidEndpointInfo({
  name: "x402 Index Watch API",
  endpoint: `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
  useMethod: "POST",
  description: "Submit a provider, domain, or service query for public 402 Index health and launch-readiness signals.",
  acceptedFields: ["q", "provider", "domain", "url", "protocol", "health", "limit"],
  basePayTo: normalizeEvmAddress(c.env.BASE_PAY_TO || c.env.BASE_USDC_PAY_TO || "")
}), 200, JSON_HEADERS));

app.post(PAID_TRIAGE_PATH, async c => {
  const response = await triageSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-multirail");
  return response;
});

app.post(INDEX_WATCH_PATH, async c => {
  const response = await indexWatchSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-multirail");
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
    const x402 = summarizeX402(parsed, response.headers);
    const paymentHeaders = pickHeaders(response.headers, [
      "payment-required",
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
      x402,
      attack_checks: buildAttackChecks(response, x402),
      findings: buildTriageFindings(response, x402),
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

async function indexWatchSurface(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const query = String(input.q || input.provider || input.domain || input.url || "").trim();
  const protocol = normalizeProtocol(input.protocol || "x402");
  const health = normalizeHealth(input.health || "");
  const limit = Math.min(Math.max(Number(input.limit) || 25, 1), 50);

  if (!query) {
    return json({
      error: "query_required",
      accepted_fields: ["q", "provider", "domain", "url"]
    }, { status: 400 });
  }

  if (!protocol) {
    return json({ error: "unsupported_protocol", allowed: ["L402", "x402", "MPP"] }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: query.slice(0, 160),
    protocol,
    limit: String(limit)
  });
  if (health) params.set("health", health);

  const indexUrl = `https://402index.io/api/v1/services?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 8000);

  try {
    const response = await fetch(indexUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      return json({
        ok: false,
        error: "index_fetch_failed",
        status: response.status
      }, { status: 502 });
    }

    const data = await response.json();
    const services = Array.isArray(data.services)
      ? data.services.slice(0, limit).map(compactIndexService)
      : [];

    return json({
      ok: true,
      checked_at: new Date().toISOString(),
      source: "402 Index public API",
      query: {
        q: query.slice(0, 160),
        protocol,
        health: health || null,
        limit
      },
      total: data.total || services.length,
      summary: summarizeIndexServices(services),
      findings: buildIndexWatchFindings(services),
      services,
      paid_review_path: "https://tateprograms.com/x402-fix-sprint.html",
      scope: "Public 402 Index metadata only. No wallet, payment header, private endpoint guessing, or paid endpoint call was attempted."
    });
  } catch (error) {
    return json({
      ok: false,
      error: "index_watch_failed",
      reason: error?.message || String(error)
    }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

function agentCard(env) {
  const basePayTo = normalizeEvmAddress(env.BASE_PAY_TO || env.BASE_USDC_PAY_TO || "");

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
        network: describePaidNetworks(basePayTo),
        payTo: describePayTo(basePayTo),
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
        name: "x402_index_watch",
        url: `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
        method: "POST",
        price: "$0.01",
        network: describePaidNetworks(basePayTo),
        payTo: describePayTo(basePayTo),
        input_schema: {
          type: "object",
          required: ["q"],
          properties: {
            q: {
              type: "string",
              description: "402 Index search term, provider name, domain, or service URL."
            },
            protocol: {
              type: "string",
              enum: ["x402", "L402", "MPP"],
              default: "x402"
            },
            health: {
              type: "string",
              enum: ["healthy", "degraded", "down", "unknown"]
            },
            limit: {
              type: "number",
              default: 25
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
  const headerPayment = parsePaymentRequirementHeader(headers);
  const payment = (parsed?.x402Version || Array.isArray(parsed?.accepts)) ? parsed : headerPayment;
  const accepts = Array.isArray(payment?.accepts) ? payment.accepts : [];
  const firstAccept = accepts[0] || null;
  const requirementsHeader = paymentRequirementHeaderValue(headers);
  const resourceUrl = typeof payment?.resource === "object"
    ? payment.resource.url
    : payment?.resource;

  return {
    challenge_like: Boolean(payment?.x402Version || accepts.length || requirementsHeader),
    source: payment === parsed ? "body" : headerPayment ? "payment_header" : requirementsHeader ? "header_present" : null,
    version: payment?.x402Version || payment?.version || null,
    accepts_count: accepts.length,
    accepts_missing_resource: accepts.length
      ? accepts.some((accept) => !(accept.resource || accept.extra?.resource))
      : null,
    accepts_missing_payee: accepts.length
      ? accepts.some((accept) => !(accept.payTo || accept.pay_to || accept.recipient))
      : null,
    resource_uses_https: resourceUrl ? /^https:\/\//i.test(resourceUrl) : null,
    first_accept: firstAccept
      ? {
          scheme: firstAccept.scheme || null,
          network: firstAccept.network || null,
          asset: firstAccept.asset || null,
          maxAmountRequired: firstAccept.maxAmountRequired || firstAccept.amount || null,
          has_resource: Boolean(firstAccept.resource || firstAccept.extra?.resource)
        }
      : null,
    resource_url: resourceUrl || null
  };
}

function parsePaymentRequirementHeader(headers) {
  const value = paymentRequirementHeaderValue(headers);
  if (!value) return null;

  const trimmed = value.trim();
  if (trimmed.startsWith("{")) return parseJson(trimmed);

  try {
    return parseJson(globalThis.atob(trimmed));
  } catch {
    return null;
  }
}

function paymentRequirementHeaderValue(headers) {
  return headers.get("payment-required")
    || headers.get("x-payment-required")
    || headers.get("x-payment-requirements")
    || headers.get("www-authenticate");
}

function buildAttackChecks(response, x402) {
  if (!x402.challenge_like) {
    return [];
  }

  const cacheControl = response.headers.get("cache-control") || "";
  const exposeHeaders = response.headers.get("access-control-expose-headers") || "";

  return [
    {
      id: "settlement_finality",
      status: "manual_review",
      risk: "Grant-before-finality can deliver paid resources before settlement is durable.",
      external_signal: "Not provable without facilitator/settlement logs in a no-payment pass.",
      expected_control: "Wait for the facilitator's settled result or durable confirmation policy before releasing the resource."
    },
    {
      id: "replay_idempotency",
      status: x402.accepts_missing_resource === false && x402.resource_uses_https !== false ? "partial_pass" : "needs_fix",
      risk: "A reusable payment payload can grant the same resource more than once if the server lacks a pre-grant payment identity ledger.",
      external_signal: x402.accepts_missing_resource === false && x402.resource_uses_https !== false
        ? "Accept legs repeat the charged resource URL."
        : "At least one accept leg lacks a charged resource binding or the resource URL is not HTTPS.",
      expected_control: "Record a canonical payment identity before grant and bind it to method, resource URL, amount, asset, and recipient."
    },
    {
      id: "header_proxy_cache",
      status: /no-store|private/i.test(cacheControl) ? "pass" : "needs_fix",
      risk: "Payment-sensitive responses can leak through ordinary HTTP caches or proxy handling.",
      external_signal: cacheControl || "No cache-control header observed.",
      expected_control: "Return no-store/private on 402 and paid responses, expose payment headers deliberately, and keep payment headers out of logs."
    },
    {
      id: "browser_payment_headers",
      status: /x-payment|payment/i.test(exposeHeaders) ? "pass" : "needs_fix",
      risk: "Browser agents may be unable to read the payment challenge or settlement response.",
      external_signal: exposeHeaders || "No Access-Control-Expose-Headers observed.",
      expected_control: "Expose Payment-Required and payment response headers for allowed origins."
    },
    {
      id: "discovery_selection",
      status: "manual_review",
      risk: "Agent marketplaces can be biased by weak metadata, duplicated listings, or unverified trust cues.",
      external_signal: x402.source ? `Payment challenge parsed from ${x402.source}.` : "Payment challenge present but not parsed.",
      expected_control: "Use stable provider identity, accurate pricing, canonical resource metadata, and avoid misleading discovery text."
    }
  ];
}

function buildTriageFindings(response, x402) {
  const findings = [];
  const cacheControl = response.headers.get("cache-control") || "";
  const allowOrigin = response.headers.get("access-control-allow-origin");
  const exposeHeaders = response.headers.get("access-control-expose-headers") || "";

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
    if (x402.accepts_missing_resource) {
      findings.push("At least one accept leg does not repeat the charged resource URL.");
    }
    if (x402.resource_uses_https === false) {
      findings.push("Payment challenge resource URL is not HTTPS.");
    }
  } else if (response.status >= 200 && response.status < 300) {
    findings.push("Target returned success without a payment challenge for this no-payment probe.");
  } else {
    findings.push(`Target returned HTTP ${response.status}.`);
  }

  return findings;
}

function normalizeProtocol(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "x402") return "x402";
  if (raw === "l402") return "L402";
  if (raw === "mpp") return "MPP";
  return null;
}

function normalizeHealth(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["healthy", "degraded", "down", "unknown"].includes(raw) ? raw : null;
}

function compactIndexService(service) {
  return {
    id: service.id || null,
    name: service.name || null,
    provider: service.provider || null,
    url: service.url || null,
    protocol: service.protocol || null,
    category: service.category || null,
    price_usd: service.price_usd ?? null,
    payment_asset: service.payment_asset || null,
    payment_network: service.payment_network || null,
    health_status: service.health_status || null,
    reliability_score: service.reliability_score ?? null,
    x402_payment_valid: service.x402_payment_valid ?? null,
    domain_verified: service.domain_verified ?? null,
    last_checked: service.last_checked || null,
    registered_at: service.registered_at || null,
    http_method: service.http_method || null
  };
}

function summarizeIndexServices(services) {
  const counts = {
    total_returned: services.length,
    healthy: 0,
    degraded: 0,
    down: 0,
    unknown: 0,
    payment_invalid: 0,
    domain_unverified: 0
  };

  for (const service of services) {
    if (counts[service.health_status] !== undefined) counts[service.health_status] += 1;
    if (service.x402_payment_valid === 0 || service.x402_payment_valid === false) counts.payment_invalid += 1;
    if (service.domain_verified === 0 || service.domain_verified === false) counts.domain_unverified += 1;
  }

  return counts;
}

function buildIndexWatchFindings(services) {
  const findings = [];

  if (!services.length) {
    return ["No matching 402 Index services were returned for this query."];
  }

  const down = services.filter(service => service.health_status === "down");
  const degraded = services.filter(service => service.health_status === "degraded");
  const invalidPayment = services.filter(service => service.x402_payment_valid === 0 || service.x402_payment_valid === false);
  const unverified = services.filter(service => service.domain_verified === 0 || service.domain_verified === false);

  if (down.length) findings.push(`${down.length} service(s) are down in 402 Index.`);
  if (degraded.length) findings.push(`${degraded.length} service(s) are degraded in 402 Index.`);
  if (invalidPayment.length) findings.push(`${invalidPayment.length} service(s) do not currently have valid x402 payment requirements according to 402 Index.`);
  if (unverified.length) findings.push(`${unverified.length} service(s) are not domain-verified in 402 Index.`);
  if (!findings.length) findings.push("No obvious 402 Index health or verification findings in the returned services.");

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
    "access-control-allow-methods": "GET,POST,OPTIONS",
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
