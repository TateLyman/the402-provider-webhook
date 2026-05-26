import { Hono } from "hono";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddlewareFromConfig } from "@x402/hono";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store"
};

const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_USDC_ASSET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOLANA_FEE_PAYER = "2wKupLR9q6wXYppw8Gr2NvWxKBUqm4PPJKkQfoxHDBg4";
const BASE_MAINNET = "eip155:8453";
const BASE_USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEFAULT_BASE_PAY_TO = "0x7bc5e304ca289823dec021012d6bb361ddf6b368";
const USDC_PRICE = "$0.01";
const USDC_ATOMIC_AMOUNT = "10000";
const MAX_PAYMENT_TIMEOUT_SECONDS = 300;
const PAID_TRIAGE_PATH = "/api/x402/triage";
const INDEX_WATCH_PATH = "/api/x402/index-watch";
const SKILL_TRUST_PATH = "/api/x402/skill-trust-check";
const A2A_PATH = "/a2a";
const TOOLS402_READINESS_PATH = "/api/tools402/readiness-snapshot";
const UCP_READINESS_PATH = "/api/ucp/readiness";
const PROVIDER_PROXY_TRIAGE_PATH = "/api/provider/triage";
const PROVIDER_PROXY_INDEX_WATCH_PATH = "/api/provider/index-watch";
const PROVIDER_PROXY_SKILL_TRUST_PATH = "/api/provider/skill-trust-check";
const AGENT402_TRIAGE_PATH = "/api/agent402/triage";
const AGENT402_INDEX_WATCH_PATH = "/api/agent402/index-watch";
const AGENT402_SKILL_TRUST_PATH = "/api/agent402/skill-trust-check";
const SWARMWAGE_HIRE_PATH = "/swarmwage/hire";
const SWARMWAGE_VERIFY_PATH = "/.well-known/swarmwage-verify";
const PAYAI_FACILITATOR_URL = "https://facilitator.payai.network";
const A2A_X402_EXTENSION_URI = "https://github.com/google-agentic-commerce/a2a-x402/blob/main/spec/v0.2";
const INDEX_402_VERIFICATION_HASH = "bc0b0234db538932601eed25e0ee1b333b19eca066f6e6904e774c19a5d1525c";
const SWARMWAGE_PROTOCOL_VERSION = "swarmwage/v0.3";
const SWARMWAGE_CAPABILITIES = [
  "custom.tateprograms.x402.surface-readiness",
  "custom.tateprograms.agent-payment.surface-triage",
  "data.lookup.x402-health"
];
const PUBLIC_MARKETPLACE_ORIGINS = new Set([
  "agora402.io",
  "www.agora402.io",
  "a2alist.ai",
  "www.a2alist.ai",
  "agensi.io",
  "www.agensi.io",
  "agent402.app",
  "marketplace.agent402.app",
  "apihub.io",
  "www.apihub.io",
  "clawmart.co",
  "www.clawmart.co",
  "clawdmkt.com",
  "www.clawdmkt.com",
  "claw402.ai",
  "www.claw402.ai",
  "orkai.ai",
  "www.orkai.ai",
  "paperclipskills.com",
  "www.paperclipskills.com",
  "payanagent.com",
  "www.payanagent.com",
  "the402.ai",
  "www.the402.ai",
  "tools402.dev",
  "www.tools402.dev",
  "api.tools402.dev",
  "x402-agent-pay.com",
  "www.x402-agent-pay.com"
]);

const ALLOWED_EVENT_TYPES = new Set([
  "job_dispatch",
  "thread_inquiry",
  "quote_request",
  "new_inquiry",
  "new_message",
  "price_accepted"
]);

const TRIAGE_DISCOVERY = declareDiscoveryExtension({
  method: "POST",
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
  method: "POST",
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

const SKILL_TRUST_DISCOVERY = declareDiscoveryExtension({
  method: "POST",
  input: {
    url: "https://github.com/example/agent-skill",
    format: "repo-or-skill-md"
  },
  inputSchema: {
    properties: {
      url: {
        type: "string",
        format: "uri",
        description: "Public HTTPS GitHub repo, raw SKILL.md, README, manifest, or skill listing to inspect."
      },
      text: {
        type: "string",
        description: "Optional pasted skill text. Used only when no URL is supplied."
      }
    },
    required: ["url"]
  },
  bodyType: "json",
  output: {
    example: {
      ok: true,
      risk_score: 78,
      verdict: "review_before_install",
      findings: [
        {
          severity: "medium",
          category: "execution",
          note: "Skill references shell execution without a clear permission boundary."
        }
      ],
      patch_order: [
        "Declare required permissions before installation.",
        "Replace broad shell examples with exact commands and dry-run output."
      ]
    }
  }
});

const A2A_DISCOVERY = declareDiscoveryExtension({
  method: "POST",
  input: {
    message: {
      role: "user",
      parts: [
        {
          text: "{\"skill\":\"triage\",\"url\":\"https://api.example.com/.well-known/x402\",\"method\":\"GET\"}"
        }
      ]
    }
  },
  inputSchema: {
    properties: {
      message: {
        type: "object",
        description: "A2A message with text or JSON input for triage, index_watch, or skill_trust."
      },
      skill: {
        type: "string",
        enum: ["triage", "index_watch", "skill_trust"],
        description: "Optional explicit Tate Programs skill route."
      }
    },
    required: ["message"]
  },
  bodyType: "json",
  output: {
    example: {
      jsonrpc: "2.0",
      result: {
        status: {
          state: "completed"
        },
        metadata: {
          service: "x402_launch_triage",
          delivered_by: "Tate Programs"
        }
      }
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
    network: "Base mainnet USDC"
  },
  {
    id: "x402-index-watch-api",
    name: "x402 Index Watch API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
    network: "Base mainnet USDC"
  },
  {
    id: "x402-skill-trust-check-api",
    name: "Agent Skill Trust Check API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${SKILL_TRUST_PATH}`,
    network: "Base mainnet USDC"
  },
  {
    id: "a2a-agent-payment-surface-triage",
    name: "Agent Payment Surface Triage A2A",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${A2A_PATH}`,
    discovery: "https://the402.tateprograms.com/.well-known/agent.json",
    network: "Base mainnet USDC"
  },
  {
    id: "swarmwage-x402-surface-readiness",
    name: "Swarmwage x402 Surface Readiness",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${SWARMWAGE_HIRE_PATH}`,
    network: "Base mainnet USDC",
    protocol: SWARMWAGE_PROTOCOL_VERSION,
    capabilities: SWARMWAGE_CAPABILITIES
  },
  {
    id: "provider-proxy-triage-api",
    name: "Provider Proxy Triage API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${PROVIDER_PROXY_TRIAGE_PATH}`,
    network: "marketplace-managed",
    upstream_auth_header: "X-Tate-Provider-Token"
  },
  {
    id: "provider-proxy-index-watch-api",
    name: "Provider Proxy Index Watch API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${PROVIDER_PROXY_INDEX_WATCH_PATH}`,
    network: "marketplace-managed",
    upstream_auth_header: "X-Tate-Provider-Token"
  },
  {
    id: "provider-proxy-skill-trust-api",
    name: "Agent Skill Trust Check API",
    price_usd: 0.01,
    delivery: "instant",
    url: `https://the402.tateprograms.com${PROVIDER_PROXY_SKILL_TRUST_PATH}`,
    network: "marketplace-managed",
    upstream_auth_header: "X-Tate-Provider-Token"
  }
];

const app = new Hono();
let paidTriageMiddleware;
let paidTriageMiddlewareKey;

function getPaidTriageMiddleware(env = {}) {
  const paymentTargets = paymentTargetsFromEnv(env);
  const swarmwageTargets = swarmwagePaymentTargetsFromEnv(env);
  const middlewareKey = [
    paymentTargets.basePayTo,
    paymentTargets.solanaPayTo || "no-solana",
    swarmwageTargets.basePayTo || "no-swarmwage"
  ].join("|");

  if (!paidTriageMiddleware || paidTriageMiddlewareKey !== middlewareKey) {
    const facilitator = new HTTPFacilitatorClient({ url: PAYAI_FACILITATOR_URL });
    const triageResource = `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`;
    const indexWatchResource = `https://the402.tateprograms.com${INDEX_WATCH_PATH}`;
    const skillTrustResource = `https://the402.tateprograms.com${SKILL_TRUST_PATH}`;
    const a2aResource = `https://the402.tateprograms.com${A2A_PATH}`;
    const swarmwageResource = `https://the402.tateprograms.com${SWARMWAGE_HIRE_PATH}`;
    const triageConfig = () => buildPaidRouteConfig({
      service: "x402-paid-triage",
      displayName: "x402 Paid Triage API",
      resource: triageResource,
      description: "Paid no-payment triage for public x402, MPP, Pay.sh, and agent-payment launch surfaces.",
      discovery: TRIAGE_DISCOVERY,
      scope: "Submit a public HTTPS endpoint or manifest. No payment header, wallet signature, private endpoint guessing, or paid upstream call is attempted.",
      paymentTargets
    });
    const indexWatchConfig = () => buildPaidRouteConfig({
      service: "x402-index-watch",
      displayName: "x402 Index Watch API",
      resource: indexWatchResource,
      description: "Paid 402 Index health watch for provider, domain, or service search terms.",
      discovery: INDEX_WATCH_DISCOVERY,
      scope: "Submit a provider, domain, or service query. Returns public 402 Index health and launch-readiness signals.",
      paymentTargets
    });
    const skillTrustConfig = () => buildPaidRouteConfig({
      service: "agent-skill-trust-check",
      displayName: "Agent Skill Trust Check API",
      resource: skillTrustResource,
      description: "Paid public-text trust check for OpenClaw, Hermes, MCP, and SKILL.md agent-skill listings before installation.",
      discovery: SKILL_TRUST_DISCOVERY,
      scope: "Submit a public skill URL, GitHub repo, raw SKILL.md, or pasted skill text. No install, command execution, wallet signature, private repository access, or paid upstream call is attempted.",
      paymentTargets
    });
    const a2aConfig = () => buildPaidRouteConfig({
      service: "a2a-agent-payment-surface-triage",
      displayName: "Agent Payment Surface Triage A2A",
      resource: a2aResource,
      description: "A2A JSON-RPC entrypoint for x402 launch triage, 402 Index watch, and agent-skill trust checks.",
      discovery: A2A_DISCOVERY,
      scope: "Send an A2A message with JSON input or plain text. The paid call is routed to public no-payment triage, 402 Index watch, or skill trust checks. No private endpoint guessing or paid upstream call is attempted.",
      paymentTargets
    });
    const swarmwageConfig = () => buildPaidRouteConfig({
      service: "swarmwage-x402-surface-readiness",
      displayName: "Swarmwage x402 Surface Readiness",
      resource: swarmwageResource,
      description: "Swarmwage hire endpoint for x402, MPP, and agent-payment public-surface readiness triage.",
      discovery: TRIAGE_DISCOVERY,
      scope: "Submit a Swarmwage hire request with a public URL or provider query. The result is returned in Swarmwage receipt/result shape after x402 payment.",
      paymentTargets: swarmwageTargets.basePayTo ? swarmwageTargets : paymentTargets
    });

    paidTriageMiddleware = paymentMiddlewareFromConfig(
      {
        [`GET ${PAID_TRIAGE_PATH}`]: triageConfig(),
        [`POST ${PAID_TRIAGE_PATH}`]: triageConfig(),
        [`GET ${INDEX_WATCH_PATH}`]: indexWatchConfig(),
        [`POST ${INDEX_WATCH_PATH}`]: indexWatchConfig(),
        [`GET ${SKILL_TRUST_PATH}`]: skillTrustConfig(),
        [`POST ${SKILL_TRUST_PATH}`]: skillTrustConfig(),
        [`POST ${A2A_PATH}`]: a2aConfig(),
        [`POST ${SWARMWAGE_HIRE_PATH}`]: swarmwageConfig()
      },
      facilitator,
      buildSchemes({
        basePayTo: paymentTargets.basePayTo || swarmwageTargets.basePayTo,
        solanaPayTo: paymentTargets.solanaPayTo
      }),
      { appName: "Tate Programs", testnet: false }
    );
    paidTriageMiddlewareKey = middlewareKey;
  }

  return paidTriageMiddleware;
}

function buildPaidRouteConfig({ service, displayName, resource, description, discovery, scope, paymentTargets }) {
  return {
    accepts: buildAccepts({
      service,
      resource,
      paymentTargets
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
        paymentTargets
      })
    })
  };
}

function buildAccepts({ service, resource, paymentTargets }) {
  const commonExtra = {
    provider: "Tate Programs",
    category: "agent-payments",
    service,
    resource
  };
  const accepts = [];

  if (paymentTargets.basePayTo) {
    accepts.push({
      scheme: "exact",
      price: "$0.01",
      network: BASE_MAINNET,
      payTo: paymentTargets.basePayTo,
      extra: commonExtra
    });
  }

  if (paymentTargets.solanaPayTo) {
    accepts.push({
      scheme: "exact",
      price: "$0.01",
      network: SOLANA_MAINNET,
      payTo: paymentTargets.solanaPayTo,
      extra: commonExtra
    });
  }

  return accepts;
}

function buildPaymentRequiredBody({ service, displayName, resource, description, discovery, scope, paymentTargets }) {
  return {
    x402Version: 2,
    error: "Payment required",
    code: "payment_required",
    service: displayName,
    price: USDC_PRICE,
    facilitator: PAYAI_FACILITATOR_URL,
    facilitator_url: PAYAI_FACILITATOR_URL,
    resource: {
      url: resource,
      description,
      mimeType: "application/json"
    },
    accepts: buildAtomicAccepts({ service, resource, paymentTargets }),
    extensions: {
      ...discovery
    },
    networks: describePaidNetworks(paymentTargets),
    payTo: describePayTo(paymentTargets),
    scope
  };
}

function buildAtomicAccepts({ service, resource, paymentTargets }) {
  const route = routeDescriptorForResource(service, resource);
  const commonExtra = {
    provider: "Tate Programs",
    category: "agent-payments",
    name: route.displayName,
    service,
    resource,
    facilitator: PAYAI_FACILITATOR_URL,
    ownerUrl: "https://tateprograms.com"
  };
  const accepts = [];

  if (paymentTargets.basePayTo) {
    accepts.push({
      scheme: "exact",
      network: BASE_MAINNET,
      amount: USDC_ATOMIC_AMOUNT,
      maxAmountRequired: USDC_ATOMIC_AMOUNT,
      asset: BASE_USDC_ASSET,
      payTo: paymentTargets.basePayTo,
      maxTimeoutSeconds: MAX_PAYMENT_TIMEOUT_SECONDS,
      resource,
      description: route.description,
      mimeType: "application/json",
      outputSchema: null,
      extra: {
        name: "USD Coin",
        version: "2",
        ...commonExtra
      }
    });
  }

  if (paymentTargets.solanaPayTo) {
    accepts.push({
      scheme: "exact",
      network: SOLANA_MAINNET,
      amount: USDC_ATOMIC_AMOUNT,
      maxAmountRequired: USDC_ATOMIC_AMOUNT,
      asset: SOLANA_USDC_ASSET,
      payTo: paymentTargets.solanaPayTo,
      maxTimeoutSeconds: MAX_PAYMENT_TIMEOUT_SECONDS,
      resource,
      description: route.description,
      mimeType: "application/json",
      outputSchema: null,
      extra: {
        ...commonExtra,
        feePayer: SOLANA_FEE_PAYER
      }
    });
  }

  return accepts;
}

function encodePaymentHeader(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function buildSchemes(paymentTargets) {
  const schemes = [];

  if (paymentTargets.basePayTo) {
    schemes.push({ network: BASE_MAINNET, server: new ExactEvmScheme() });
  }

  if (paymentTargets.solanaPayTo) {
    schemes.push({ network: "solana:*", server: new ExactSvmScheme() });
  }

  return schemes;
}

function paymentTargetsFromEnv(env = {}) {
  return {
    basePayTo: normalizeEvmAddress(env.BASE_PAY_TO || env.BASE_USDC_PAY_TO || DEFAULT_BASE_PAY_TO),
    solanaPayTo: normalizeSolanaAddress(env.SOLANA_PAY_TO || env.SOLANA_USDC_PAY_TO || "")
  };
}

function swarmwagePrivateKey(env = {}) {
  const key = String(env.SWARMWAGE_PRIVATE_KEY || "").trim();
  return /^0x[a-fA-F0-9]{64}$/.test(key) ? key : "";
}

function swarmwageAccount(env = {}) {
  const key = swarmwagePrivateKey(env);
  if (!key) return null;
  return privateKeyToAccount(key);
}

function swarmwageAgentId(env = {}) {
  const account = swarmwageAccount(env);
  return account ? account.address.toLowerCase() : "";
}

function swarmwagePaymentTargetsFromEnv(env = {}) {
  return {
    basePayTo: swarmwageAgentId(env),
    solanaPayTo: ""
  };
}

async function signSwarmwagePayload(env = {}, payload = {}) {
  const account = swarmwageAccount(env);
  if (!account) return null;
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  const hash = keccak256(toBytes(canonical));
  return account.signMessage({ message: { raw: hash } });
}

function normalizeEvmAddress(value) {
  const address = String(value || "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(address) ? address : "";
}

function normalizeSolanaAddress(value) {
  const address = String(value || "").trim();
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) ? address : "";
}

function describePaidNetworks(paymentTargets) {
  return [
    paymentTargets.basePayTo ? BASE_MAINNET : null,
    paymentTargets.solanaPayTo ? SOLANA_MAINNET : null
  ].filter(Boolean);
}

function describePayTo(paymentTargets) {
  return Object.fromEntries([
    paymentTargets.basePayTo ? [BASE_MAINNET, paymentTargets.basePayTo] : null,
    paymentTargets.solanaPayTo ? [SOLANA_MAINNET, paymentTargets.solanaPayTo] : null
  ].filter(Boolean));
}

function paidServiceWithEnv(service, env = {}) {
  if (![PAID_TRIAGE_PATH, INDEX_WATCH_PATH, SKILL_TRUST_PATH, A2A_PATH].some(path => String(service.url || "").includes(path))) {
    return service;
  }

  const paymentTargets = paymentTargetsFromEnv(env);
  return {
    ...service,
    networks: describePaidNetworks(paymentTargets),
    payTo: describePayTo(paymentTargets),
    network: paymentTargets.solanaPayTo ? "Base mainnet USDC + Solana mainnet USDC" : "Base mainnet USDC"
  };
}

function paidEndpointInfo({ name, endpoint, useMethod, description, acceptedFields, paymentTargets }) {
  return {
    ok: true,
    service: name,
    paid: true,
    price: USDC_PRICE,
    endpoint,
    use_method: useMethod,
    description,
    accepted_fields: acceptedFields,
    networks: describePaidNetworks(paymentTargets),
    payTo: describePayTo(paymentTargets),
    note: "This GET response is only returned after x402 payment; normal API execution uses the listed method."
  };
}

function x402Manifest(env = {}) {
  const paymentTargets = paymentTargetsFromEnv(env);
  const paidRoutes = [PAID_TRIAGE_PATH, INDEX_WATCH_PATH, SKILL_TRUST_PATH, A2A_PATH]
    .map(path => paidRouteDescriptor(path))
    .filter(Boolean);
  const endpoints = paidRoutes.map(route => x402EndpointDescriptor(route, paymentTargets));
  const generatedAt = new Date().toISOString();

  return {
    x402Version: 2,
    name: "Tate Programs x402 Surface Checks",
    description: "Paid public-surface checks for x402, MPP, Pay.sh, A2A, and agent-skill launch readiness.",
    version: "1.0.0",
    provider: env.BRAND_NAME || "Tate Programs",
    owner_url: "https://tateprograms.com",
    contact_email: "hello@tateprograms.com",
    category: "agent-commerce-readiness",
    base_url: "https://the402.tateprograms.com",
    facilitator: PAYAI_FACILITATOR_URL,
    facilitator_url: PAYAI_FACILITATOR_URL,
    generated_at: generatedAt,
    updated_at: generatedAt,
    dateModified: generatedAt,
    networks: describePaidNetworks(paymentTargets),
    pay_to: describePayTo(paymentTargets),
    endpoints,
    services: endpoints,
    payment_requirements: endpoints.map(endpoint => ({
      resource: endpoint.resource,
      accepts: endpoint.accepts
    })),
    agent_card_url: "https://the402.tateprograms.com/.well-known/agent.json",
    openapi_url: "https://the402.tateprograms.com/openapi.json",
    homepage_url: "https://the402.tateprograms.com/",
    docs_url: "https://tateprograms.com/x402-surface-check.html",
    marketplace: {
      category: "agent-commerce-readiness",
      audience: ["x402 publishers", "agent-payment teams", "marketplace operators"],
      private_report_path: "https://tateprograms.com/agent-commerce-readiness-sprint.html"
    },
    bazaar: {
      name: "Tate Programs x402 Surface Checks",
      description: "Paid public-surface checks for x402, MPP, Pay.sh, A2A, and agent-skill launch readiness.",
      category: "agent-commerce-readiness",
      tags: ["x402", "agent-payments", "mpp", "a2a", "skill-trust", "launch-readiness"],
      owner_url: "https://tateprograms.com",
      contact_email: "hello@tateprograms.com"
    },
    tags: ["x402", "agent-payments", "mpp", "a2a", "skill-trust", "launch-readiness"]
  };
}

function x402EndpointDescriptor(route, paymentTargets) {
  const resource = `https://the402.tateprograms.com${route.path}`;
  return {
    id: route.service,
    method: "POST",
    path: route.path,
    url: resource,
    resource: {
      url: resource,
      description: route.description,
      mimeType: "application/json",
      serviceName: route.displayName,
      tags: ["x402", "agent-payments", "launch-readiness"]
    },
    name: route.displayName,
    description: route.description,
    price: USDC_PRICE,
    price_usd: 0.01,
    category: "agent-commerce-readiness",
    tags: ["x402", "agent-payments", "launch-readiness"],
    owner_url: "https://tateprograms.com",
    contact_email: "hello@tateprograms.com",
    facilitator: PAYAI_FACILITATOR_URL,
    facilitator_url: PAYAI_FACILITATOR_URL,
    network: describePaidNetworks(paymentTargets),
    payTo: describePayTo(paymentTargets),
    accepts: buildAtomicAccepts({
      service: route.service,
      resource,
      paymentTargets
    }),
    extensions: {
      ...route.discovery
    }
  };
}

function openApiSpec(env = {}) {
  const paymentTargets = paymentTargetsFromEnv(env);
  const paymentDescription = `x402 HTTP 402 challenge. Base USDC payTo: ${paymentTargets.basePayTo || "configured by environment"}.`;

  return {
    openapi: "3.1.0",
    info: {
      title: "Tate Programs Agent-Commerce Readiness API",
      version: "1.0.0",
      description: "Paid and free public-surface checks for x402, MPP, Pay.sh, A2A, and agent-skill launches."
    },
    servers: [
      {
        url: "https://the402.tateprograms.com",
        description: "Production"
      }
    ],
    tags: [
      { name: "free", description: "No-payment public triage." },
      { name: "paid", description: "x402-gated paid endpoints." },
      { name: "discovery", description: "Machine-readable marketplace discovery." }
    ],
    paths: {
      "/": {
        get: {
          tags: ["discovery"],
          summary: "Provider overview",
          responses: {
            "200": { description: "HTML provider overview." }
          }
        }
      },
      "/.well-known/x402.json": {
        get: {
          tags: ["discovery"],
          summary: "x402 service manifest",
          responses: {
            "200": {
              description: "Machine-readable paid endpoint manifest.",
              content: {
                "application/json": {
                  schema: { type: "object" }
                }
              }
            }
          }
        }
      },
      "/.well-known/agent.json": {
        get: {
          tags: ["discovery"],
          summary: "A2A agent card",
          responses: {
            "200": {
              description: "A2A agent card with x402 payment metadata.",
              content: {
                "application/json": {
                  schema: { type: "object" }
                }
              }
            }
          }
        }
      },
      "/api/triage": {
        post: {
          tags: ["free"],
          summary: "No-payment x402 surface triage",
          requestBody: requestBodySchema(triageInputSchema()),
          responses: {
            "200": responseSchema("Public surface triage result."),
            "400": errorResponseSchema()
          }
        }
      },
      [PAID_TRIAGE_PATH]: paidPathSpec(
        "Paid x402 surface triage",
        "Returns payment-gated readiness checks for one public x402 or agent-payment surface.",
        triageInputSchema()
      ),
      [INDEX_WATCH_PATH]: paidPathSpec(
        "Paid 402 Index watch",
        "Returns public 402 Index health and launch-readiness signals for a provider, domain, or service query.",
        indexWatchInputSchema()
      ),
      [SKILL_TRUST_PATH]: paidPathSpec(
        "Paid agent skill trust check",
        "Inspects public agent-skill text or documentation before installation.",
        skillTrustInputSchema()
      ),
      [A2A_PATH]: paidPathSpec(
        "Paid A2A agent-payment surface triage",
        "A2A JSON-RPC endpoint for triage, index watch, and skill trust checks.",
        a2aInputSchema()
      )
    },
    components: {
      securitySchemes: {
        x402: {
          type: "http",
          scheme: "x402",
          description: paymentDescription
        }
      },
      schemas: {
        PaymentRequired: {
          type: "object",
          required: ["x402Version", "resource", "accepts"],
          properties: {
            x402Version: { type: "integer", enum: [2] },
            error: { type: "string" },
            resource: { type: "object" },
            accepts: { type: "array", items: { type: "object" } },
            extensions: { type: "object" }
          }
        }
      }
    },
    "x-tate-programs": {
      manifest: "https://the402.tateprograms.com/.well-known/x402.json",
      sales: "https://tateprograms.com/agent-commerce-readiness-sprint.html",
      scope: "Public/no-payment checks unless a customer explicitly supplies test fixtures."
    }
  };
}

function paidPathSpec(summary, description, schema) {
  return {
    post: {
      tags: ["paid"],
      summary,
      description,
      security: [{ x402: [] }],
      requestBody: requestBodySchema(schema),
      responses: {
        "200": responseSchema("Paid check result."),
        "402": {
          description: "x402 payment challenge.",
          headers: {
            "Payment-Required": {
              schema: { type: "string" },
              description: "Base64-encoded x402 payment requirements."
            }
          },
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/PaymentRequired" }
            }
          }
        },
        "400": errorResponseSchema()
      }
    }
  };
}

function requestBodySchema(schema) {
  return {
    required: true,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

function responseSchema(description) {
  return {
    description,
    content: {
      "application/json": {
        schema: { type: "object" }
      }
    }
  };
}

function errorResponseSchema() {
  return {
    description: "Request validation error.",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            error: { type: "string" }
          }
        }
      }
    }
  };
}

function triageInputSchema() {
  return {
    type: "object",
    required: ["url"],
    properties: {
      url: { type: "string", format: "uri" },
      method: { type: "string", enum: ["GET", "POST", "OPTIONS"], default: "GET" },
      origin: { type: "string", format: "uri" }
    }
  };
}

function indexWatchInputSchema() {
  return {
    type: "object",
    required: ["q"],
    properties: {
      q: { type: "string" },
      protocol: { type: "string", enum: ["x402", "L402", "MPP"], default: "x402" },
      health: { type: "string", enum: ["healthy", "degraded", "down", "unknown"] },
      limit: { type: "number", minimum: 1, maximum: 50, default: 25 }
    }
  };
}

function skillTrustInputSchema() {
  return {
    type: "object",
    properties: {
      url: { type: "string", format: "uri" },
      text: { type: "string" }
    }
  };
}

function a2aInputSchema() {
  return {
    type: "object",
    properties: {
      jsonrpc: { type: "string", default: "2.0" },
      method: { type: "string" },
      params: { type: "object" },
      id: {}
    }
  };
}

function providerHomeHtml(env = {}) {
  const manifest = x402Manifest(env);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: "Tate Programs",
    url: "https://the402.tateprograms.com/",
    email: "hello@tateprograms.com",
    serviceType: "Agent-commerce readiness checks",
    areaServed: "Worldwide",
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Agent-commerce readiness API",
      itemListElement: manifest.endpoints.map(endpoint => ({
        "@type": "Offer",
        name: endpoint.name,
        price: "0.01",
        priceCurrency: "USD",
        url: endpoint.url,
        itemOffered: {
          "@type": "Service",
          name: endpoint.name,
          description: endpoint.description
        }
      }))
    }
  };
  const rows = manifest.endpoints
    .map(endpoint => `<tr><td>${escapeHtml(endpoint.name)}</td><td><code>${escapeHtml(endpoint.path)}</code></td><td>${escapeHtml(endpoint.price)}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tate Programs x402 Readiness API</title>
  <meta name="description" content="Paid public-surface checks for x402, A2A, agent-payment, and agent-skill launch readiness.">
  <link rel="canonical" href="https://the402.tateprograms.com/">
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    :root { color-scheme: dark; background: #090b0a; color: #f4f0e8; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 32px; }
    main { width: min(920px, 100%); }
    h1 { font-size: clamp(28px, 5vw, 58px); line-height: 0.95; margin: 0 0 18px; letter-spacing: 0; }
    p { color: #c9c2b7; line-height: 1.55; max-width: 760px; }
    a { color: #64f0be; text-decoration-thickness: 1px; text-underline-offset: 3px; }
    .links { display: flex; flex-wrap: wrap; gap: 10px; margin: 28px 0; }
    .links a { border: 1px solid #2a3b34; border-radius: 6px; padding: 10px 12px; color: #f4f0e8; text-decoration: none; }
    table { width: 100%; border-collapse: collapse; margin-top: 28px; background: #0f1412; border: 1px solid #26332d; }
    th, td { text-align: left; padding: 12px; border-bottom: 1px solid #26332d; vertical-align: top; }
    th { color: #64f0be; font-weight: 700; }
    code { color: #ffe0a3; font-size: 0.92em; }
  </style>
</head>
<body>
  <main>
    <h1>x402 readiness API</h1>
    <p>Tate Programs runs narrow paid checks for agent-commerce launches: payment challenge shape, discovery metadata, browser readability, index health, and install-time skill risk. Public no-payment triage is available; paid endpoints return an x402 challenge before execution.</p>
    <div class="links">
      <a href="/.well-known/x402.json">x402 manifest</a>
      <a href="/openapi.json">OpenAPI</a>
      <a href="/.well-known/agent.json">A2A card</a>
      <a href="https://tateprograms.com/agent-commerce-readiness-sprint.html">Readiness sprint</a>
    </div>
    <table>
      <thead><tr><th>Service</th><th>Path</th><th>Price</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function providerProxyInfo(c, { name, endpoint, useMethod, description, acceptedFields }) {
  const challenge = String(c.req.query("challenge") || "").trim();
  if (challenge) {
    return new Response(challenge, {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  return c.json({
    ok: true,
    service: name,
    paid: true,
    payment_mode: "marketplace_proxy",
    price: USDC_PRICE,
    endpoint,
    use_method: useMethod,
    description,
    accepted_fields: acceptedFields,
    upstream_auth: {
      header: "X-Tate-Provider-Token",
      configured: Boolean(providerProxyToken(c.env))
    },
    note: "For proxy marketplaces that collect payment from the buyer and forward the call with a private upstream auth header. Public x402 buyers should use /api/x402/triage, /api/x402/index-watch, or /api/x402/skill-trust-check instead."
  }, 200, JSON_HEADERS);
}

function agent402UpstreamInfo(c, { name, endpoint, useMethod, description, acceptedFields }) {
  return c.json({
    ok: true,
    service: name,
    paid: true,
    payment_mode: "agent402_forwarded",
    price: USDC_PRICE,
    endpoint,
    use_method: useMethod,
    description,
    accepted_fields: acceptedFields,
    note: "For Agent402 services after Agent402 has collected and verified x402 payment. Public direct x402 buyers should use /api/x402/triage, /api/x402/index-watch, or /api/x402/skill-trust-check instead."
  }, 200, JSON_HEADERS);
}

function providerProxyToken(env = {}) {
  return String(env.PROVIDER_PROXY_TOKEN || env.APIHUB_PROXY_TOKEN || "").trim();
}

async function providerProxyAuth(c, body = "") {
  const expected = providerProxyToken(c.env);
  const headerToken = String(c.req.header("x-tate-provider-token") || c.req.header("x-apihub-provider-token") || "").trim();
  const authHeader = String(c.req.header("authorization") || "").trim();
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const actual = headerToken || bearerToken;

  if (actual && !expected) return { ok: false, status: 503, reason: "provider_proxy_not_configured" };
  if (actual && !timingSafeEqual(actual, expected)) {
    return { ok: false, status: 401, reason: "invalid_provider_proxy_token" };
  }
  if (actual) return { ok: true, mode: "provider_proxy" };

  const agentMintSignature = String(c.req.header("x-agentmint-signature") || "").trim();
  if (agentMintSignature) {
    return verifyAgentMintProxyRequest(c, body, agentMintSignature);
  }

  return { ok: false, status: 401, reason: "missing_provider_proxy_token" };
}

async function verifyAgentMintProxyRequest(c, body, signature) {
  const secrets = agentMintWebhookSecrets(c);
  if (!secrets.length) return { ok: false, status: 503, reason: "agentmint_webhook_secret_not_configured" };

  const actual = signature.startsWith("sha256=") ? signature : `sha256=${signature}`;
  for (const secret of secrets) {
    const expected = await hmacSha256(body, secret);
    if (timingSafeEqual(actual, expected)) {
      return { ok: true, mode: "agentmint" };
    }
  }

  return { ok: false, status: 401, reason: "invalid_agentmint_signature" };
}

function agentMintWebhookSecrets(c) {
  const env = c.env || {};
  const path = new URL(c.req.url).pathname;
  const pathSpecific = path === PROVIDER_PROXY_INDEX_WATCH_PATH
    ? env.AGENTMINT_INDEX_WATCH_WEBHOOK_SECRET
    : path === PROVIDER_PROXY_SKILL_TRUST_PATH
      ? env.AGENTMINT_SKILL_TRUST_WEBHOOK_SECRET
      : env.AGENTMINT_TRIAGE_WEBHOOK_SECRET;

  const all = [
    pathSpecific,
    env.AGENTMINT_WEBHOOK_SECRET,
    env.AGENTMINT_WEBHOOK_SECRETS
  ];

  return all
    .flatMap(value => String(value || "").split(","))
    .map(value => value.trim())
    .filter(Boolean);
}

function providerProxyRequest(c, body, auth) {
  let payloadText = body;

  if (auth.mode === "agentmint") {
    try {
      const parsed = JSON.parse(body || "{}");
      const input = parsed && typeof parsed === "object" && parsed.input && typeof parsed.input === "object"
        ? parsed.input
        : parsed;
      payloadText = JSON.stringify(input || {});
    } catch {
      payloadText = body;
    }
  }

  const headers = new Headers(c.req.raw.headers);
  headers.delete("content-length");

  return new Request(c.req.raw.url, {
    method: c.req.method,
    headers,
    body: payloadText
  });
}

async function providerProxyResult(response, c, auth, service) {
  response.headers.set("x-tate-programs-paid-endpoint", auth.mode === "agentmint" ? "agentmint-webhook" : "provider-proxy");
  applyCors(response.headers, c.req.header("origin"));

  if (auth.mode !== "agentmint") return response;

  const contentType = response.headers.get("content-type") || "";
  const output = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return json({
    output,
    service,
    delivered_by: "Tate Programs",
    mode: "agentmint_webhook"
  }, { status: response.status });
}

function agent402UpstreamResult(response, c) {
  response.headers.set("x-tate-programs-paid-endpoint", "agent402-upstream");
  applyCors(response.headers, c.req.header("origin"));
  return response;
}

function providerProxyAuthError(auth, origin) {
  const headers = corsHeaders(origin, "content-type,x-tate-provider-token,x-apihub-provider-token,x-agentmint-signature,authorization");
  headers.set("content-type", JSON_HEADERS["content-type"]);
  return new Response(JSON.stringify({ error: auth.reason }, null, 2), {
    status: auth.status,
    headers
  });
}

app.get("/", c => new Response(providerHomeHtml(c.env), {
  status: 200,
  headers: HTML_HEADERS
}));

app.get("/robots.txt", () => new Response([
  "User-agent: *",
  "Allow: /",
  "Sitemap: https://tateprograms.com/sitemap.xml"
].join("\n"), {
  status: 200,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  }
}));

app.get("/openapi.json", c => c.json(openApiSpec(c.env), 200, JSON_HEADERS));
app.get("/.well-known/openapi.json", c => c.json(openApiSpec(c.env), 200, JSON_HEADERS));

app.get("/health", c => c.json({
  ok: true,
  service: "tateprograms-the402-provider",
  brand: c.env.BRAND_NAME || "Tate Programs",
  paid_endpoints: [
    `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
    `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
    `https://the402.tateprograms.com${SKILL_TRUST_PATH}`,
    `https://the402.tateprograms.com${SWARMWAGE_HIRE_PATH}`,
    `https://the402.tateprograms.com${PROVIDER_PROXY_SKILL_TRUST_PATH}`
  ]
}, 200, JSON_HEADERS));

app.get("/services", c => c.json({
  provider: c.env.BRAND_NAME || "Tate Programs",
  services: SERVICE_CATALOG.map(service => paidServiceWithEnv(service, c.env))
}, 200, JSON_HEADERS));

app.get("/.well-known/agent-card.json", c => c.json(agentCard(c.env), 200, JSON_HEADERS));
app.get("/.well-known/agent.json", c => c.json(a2aAgentCard(c.env), 200, JSON_HEADERS));
app.get("/.well-known/x402", c => c.json(x402Manifest(c.env), 200, JSON_HEADERS));
app.get("/.well-known/x402.json", c => c.json(x402Manifest(c.env), 200, JSON_HEADERS));
app.get(SWARMWAGE_VERIFY_PATH, async c => {
  const agentId = swarmwageAgentId(c.env);
  if (!agentId) {
    return c.json({ error: "swarmwage_not_configured" }, 503, JSON_HEADERS);
  }
  const nonce = String(c.req.query("nonce") || "");
  if (nonce.length < 8 || nonce.length > 128) {
    return c.json({ error: "invalid_or_missing_nonce" }, 400, JSON_HEADERS);
  }
  const payload = { agent_id: agentId, nonce };
  const signature = await signSwarmwagePayload(c.env, payload);
  return c.json({ ...payload, signature }, 200, JSON_HEADERS);
});

app.get("/.well-known/402index-verify.txt", c => new Response(INDEX_402_VERIFICATION_HASH, {
  status: 200,
  headers: {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  }
}));

app.post("/api/triage", c => triageSurface(c.req.raw));

app.options(TOOLS402_READINESS_PATH, c => new Response(null, {
  status: 204,
  headers: corsHeaders(c.req.header("origin"), "content-type")
}));

app.get(TOOLS402_READINESS_PATH, c => c.json(tools402ReadinessInfo(), 200, JSON_HEADERS));
app.post(TOOLS402_READINESS_PATH, c => tools402ReadinessSnapshot(c.req.raw));

app.options(UCP_READINESS_PATH, c => new Response(null, {
  status: 204,
  headers: corsHeaders(c.req.header("origin"), "content-type")
}));

app.get(UCP_READINESS_PATH, c => ucpJson(ucpReadinessInfo(), c.req.header("origin")));
app.post(UCP_READINESS_PATH, c => ucpReadinessSnapshot(c.req.raw, c.req.header("origin")));

async function paidRouteGuard(c, next) {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(c.req.header("origin")) });
  }

  if (!hasPaymentHeader(c)) {
    return unpaidChallengeResponse(c);
  }

  const response = await getPaidTriageMiddleware(c.env)(c, next);
  const target = response instanceof Response ? response : c.res;
  applyCors(target.headers, c.req.header("origin"));
  target.headers.set("cache-control", "no-store");
  target.headers.set("access-control-expose-headers", "payment-required,x-payment-response");
  return target;
}

function hasPaymentHeader(c) {
  const paymentSignature = c.req.header("payment-signature");
  const xPayment = c.req.header("x-payment");
  return Boolean(
    (typeof paymentSignature === "string" && paymentSignature.trim())
    || (typeof xPayment === "string" && xPayment.trim())
  );
}

function unpaidChallengeResponse(c) {
  const route = paidRouteDescriptor(c.req.path);
  if (!route) {
    return c.json({ error: "not_found" }, 404, JSON_HEADERS);
  }

  const swarmwageTargets = swarmwagePaymentTargetsFromEnv(c.env);
  const paymentTargets = route.path === SWARMWAGE_HIRE_PATH && swarmwageTargets.basePayTo
    ? swarmwageTargets
    : paymentTargetsFromEnv(c.env);
  const resourceUrl = `https://the402.tateprograms.com${route.path}`;
  const body = buildPaymentRequiredBody({
    service: route.service,
    displayName: route.displayName,
    resource: resourceUrl,
    description: route.description,
    discovery: route.discovery,
    scope: route.scope,
    paymentTargets
  });
  const headerBody = {
    x402Version: body.x402Version,
    accepts: body.accepts.map(accept => ({
      ...accept,
      extra: {
        ...accept.extra,
        resource: resourceUrl
      }
    })),
    resource: {
      ...body.resource,
      url: resourceUrl
    },
    extensions: body.extensions
  };
  const headers = new Headers(JSON_HEADERS);
  applyCors(headers, c.req.header("origin"));
  headers.set("payment-required", encodePaymentHeader(headerBody));
  headers.set("access-control-expose-headers", "payment-required,x-payment-response");
  return new Response(JSON.stringify(body, null, 2), {
    status: 402,
    headers
  });
}

function paidRouteDescriptor(path) {
  if (path === PAID_TRIAGE_PATH) {
    return {
      path: PAID_TRIAGE_PATH,
      service: "x402-paid-triage",
      displayName: "x402 Paid Triage API",
      description: "Paid no-payment triage for public x402, MPP, Pay.sh, and agent-payment launch surfaces.",
      discovery: TRIAGE_DISCOVERY,
      scope: "Submit a public HTTPS endpoint or manifest. No payment header, wallet signature, private endpoint guessing, or paid upstream call is attempted."
    };
  }

  if (path === INDEX_WATCH_PATH) {
    return {
      path: INDEX_WATCH_PATH,
      service: "x402-index-watch",
      displayName: "x402 Index Watch API",
      description: "Paid 402 Index health watch for provider, domain, or service search terms.",
      discovery: INDEX_WATCH_DISCOVERY,
      scope: "Submit a provider, domain, or service query. Returns public 402 Index health and launch-readiness signals."
    };
  }

  if (path === SKILL_TRUST_PATH) {
    return {
      path: SKILL_TRUST_PATH,
      service: "agent-skill-trust-check",
      displayName: "Agent Skill Trust Check API",
      description: "Paid public-text trust check for OpenClaw, Hermes, MCP, and SKILL.md agent-skill listings before installation.",
      discovery: SKILL_TRUST_DISCOVERY,
      scope: "Submit a public skill URL, GitHub repo, raw SKILL.md, or pasted skill text. No install, command execution, wallet signature, private repository access, or paid upstream call is attempted."
    };
  }

  if (path === A2A_PATH) {
    return {
      path: A2A_PATH,
      service: "a2a-agent-payment-surface-triage",
      displayName: "Agent Payment Surface Triage A2A",
      description: "A2A JSON-RPC entrypoint for x402 launch triage, 402 Index watch, and agent-skill trust checks.",
      discovery: A2A_DISCOVERY,
      scope: "Send an A2A message with JSON input or plain text. The paid call is routed to public no-payment triage, 402 Index watch, or skill trust checks. No private endpoint guessing or paid upstream call is attempted."
    };
  }

  if (path === SWARMWAGE_HIRE_PATH) {
    return {
      path: SWARMWAGE_HIRE_PATH,
      service: "swarmwage-x402-surface-readiness",
      displayName: "Swarmwage x402 Surface Readiness",
      description: "Swarmwage hire endpoint for x402, MPP, Pay.sh, and agent-payment public-surface readiness triage.",
      discovery: TRIAGE_DISCOVERY,
      scope: "Submit a Swarmwage hire request with a public URL or provider query. The paid result returns Swarmwage-shaped receipt, result, and verification objects."
    };
  }

  return null;
}

function routeDescriptorForResource(service, resource) {
  try {
    const route = paidRouteDescriptor(new URL(resource).pathname);
    if (route) return route;
  } catch {
    // Fall through to a generic descriptor for non-URL resources.
  }

  return {
    path: "",
    service,
    displayName: String(service || "Paid Readiness Check"),
    description: "Paid public-surface readiness check for an agent-commerce launch."
  };
}

app.use(PAID_TRIAGE_PATH, paidRouteGuard);
app.use(INDEX_WATCH_PATH, paidRouteGuard);
app.use(SKILL_TRUST_PATH, paidRouteGuard);
app.use(A2A_PATH, async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "OPTIONS") return paidRouteGuard(c, next);
  return next();
});
app.use(SWARMWAGE_HIRE_PATH, async (c, next) => {
  if (c.req.method === "POST" || c.req.method === "OPTIONS") return paidRouteGuard(c, next);
  return next();
});

app.get(PAID_TRIAGE_PATH, c => c.json(paidEndpointInfo({
  name: "x402 Paid Triage API",
  endpoint: `https://the402.tateprograms.com${PAID_TRIAGE_PATH}`,
  useMethod: "POST",
  description: "Submit a public HTTPS endpoint or manifest for a no-payment external x402 readiness pass.",
  acceptedFields: ["url", "method", "origin"],
  paymentTargets: paymentTargetsFromEnv(c.env)
}), 200, JSON_HEADERS));

app.get(INDEX_WATCH_PATH, c => c.json(paidEndpointInfo({
  name: "x402 Index Watch API",
  endpoint: `https://the402.tateprograms.com${INDEX_WATCH_PATH}`,
  useMethod: "POST",
  description: "Submit a provider, domain, or service query for public 402 Index health and launch-readiness signals.",
  acceptedFields: ["q", "provider", "domain", "url", "protocol", "health", "limit"],
  paymentTargets: paymentTargetsFromEnv(c.env)
}), 200, JSON_HEADERS));

app.get(SKILL_TRUST_PATH, c => c.json(paidEndpointInfo({
  name: "Agent Skill Trust Check API",
  endpoint: `https://the402.tateprograms.com${SKILL_TRUST_PATH}`,
  useMethod: "POST",
  description: "Submit a public skill URL, GitHub repo, raw SKILL.md, or pasted skill text before installation.",
  acceptedFields: ["url", "repo", "skill_url", "text", "skill_text"],
  paymentTargets: paymentTargetsFromEnv(c.env)
}), 200, JSON_HEADERS));

app.get(SWARMWAGE_HIRE_PATH, c => {
  const agentId = swarmwageAgentId(c.env);
  return c.json({
    ok: true,
    service: "Swarmwage x402 Surface Readiness",
    protocol: SWARMWAGE_PROTOCOL_VERSION,
    agent_id: agentId || null,
    endpoint: `https://the402.tateprograms.com${SWARMWAGE_HIRE_PATH}`,
    verify: `https://the402.tateprograms.com${SWARMWAGE_VERIFY_PATH}`,
    capabilities: SWARMWAGE_CAPABILITIES,
    price_usdc: "0.01",
    first_call_free: false,
    network: BASE_MAINNET,
    payment: "x402 exact USDC on Base"
  }, agentId ? 200 : 503, JSON_HEADERS);
});

app.post(PAID_TRIAGE_PATH, async c => {
  const response = await triageSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-paid");
  return response;
});

app.post(INDEX_WATCH_PATH, async c => {
  const response = await indexWatchSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-paid");
  return response;
});

app.post(SKILL_TRUST_PATH, async c => {
  const response = await skillTrustSurface(c.req.raw);
  response.headers.set("x-tate-programs-paid-endpoint", "x402-paid");
  return response;
});

app.post(SWARMWAGE_HIRE_PATH, async c => {
  const response = await swarmwageHireSurface(c);
  response.headers.set("x-tate-programs-paid-endpoint", "swarmwage-x402-paid");
  return response;
});

app.get(A2A_PATH, c => c.json({
  ok: true,
  service: "Agent Payment Surface Triage A2A",
  endpoint: `https://the402.tateprograms.com${A2A_PATH}`,
  method: "POST",
  discovery: "https://the402.tateprograms.com/.well-known/agent.json",
  price: USDC_PRICE,
  networks: describePaidNetworks(paymentTargetsFromEnv(c.env))
}, 200, JSON_HEADERS));

app.post(A2A_PATH, c => a2aSurface(c));

app.options(PROVIDER_PROXY_TRIAGE_PATH, c => new Response(null, {
  status: 204,
  headers: corsHeaders(c.req.header("origin"), "content-type,x-tate-provider-token,x-apihub-provider-token,x-agentmint-signature,authorization")
}));

app.options(PROVIDER_PROXY_INDEX_WATCH_PATH, c => new Response(null, {
  status: 204,
  headers: corsHeaders(c.req.header("origin"), "content-type,x-tate-provider-token,x-apihub-provider-token,x-agentmint-signature,authorization")
}));

app.options(PROVIDER_PROXY_SKILL_TRUST_PATH, c => new Response(null, {
  status: 204,
  headers: corsHeaders(c.req.header("origin"), "content-type,x-tate-provider-token,x-apihub-provider-token,x-agentmint-signature,authorization")
}));

app.get(PROVIDER_PROXY_TRIAGE_PATH, c => providerProxyInfo(c, {
  name: "Provider Proxy Triage API",
  endpoint: `https://the402.tateprograms.com${PROVIDER_PROXY_TRIAGE_PATH}`,
  useMethod: "POST",
  description: "Marketplace-proxy upstream for public x402 launch triage. Requires X-Tate-Provider-Token.",
  acceptedFields: ["url", "method", "origin"]
}));

app.get(PROVIDER_PROXY_INDEX_WATCH_PATH, c => providerProxyInfo(c, {
  name: "Provider Proxy Index Watch API",
  endpoint: `https://the402.tateprograms.com${PROVIDER_PROXY_INDEX_WATCH_PATH}`,
  useMethod: "POST",
  description: "Marketplace-proxy upstream for 402 Index provider health watch. Requires X-Tate-Provider-Token.",
  acceptedFields: ["q", "provider", "domain", "url", "protocol", "health", "limit"]
}));

app.get(PROVIDER_PROXY_SKILL_TRUST_PATH, c => providerProxyInfo(c, {
  name: "Provider Proxy Agent Skill Trust Check API",
  endpoint: `https://the402.tateprograms.com${PROVIDER_PROXY_SKILL_TRUST_PATH}`,
  useMethod: "POST",
  description: "Marketplace-proxy upstream for public OpenClaw, Hermes, MCP, and SKILL.md trust checks. Requires X-Tate-Provider-Token.",
  acceptedFields: ["url", "text", "format"]
}));

app.post(PROVIDER_PROXY_TRIAGE_PATH, async c => {
  const body = await c.req.raw.text();
  const auth = await providerProxyAuth(c, body);
  if (!auth.ok) return providerProxyAuthError(auth, c.req.header("origin"));

  const request = providerProxyRequest(c, body, auth);
  const response = await triageSurface(request);
  return providerProxyResult(response, c, auth, "x402_launch_triage");
});

app.post(PROVIDER_PROXY_INDEX_WATCH_PATH, async c => {
  const body = await c.req.raw.text();
  const auth = await providerProxyAuth(c, body);
  if (!auth.ok) return providerProxyAuthError(auth, c.req.header("origin"));

  const request = providerProxyRequest(c, body, auth);
  const response = await indexWatchSurface(request);
  return providerProxyResult(response, c, auth, "x402_index_watch");
});

app.post(PROVIDER_PROXY_SKILL_TRUST_PATH, async c => {
  const body = await c.req.raw.text();
  const auth = await providerProxyAuth(c, body);
  if (!auth.ok) return providerProxyAuthError(auth, c.req.header("origin"));

  const request = providerProxyRequest(c, body, auth);
  const response = await skillTrustSurface(request);
  return providerProxyResult(response, c, auth, "agent_skill_trust_check");
});

for (const path of [AGENT402_TRIAGE_PATH, AGENT402_INDEX_WATCH_PATH, AGENT402_SKILL_TRUST_PATH]) {
  app.options(path, c => new Response(null, {
    status: 204,
    headers: corsHeaders(c.req.header("origin"), "content-type,authorization,payment-signature,x-payment")
  }));
}

app.get(AGENT402_TRIAGE_PATH, c => agent402UpstreamInfo(c, {
  name: "Agent402 Upstream Triage API",
  endpoint: `https://the402.tateprograms.com${AGENT402_TRIAGE_PATH}`,
  useMethod: "POST",
  description: "Agent402-forwarded upstream for public x402 launch triage after Agent402 payment verification.",
  acceptedFields: ["url", "method", "origin"]
}));

app.get(AGENT402_INDEX_WATCH_PATH, c => agent402UpstreamInfo(c, {
  name: "Agent402 Upstream Index Watch API",
  endpoint: `https://the402.tateprograms.com${AGENT402_INDEX_WATCH_PATH}`,
  useMethod: "POST",
  description: "Agent402-forwarded upstream for 402 Index provider health watch after Agent402 payment verification.",
  acceptedFields: ["q", "provider", "domain", "url", "protocol", "health", "limit"]
}));

app.get(AGENT402_SKILL_TRUST_PATH, c => agent402UpstreamInfo(c, {
  name: "Agent402 Upstream Agent Skill Trust Check API",
  endpoint: `https://the402.tateprograms.com${AGENT402_SKILL_TRUST_PATH}`,
  useMethod: "POST",
  description: "Agent402-forwarded upstream for public OpenClaw, Hermes, MCP, and SKILL.md trust checks after Agent402 payment verification.",
  acceptedFields: ["url", "repo", "skill_url", "text", "skill_text"]
}));

app.post(AGENT402_TRIAGE_PATH, async c => {
  const response = await triageSurface(c.req.raw);
  return agent402UpstreamResult(response, c);
});

app.post(AGENT402_INDEX_WATCH_PATH, async c => {
  const response = await indexWatchSurface(c.req.raw);
  return agent402UpstreamResult(response, c);
});

app.post(AGENT402_SKILL_TRUST_PATH, async c => {
  const response = await skillTrustSurface(c.req.raw);
  return agent402UpstreamResult(response, c);
});

app.get("/webhook/the402", c => c.json({
  ok: true,
  endpoint: "https://the402.tateprograms.com/webhook/the402",
  method: "POST",
  expects: {
    content_type: "application/json",
    platform_secret_header: "X-Platform-Secret",
    signature_header: "X-Webhook-Signature",
    timestamp_header: "X-Webhook-Timestamp"
  },
  configured: {
    api_key: Boolean(c.env.THE402_API_KEY),
    webhook_secret: Boolean(c.env.THE402_WEBHOOK_SECRET),
    notify_webhook: Boolean(c.env.NOTIFY_WEBHOOK_URL)
  },
  accepted_event_types: [...ALLOWED_EVENT_TYPES].sort(),
  note: "This readback never exposes secrets. POST dispatches require the configured platform secret and HMAC signature when enabled."
}, 200, JSON_HEADERS));

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

function tools402ReadinessInfo() {
  return {
    ok: true,
    service: "Tate Programs x402 and agent-commerce readiness snapshot",
    endpoint: `https://the402.tateprograms.com${TOOLS402_READINESS_PATH}`,
    method: "POST",
    inputs: {
      optional_url: "Public HTTPS x402, MPP, UCP, MCP, A2A, OpenAPI, or paid endpoint URL.",
      optional_method: "GET, POST, or OPTIONS. Defaults to GET.",
      optional_origin: "Browser origin to test CORS behavior."
    },
    output: [
      "safe no-payment surface summary",
      "payment/discovery header notes when a URL is provided",
      "browser-readability and retry notes",
      "fixed-scope paid review path"
    ],
    proof: [
      "https://tateprograms.com/case-studies.html",
      "https://tateprograms.com/agent-commerce-readiness-sprint.html"
    ],
    scope: "Public no-payment checks only. No wallet signature, payment header, private endpoint guessing, account login, or paid upstream call."
  };
}

async function tools402ReadinessSnapshot(request) {
  let input = {};
  try {
    input = await request.json();
  } catch {
    input = {};
  }

  const target = String(input.url || input.surface_url || input.endpoint || "").trim();
  if (!target) {
    return json({
      ...tools402ReadinessInfo(),
      mode: "probe_or_instructions",
      checked_at: new Date().toISOString(),
      next_step: "Send {\"url\":\"https://example.com/.well-known/x402\"} for a public no-payment readiness snapshot."
    });
  }

  const safe = validatePublicHttpsUrl(target);
  if (!safe.ok) {
    return json({
      ok: false,
      service: "Tate Programs x402 and agent-commerce readiness snapshot",
      checked_at: new Date().toISOString(),
      error: safe.reason,
      next_step: "Send a public HTTPS URL. Private hosts, localhost, IP literals, and non-HTTPS URLs are intentionally out of scope."
    });
  }

  const triageRequest = new Request("https://the402.tateprograms.com/api/triage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: target,
      method: input.method || "GET",
      origin: input.origin || "https://tateprograms.com"
    })
  });
  const triageResponse = await triageSurface(triageRequest);
  const triageBody = await triageResponse.json().catch(() => ({ error: "unreadable_triage_response" }));

  return json({
    ok: true,
    service: "Tate Programs x402 and agent-commerce readiness snapshot",
    mode: "public_no_payment_triage",
    checked_at: new Date().toISOString(),
    input: {
      url: target,
      method: String(input.method || "GET").toUpperCase(),
      origin: input.origin || "https://tateprograms.com"
    },
    triage_status: triageResponse.status,
    triage: triageBody,
    proof: [
      "https://tateprograms.com/case-studies.html",
      "https://tateprograms.com/agent-commerce-readiness-sprint.html"
    ],
    paid_scope: "For full patch order, receipts, spend boundaries, UCP/AP2/cart behavior, or white-label agency proof, email hello@tateprograms.com."
  });
}

function ucpJson(payload, origin, status = 200) {
  return json(payload, {
    status,
    headers: Object.fromEntries(corsHeaders(origin, "content-type"))
  });
}

function ucpReadinessInfo() {
  return {
    ok: true,
    service: "Tate Programs Universal Cart and UCP readiness snapshot",
    endpoint: `https://the402.tateprograms.com${UCP_READINESS_PATH}`,
    method: "POST",
    inputs: {
      url: "Public merchant, agency demo, product, or storefront URL.",
      optional_origin: "Browser origin for CORS response only."
    },
    output: [
      "well-known UCP profile status",
      "agent-readable docs status",
      "UCP MCP endpoint status",
      "agentic discovery sitemap status",
      "homepage commerce schema hints",
      "catalog/cart/checkout/order risk notes",
      "fixed-scope paid proof path"
    ],
    scope: "Public no-payment discovery only. No login, account creation, cart mutation, checkout attempt, payment, private endpoint guessing, or order lookup."
  };
}

async function ucpReadinessSnapshot(request, requestOrigin) {
  let input;
  try {
    input = await request.json();
  } catch {
    return ucpJson({ error: "invalid_json" }, requestOrigin, 400);
  }

  const rawTarget = String(input.url || input.domain || input.store || "").trim();
  const normalizedTarget = rawTarget && !/^https?:\/\//i.test(rawTarget) ? `https://${rawTarget}` : rawTarget;
  const safe = validatePublicHttpsUrl(normalizedTarget);
  if (!safe.ok) {
    return ucpJson({
      ok: false,
      service: "Tate Programs Universal Cart and UCP readiness snapshot",
      error: safe.reason,
      next_step: "Send a public HTTPS merchant, product, storefront, or agentic commerce demo URL."
    }, requestOrigin, 400);
  }

  const base = new URL(normalizedTarget);
  const origin = `${base.protocol}//${base.host}`;
  const initialCandidates = [
    { id: "homepage", url: normalizedTarget, kind: "homepage" },
    { id: "ucp_profile", url: new URL("/.well-known/ucp", origin).toString(), kind: "ucp" },
    { id: "llms_txt", url: new URL("/llms.txt", origin).toString(), kind: "agent_docs" },
    { id: "llms_full_txt", url: new URL("/llms-full.txt", origin).toString(), kind: "agent_docs" },
    { id: "agents_md", url: new URL("/agents.md", origin).toString(), kind: "agent_docs" },
    { id: "ucp_mcp_default", url: new URL("/api/ucp/mcp", origin).toString(), kind: "mcp", source: "default_path" },
    { id: "robots_txt", url: new URL("/robots.txt", origin).toString(), kind: "agent_docs" },
    { id: "sitemap_xml", url: new URL("/sitemap.xml", origin).toString(), kind: "discovery" },
    { id: "agentic_sitemap", url: new URL("/sitemap_agentic_discovery.xml", origin).toString(), kind: "discovery" }
  ];

  const initialChecks = await Promise.all(initialCandidates.map(fetchUcpCandidate));
  const ucpProfile = initialChecks.find(check => check.id === "ucp_profile");
  const existingCandidateUrls = new Set(initialCandidates.map(candidate => candidate.url));
  const profileCandidates = extractUcpProfileCandidates(ucpProfile, origin)
    .filter(candidate => {
      if (existingCandidateUrls.has(candidate.url)) return false;
      existingCandidateUrls.add(candidate.url);
      return true;
    });
  const profileChecks = await Promise.all(profileCandidates.map(fetchUcpCandidate));
  const checks = [...initialChecks, ...profileChecks];
  const homepage = checks.find(check => check.id === "homepage");
  const ucp = ucpProfile;
  const llms = checks.find(check => check.id === "llms_txt");
  const llmsFull = checks.find(check => check.id === "llms_full_txt");
  const agents = checks.find(check => check.id === "agents_md");
  const mcp = selectBestUcpMcpCheck(checks);
  const sitemap = checks.find(check => check.id === "sitemap_xml");
  const agenticSitemap = checks.find(check => check.id === "agentic_sitemap");
  const schemaSignals = summarizeCommerceSchema(homepage?.body || "");
  const platformSignals = summarizeMerchantPlatform(homepage, checks);
  const findings = buildUcpReadinessFindings({ ucp, llms, llmsFull, agents, mcp, sitemap, agenticSitemap, schemaSignals, platformSignals });
  const score = scoreUcpReadiness({ ucp, llms, llmsFull, agents, mcp, sitemap, agenticSitemap, schemaSignals, platformSignals });

  return ucpJson({
    ok: true,
    service: "Tate Programs Universal Cart and UCP readiness snapshot",
    checked_at: new Date().toISOString(),
    input: {
      url: normalizedTarget,
      origin
    },
    score,
    checks: checks.map(compactUcpCheck),
    schema_signals: schemaSignals,
    platform_signals: platformSignals,
    findings,
    paid_scope: {
      readiness_map: "$750 for one authorized commerce surface",
      launch_sprint: "$2,500+ for white-label rollout support or one implementation pass",
      url: "https://tateprograms.com/universal-cart-readiness.html",
      email: "hello@tateprograms.com"
    },
    scope: "Public no-payment discovery only. No login, account creation, cart mutation, checkout attempt, payment, private endpoint guessing, or order lookup."
  }, requestOrigin);
}

async function fetchUcpCandidate(candidate) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("timeout"), 5000);
  const isMcpListProbe = candidate.kind === "mcp";
  try {
    const response = await fetch(candidate.url, {
      method: isMcpListProbe ? "POST" : "GET",
      headers: {
        accept: candidate.id === "homepage"
          ? "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.2"
          : "application/json,application/xml,text/xml,text/plain,text/markdown,*/*;q=0.2",
        ...(isMcpListProbe ? { "content-type": "application/json" } : {}),
        "user-agent": "TatePrograms-UCP-Readiness/1.0 (+https://tateprograms.com/universal-cart-readiness.html)"
      },
      body: isMcpListProbe
        ? JSON.stringify({ jsonrpc: "2.0", id: "tate-ucp-readiness", method: "tools/list", params: {} })
        : undefined,
      redirect: "follow",
      signal: controller.signal
    });
    const raw = await response.text();
    return {
      ...candidate,
      method: isMcpListProbe ? "POST" : "GET",
      ok: response.ok,
      status: response.status,
      elapsed_ms: Date.now() - started,
      final_url: response.url,
      content_type: response.headers.get("content-type") || null,
      cache_control: response.headers.get("cache-control") || null,
      body: raw.slice(0, 160000)
    };
  } catch (error) {
    return {
      ...candidate,
      method: isMcpListProbe ? "POST" : "GET",
      ok: false,
      status: "fetch_failed",
      elapsed_ms: Date.now() - started,
      final_url: candidate.url,
      content_type: null,
      cache_control: null,
      body: "",
      error: error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function compactUcpCheck(check) {
  const body = check.body || "";
  return {
    id: check.id,
    kind: check.kind,
    source: check.source || null,
    method: check.method || "GET",
    url: check.url,
    final_url: check.final_url,
    ok: Boolean(check.ok),
    status: check.status,
    elapsed_ms: check.elapsed_ms,
    content_type: check.content_type,
    cache_control: check.cache_control,
    bytes_sampled: body.length,
    signals: summarizeUcpBody(check.id, body),
    error: check.error || null
  };
}

function extractUcpProfileCandidates(ucpCheck, origin) {
  const profile = parseJson(ucpCheck?.body || "");
  const services = profile?.ucp?.services || profile?.services;
  if (!services || typeof services !== "object") return [];

  const candidates = [];
  for (const [serviceName, declaration] of Object.entries(services)) {
    const entries = Array.isArray(declaration) ? declaration : [declaration];
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") return;
      const transport = String(entry.transport || "").toLowerCase();
      if (transport !== "mcp") return;
      const endpoint = normalizeProfileEndpoint(entry.endpoint, origin);
      if (!endpoint) return;
      candidates.push({
        id: `ucp_mcp_profile_${candidates.length + 1}`,
        kind: "mcp",
        source: "ucp_profile",
        service: serviceName,
        service_index: index,
        url: endpoint
      });
    });
  }

  return candidates.slice(0, 4);
}

function normalizeProfileEndpoint(value, origin) {
  if (!value || typeof value !== "string") return null;
  let resolved;
  try {
    resolved = new URL(value, origin).toString();
  } catch {
    return null;
  }

  return validatePublicHttpsUrl(resolved).ok ? resolved : null;
}

function summarizeUcpBody(id, body) {
  const lower = body.toLowerCase();
  const signals = [];
  if (!body) return signals;
  if (id === "ucp_profile" || /universal commerce protocol|ucp|capabilities|negotiat/i.test(body)) signals.push("ucp_terms");
  if (/mcp|model context protocol|tools\/list|json-rpc/i.test(body)) signals.push("mcp_terms");
  if (/checkout|cart|order|fulfillment|refund|return/i.test(body)) signals.push("commerce_flow_terms");
  if (/llms\.txt|agents\.md|agent|ai shopping|agentic/i.test(body)) signals.push("agent_discovery_terms");
  if (/shopify|cdn\.shopify\.com|myshopify/i.test(lower)) signals.push("shopify_signal");
  return [...new Set(signals)];
}

function summarizeCommerceSchema(homepageBody) {
  const body = homepageBody || "";
  return {
    has_json_ld: /<script[^>]+application\/ld\+json/i.test(body),
    product_schema: /"@type"\s*:\s*"?Product"?|schema\.org\/Product/i.test(body),
    offer_schema: /"@type"\s*:\s*"?Offer"?|schema\.org\/Offer/i.test(body),
    merchant_return_policy: /MerchantReturnPolicy|hasMerchantReturnPolicy|returnPolicy/i.test(body),
    shipping_details: /OfferShippingDetails|shippingDetails|shippingRate|deliveryTime/i.test(body),
    aggregate_rating: /AggregateRating|reviewRating|ratingValue/i.test(body),
    checkout_or_cart_text: /cart|checkout|buy now|add to cart/i.test(body),
    loyalty_or_subscription_text: /loyalty|reward|subscription|member/i.test(body)
  };
}

function summarizeMerchantPlatform(homepage, checks) {
  const body = homepage?.body || "";
  const headers = `${homepage?.content_type || ""} ${homepage?.cache_control || ""}`;
  const ucp = checks.find(check => check.id === "ucp_profile");
  const llms = checks.find(check => check.id === "llms_txt");
  const llmsFull = checks.find(check => check.id === "llms_full_txt");
  const agents = checks.find(check => check.id === "agents_md");
  const mcp = selectBestUcpMcpCheck(checks);
  const mcpChecks = checks.filter(check => check.kind === "mcp");
  const agenticSitemap = checks.find(check => check.id === "agentic_sitemap");

  return {
    likely_shopify: /Shopify|cdn\.shopify\.com|myshopify|Shopify\.theme|shopify-section/i.test(body),
    has_ucp_profile: Boolean(ucp?.ok),
    has_agent_docs: Boolean(llms?.ok || llmsFull?.ok || agents?.ok),
    has_ucp_mcp: isReachablePublicCheck(mcp),
    ucp_mcp_status: mcp?.status || null,
    ucp_mcp_url: mcp?.url || null,
    ucp_mcp_source: mcp?.source || null,
    ucp_mcp_candidates: mcpChecks.map(check => ({
      url: check.url,
      source: check.source || null,
      status: check.status,
      ok: Boolean(check.ok)
    })),
    has_agentic_sitemap: Boolean(agenticSitemap?.ok),
    homepage_cache_policy: homepage?.cache_control || null,
    homepage_content_type: homepage?.content_type || headers || null
  };
}

function isReachablePublicCheck(check) {
  if (!check || check.status === "fetch_failed") return false;
  const status = Number(check.status);
  return Number.isFinite(status) && status < 500;
}

function selectBestUcpMcpCheck(checks) {
  const mcpChecks = checks.filter(check => check.kind === "mcp");
  return (
    mcpChecks.find(check => check.ok) ||
    mcpChecks.find(isReachablePublicCheck) ||
    mcpChecks.find(check => check.source === "ucp_profile") ||
    mcpChecks[0]
  );
}

function scoreUcpReadiness({ ucp, llms, llmsFull, agents, mcp, sitemap, agenticSitemap, schemaSignals, platformSignals }) {
  let score = 10;
  if (platformSignals.likely_shopify) score += 10;
  if (ucp?.ok) score += 20;
  if (mcp?.ok) score += 15;
  else if (isReachablePublicCheck(mcp)) score += 6;
  if (llms?.ok) score += 10;
  if (llmsFull?.ok) score += 5;
  if (agents?.ok) score += 10;
  if (sitemap?.ok) score += 5;
  if (agenticSitemap?.ok) score += 8;
  if (schemaSignals.product_schema) score += 10;
  if (schemaSignals.offer_schema) score += 8;
  if (schemaSignals.merchant_return_policy) score += 8;
  if (schemaSignals.shipping_details) score += 8;
  if (schemaSignals.checkout_or_cart_text) score += 4;
  return Math.max(0, Math.min(score, 100));
}

function buildUcpReadinessFindings({ ucp, llms, llmsFull, agents, mcp, sitemap, agenticSitemap, schemaSignals, platformSignals }) {
  const findings = [];

  if (ucp?.ok) {
    findings.push("A public `/.well-known/ucp` profile was found.");
  } else {
    findings.push("No public `/.well-known/ucp` profile was found from this no-login check.");
  }

  if (llms?.ok || llmsFull?.ok || agents?.ok) {
    findings.push("At least one agent-readable docs surface (`llms.txt`, `llms-full.txt`, or `agents.md`) was found.");
  } else {
    findings.push("No `llms.txt`, `llms-full.txt`, or `agents.md` agent-doc surface was found.");
  }

  if (mcp?.ok) {
    findings.push(`A public UCP MCP endpoint accepted the safe \`tools/list\` probe at \`${mcp.url}\`.`);
  } else if (isReachablePublicCheck(mcp)) {
    findings.push(`A public UCP MCP endpoint responded at \`${mcp.url}\`, but the safe \`tools/list\` probe did not return HTTP 200.`);
  } else {
    findings.push("No public UCP MCP endpoint was reachable from the default path or the UCP profile.");
  }

  if (agenticSitemap?.ok) {
    findings.push("An agentic discovery sitemap was reachable at `/sitemap_agentic_discovery.xml`.");
  }

  if (!schemaSignals.product_schema) {
    findings.push("Homepage sample did not expose obvious Product structured-data signals.");
  }
  if (!schemaSignals.merchant_return_policy) {
    findings.push("Homepage sample did not expose obvious merchant return policy structured-data signals.");
  }
  if (!schemaSignals.shipping_details) {
    findings.push("Homepage sample did not expose obvious shipping-detail structured-data signals.");
  }
  if (platformSignals.likely_shopify && !ucp?.ok) {
    findings.push("Shopify signals are present, but the public UCP profile was not reachable at the checked well-known path.");
  }
  if (!sitemap?.ok) {
    findings.push("Sitemap was not reachable from the standard `/sitemap.xml` path in this quick pass.");
  }

  findings.push("Manual proof still needed: cart mutation, checkout handoff, payment authorization, order webhooks, refunds/returns, and loyalty/account behavior.");
  return findings;
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

async function skillTrustSurface(request) {
  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, { status: 400 });
  }

  const target = String(input.url || input.repo || input.skill_url || "").trim();
  const pastedText = String(input.text || input.skill_text || "").trim();

  let source = {
    type: "pasted_text",
    url: null,
    label: "pasted skill text",
    text: pastedText.slice(0, 100000)
  };

  if (target) {
    const safe = validatePublicHttpsUrl(target);
    if (!safe.ok) return json({ error: safe.reason }, { status: 400 });

    const fetched = await fetchSkillSource(target);
    if (!fetched.ok) {
      return json({
        ok: false,
        error: "skill_source_fetch_failed",
        reason: fetched.reason,
        attempted: fetched.attempted || [target]
      }, { status: 502 });
    }
    source = fetched;
  } else if (!source.text) {
    return json({
      error: "url_or_text_required",
      accepted_fields: ["url", "text"]
    }, { status: 400 });
  }

  const review = reviewAgentSkillText(source.text, source);

  return json({
    ok: true,
    checked_at: new Date().toISOString(),
    source: {
      type: source.type,
      url: source.url,
      label: source.label,
      bytes_reviewed: source.text.length
    },
    ...review,
    scope: "Public skill/repo text only. No install, command execution, wallet signature, private repository access, paid call, or credential use was attempted."
  });
}

async function fetchSkillSource(target) {
  const url = new URL(target);
  const attempts = candidateSkillSourceUrls(url);
  const errors = [];

  for (const attempt of attempts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort("timeout"), 8000);
    try {
      const response = await fetch(attempt.url, {
        headers: {
          accept: attempt.accept || "text/plain,text/markdown,application/json,*/*",
          "user-agent": "TatePrograms-SkillTrustCheck/1.0"
        },
        signal: controller.signal
      });

      const contentType = response.headers.get("content-type") || "";
      if (!response.ok) {
        errors.push(`${response.status} ${attempt.url}`);
        continue;
      }

      const text = (await response.text()).slice(0, 100000);
      if (!text.trim()) {
        errors.push(`empty ${attempt.url}`);
        continue;
      }

      return {
        ok: true,
        type: attempt.type,
        url: attempt.url,
        label: attempt.label,
        text: normalizeFetchedSkillText(text, contentType)
      };
    } catch (error) {
      errors.push(`${error?.message || String(error)} ${attempt.url}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    ok: false,
    reason: errors[0] || "no_fetch_attempt_succeeded",
    attempted: attempts.map(attempt => attempt.url)
  };
}

function candidateSkillSourceUrls(url) {
  if (url.hostname === "raw.githubusercontent.com") {
    return [{ url: url.toString(), type: "raw_file", label: "raw GitHub file" }];
  }

  if (url.hostname === "github.com") {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 5 && parts[2] === "blob") {
      return [{
        url: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts[3]}/${parts.slice(4).join("/")}`,
        type: "raw_file",
        label: "GitHub blob file"
      }];
    }

    if (parts.length >= 2) {
      const [owner, repo] = parts;
      return [
        "SKILL.md",
        "skills/SKILL.md",
        ".agents/SKILL.md",
        ".codex/skills/SKILL.md",
        "README.md",
        "skill.json",
        "manifest.json"
      ].flatMap(file => ([
        {
          url: `https://raw.githubusercontent.com/${owner}/${repo}/main/${file}`,
          type: "github_repo_file",
          label: `GitHub ${file} on main`
        },
        {
          url: `https://raw.githubusercontent.com/${owner}/${repo}/master/${file}`,
          type: "github_repo_file",
          label: `GitHub ${file} on master`
        }
      ]));
    }
  }

  return [{ url: url.toString(), type: "public_url", label: "public URL" }];
}

function normalizeFetchedSkillText(text, contentType) {
  if (/html/i.test(contentType)) {
    return text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }
  return text;
}

function reviewAgentSkillText(text, source) {
  const normalized = text.toLowerCase();
  const findings = [];
  const positives = [];

  const checks = [
    {
      category: "execution",
      severity: "high",
      pattern: /\b(rm\s+-rf|sudo\s+|curl\s+[^|]+\\|\s*(sh|bash)|wget\s+[^|]+\\|\s*(sh|bash)|eval\s*\(|exec\s*\(|child_process|spawn\s*\(|shell\s*:|bash\s+-c|powershell)\b/i,
      note: "Skill references high-impact shell execution or install patterns. Require an explicit permission boundary and dry-run path."
    },
    {
      category: "secrets",
      severity: "high",
      pattern: /\b(private[_ -]?key|seed phrase|mnemonic|process\.env|\.env|api[_ -]?key|authorization|bearer token|password|credential)\b/i,
      note: "Skill references secrets or credentials. It needs a clear redaction, storage, and non-logging policy."
    },
    {
      category: "wallets_payments",
      severity: "high",
      pattern: /\b(wallet|sign(ature|ing)?|transaction|transfer|usdc|x402|payment|settle|facilitator|private key)\b/i,
      note: "Skill touches wallet or payment semantics. Add spend caps, approval rules, receipt logging, and replay/idempotency controls before use."
    },
    {
      category: "network",
      severity: "medium",
      pattern: /\b(fetch|axios|webhook|http[s]?:\/\/|post\s+to|callback_url|exfiltrate|upload)\b/i,
      note: "Skill can make network calls. Declare allowed domains, payload shape, retry behavior, and data minimization rules."
    },
    {
      category: "prompt_boundary",
      severity: "medium",
      pattern: /\b(ignore previous|ignore all previous|system prompt|developer message|jailbreak|do not reveal|hidden instruction)\b/i,
      note: "Skill text contains prompt-boundary language that should be reviewed for injection or policy-conflict risk."
    },
    {
      category: "persistence",
      severity: "medium",
      pattern: /\b(write file|append to|cron|schedule|background|daemon|startup|launch agent|autostart|database|sqlite|lancedb|memory)\b/i,
      note: "Skill may persist state or run later. Add retention, cleanup, and user-visible change logs."
    }
  ];

  for (const check of checks) {
    if (check.pattern.test(text)) {
      findings.push({
        severity: check.severity,
        category: check.category,
        note: check.note
      });
    }
  }

  const provenanceSignals = [
    ["repository", /\b(repository|github|source)\b/i],
    ["license", /\blicen[cs]e\b/i],
    ["version", /\b(version|semver|release)\b/i],
    ["permissions", /\b(permission|scope|allowlist|denylist|capability)\b/i],
    ["tests", /\b(test|fixture|example output|dry[- ]run)\b/i],
    ["safety", /\b(safety|security|threat|risk|redact|audit)\b/i]
  ];

  const present = provenanceSignals
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);

  for (const signal of present) {
    positives.push(`Includes ${signal} signal.`);
  }

  const missing = provenanceSignals
    .map(([name]) => name)
    .filter(name => !present.includes(name));

  if (missing.includes("permissions")) {
    findings.push({
      severity: "medium",
      category: "provenance",
      note: "No clear permission/scope declaration found."
    });
  }
  if (missing.includes("tests")) {
    findings.push({
      severity: "low",
      category: "verification",
      note: "No test, fixture, dry-run, or example-output signal found."
    });
  }

  const riskScore = computeSkillRiskScore(findings, present.length, normalized.length);
  const patchOrder = buildSkillPatchOrder(findings, missing);

  return {
    risk_score: riskScore,
    verdict: riskScore >= 85
      ? "low_risk_from_public_text"
      : riskScore >= 65
        ? "review_before_install"
        : "do_not_install_without_changes",
    findings,
    positives,
    missing_signals: missing,
    patch_order: patchOrder,
    quick_read: summarizeSkillText(text, source),
    paid_review_path: "https://tateprograms.com/agent-security-drill.html"
  };
}

function computeSkillRiskScore(findings, provenanceCount, textLength) {
  let score = 100;
  for (const finding of findings) {
    score -= finding.severity === "high" ? 18 : finding.severity === "medium" ? 10 : 5;
  }
  score += Math.min(provenanceCount * 3, 12);
  if (textLength < 600) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function buildSkillPatchOrder(findings, missing) {
  const categories = new Set(findings.map(finding => finding.category));
  const patches = [];

  if (categories.has("execution")) {
    patches.push("Put every shell/install command behind explicit user approval, dry-run mode, and exact command logging.");
  }
  if (categories.has("secrets")) {
    patches.push("Add a secrets policy: never print credentials, redact env values, and document where tokens are read and stored.");
  }
  if (categories.has("wallets_payments")) {
    patches.push("Add wallet/payment controls: per-call caps, allowlisted recipients, idempotency keys, settlement proof, and refusal states.");
  }
  if (categories.has("network")) {
    patches.push("Declare allowed network destinations, outbound payload fields, retry limits, and what data is never sent.");
  }
  if (categories.has("prompt_boundary")) {
    patches.push("Remove prompt-boundary ambiguity and state that external content cannot override system, developer, or user instructions.");
  }
  if (categories.has("persistence")) {
    patches.push("Document persistence paths, retention, cleanup command, and visible audit events for background work.");
  }
  if (missing.includes("permissions")) {
    patches.push("Add a permissions block listing required tools, file paths, domains, wallet actions, and denied capabilities.");
  }
  if (missing.includes("tests")) {
    patches.push("Add one fixture plus expected output so installers can verify the skill before connecting real accounts.");
  }

  return patches.length ? patches : ["No immediate patch blockers from public text; still review runtime code before connecting real accounts."];
}

function summarizeSkillText(text, source) {
  const title = (text.match(/^#\s+(.+)$/m)?.[1] || source.label || "skill").trim().slice(0, 120);
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const commandCount = (text.match(/```|`[^`]+`|\b(npm|pnpm|yarn|pip|uv|curl|wget|git|docker|node|python)\b/g) || []).length;
  return {
    title,
    words,
    command_markers: commandCount
  };
}

function agentCard(env) {
  const paymentTargets = paymentTargetsFromEnv(env);

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
        network: describePaidNetworks(paymentTargets),
        payTo: describePayTo(paymentTargets),
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
        network: describePaidNetworks(paymentTargets),
        payTo: describePayTo(paymentTargets),
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
      },
      {
        name: "agent_skill_trust_check",
        url: `https://the402.tateprograms.com${SKILL_TRUST_PATH}`,
        method: "POST",
        price: "$0.01",
        network: describePaidNetworks(paymentTargets),
        payTo: describePayTo(paymentTargets),
        input_schema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "Public GitHub repo, raw SKILL.md, README, manifest, or skill listing URL."
            },
            text: {
              type: "string",
              description: "Optional pasted skill text when no URL is supplied."
            }
          }
        }
      }
    ],
    service_catalog: "https://tateprograms.com/services.json",
    paid_fix_sprint: env.FIX_SPRINT_URL || "https://tateprograms.com/x402-fix-sprint.html"
  };
}

function a2aAgentCard(env) {
  const paymentTargets = paymentTargetsFromEnv(env);
  const resource = `https://the402.tateprograms.com${A2A_PATH}`;
  const accepts = buildAtomicAccepts({
    service: "a2a-agent-payment-surface-triage",
    resource,
    paymentTargets
  });

  return {
    protocolVersion: "1.0",
    name: "Tate Programs Agent Payment Surface Triage",
    description: "A2A JSON-RPC endpoint for paid x402 launch triage, 402 Index health checks, and agent-skill trust checks.",
    version: "0.1.0",
    provider: {
      name: env.BRAND_NAME || "Tate Programs",
      url: env.PUBLIC_SITE || "https://tateprograms.com",
      email: "hello@tateprograms.com"
    },
    supportedInterfaces: [
      {
        url: resource,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0"
      }
    ],
    capabilities: {
      streaming: false,
      pushNotifications: false,
      extensions: [
        {
          uri: A2A_X402_EXTENSION_URI,
          required: false,
          description: "Calls are gated at the HTTP layer with x402 before JSON-RPC execution."
        }
      ]
    },
    skills: [
      {
        id: "x402_launch_triage",
        name: "x402 Launch Triage",
        description: "Check one public manifest, paid endpoint, OpenAPI file, or discovery URL for no-payment launch readiness.",
        tags: ["x402", "agent-payments", "launch-readiness", "cors", "resource-binding"],
        examples: [
          "{\"skill\":\"triage\",\"url\":\"https://api.example.com/.well-known/x402\",\"method\":\"GET\"}"
        ]
      },
      {
        id: "x402_index_watch",
        name: "402 Index Watch",
        description: "Search public 402 Index metadata for provider, domain, service, health, and verification signals.",
        tags: ["x402", "402-index", "marketplace", "service-health"],
        examples: [
          "{\"skill\":\"index_watch\",\"q\":\"example.com\",\"protocol\":\"x402\",\"limit\":10}"
        ]
      },
      {
        id: "agent_skill_trust_check",
        name: "Agent Skill Trust Check",
        description: "Inspect public agent-skill text, SKILL.md files, or repo documentation before installation.",
        tags: ["agent-skills", "openclaw", "mcp", "skill-review", "security"],
        examples: [
          "{\"skill\":\"skill_trust\",\"url\":\"https://github.com/example/agent-skill\"}"
        ]
      }
    ],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    documentationUrl: "https://tateprograms.com/x402-surface-check.html",
    securitySchemes: {
      x402Http: {
        type: "http",
        scheme: "x402",
        description: "HTTP 402 challenge with USDC payment requirements before JSON-RPC execution."
      }
    },
    securityRequirements: [
      {
        x402Http: []
      }
    ],
    service_catalog: "https://the402.tateprograms.com/services",
    "x-tate-programs-x402": {
      price: USDC_PRICE,
      resource,
      networks: describePaidNetworks(paymentTargets),
      payTo: describePayTo(paymentTargets),
      accepts
    }
  };
}

async function a2aSurface(c) {
  let payload;
  try {
    payload = await c.req.json();
  } catch {
    return json(a2aError(null, -32700, "Invalid JSON-RPC body."), { status: 400 });
  }

  const extracted = extractA2aInput(payload);
  if (!extracted.ok) {
    return json(a2aError(payload?.id ?? null, -32602, extracted.reason), { status: 400 });
  }

  const service = chooseA2aService(extracted);
  const request = new Request(`https://the402.tateprograms.com${service.path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(extracted.input)
  });
  const response = await service.run(request);
  const resultPayload = await readResponsePayload(response);

  return json(a2aResult(payload, {
    service: service.name,
    status: response.status,
    data: resultPayload
  }), { status: response.ok ? 200 : 207 });
}

function extractA2aInput(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "Expected a JSON-RPC object." };
  }

  const params = payload.params && typeof payload.params === "object" ? payload.params : {};
  const message = params.message && typeof params.message === "object" ? params.message : {};
  const metadata = [
    payload.metadata,
    params.metadata,
    message.metadata
  ].find(value => value && typeof value === "object") || {};
  const text = extractA2aText(message) || extractA2aText(params) || "";
  const parsedText = parseLooseJson(text);
  const input = {
    ...(parsedText && typeof parsedText === "object" ? parsedText : {}),
    ...(metadata.input && typeof metadata.input === "object" ? metadata.input : {}),
    ...(params.input && typeof params.input === "object" ? params.input : {})
  };
  const explicitSkill = String(input.skill || metadata.skill || params.skill || "").trim();

  if (!Object.keys(input).length && text) {
    const url = firstHttpsUrl(text);
    if (url) input.url = url;
    else input.q = text.slice(0, 160);
  }

  if (!input.url && !input.q && !input.text && !input.skill_text) {
    return {
      ok: false,
      reason: "Provide JSON input, a public URL, a 402 Index query, or skill text in the A2A message."
    };
  }

  return {
    ok: true,
    input,
    text,
    explicitSkill
  };
}

function extractA2aText(container) {
  if (!container || typeof container !== "object") return "";
  const parts = Array.isArray(container.parts) ? container.parts : [];
  return parts
    .map(part => {
      if (!part || typeof part !== "object") return "";
      return String(part.text || part.content || "").trim();
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function parseLooseJson(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function firstHttpsUrl(text) {
  const match = String(text || "").match(/https:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : "";
}

function chooseA2aService(extracted) {
  const input = extracted.input || {};
  const skill = String(extracted.explicitSkill || "").toLowerCase().replace(/[-\s]+/g, "_");
  const text = String(extracted.text || "").toLowerCase();

  if (skill.includes("skill") || input.repo || input.skill_url || input.skill_text) {
    return {
      name: "agent_skill_trust_check",
      path: SKILL_TRUST_PATH,
      run: skillTrustSurface
    };
  }

  if (skill.includes("index") || input.q || input.provider || input.domain || text.includes("402 index")) {
    return {
      name: "x402_index_watch",
      path: INDEX_WATCH_PATH,
      run: indexWatchSurface
    };
  }

  return {
    name: "x402_launch_triage",
    path: PAID_TRIAGE_PATH,
    run: triageSurface
  };
}

async function readResponsePayload(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return {
    body: await response.text()
  };
}

async function swarmwageHireSurface(c) {
  const agentId = swarmwageAgentId(c.env);
  if (!agentId) {
    return new Response(JSON.stringify({ ok: false, error: "swarmwage_not_configured" }, null, 2), {
      status: 503,
      headers: JSON_HEADERS
    });
  }

  let body;
  try {
    body = await c.req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid_json" }, null, 2), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  const capability = String(body.capability || SWARMWAGE_CAPABILITIES[0]).trim().toLowerCase();
  if (!SWARMWAGE_CAPABILITIES.includes(capability)) {
    return new Response(JSON.stringify({
      ok: false,
      error: "unsupported_capability",
      supported_capabilities: SWARMWAGE_CAPABILITIES
    }, null, 2), {
      status: 400,
      headers: JSON_HEADERS
    });
  }

  const params = body.params && typeof body.params === "object" ? body.params : body;
  const query = String(params.q || params.provider || params.domain || params.search || "").trim();
  const targetUrl = String(params.url || params.endpoint || params.manifest || "").trim();
  const input = targetUrl
    ? {
        url: targetUrl,
        method: params.method || "GET",
        origin: params.origin || "https://tateprograms.com"
      }
    : {
        q: query || "x402",
        protocol: params.protocol || "x402",
        health: params.health,
        limit: params.limit || 10
      };

  const upstreamRequest = new Request(c.req.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  const upstream = targetUrl ? await triageSurface(upstreamRequest) : await indexWatchSurface(upstreamRequest);
  const result = await readResponsePayload(upstream);
  const completedAt = Math.floor(Date.now() / 1000);
  const receiptId = `sw_${crypto.randomUUID()}`;
  const verificationOk = upstream.status < 500;

  return new Response(JSON.stringify({
    protocol: SWARMWAGE_PROTOCOL_VERSION,
    receipt: {
      receipt_id: receiptId,
      buyer_id: body.buyer_id || body.buyer || null,
      seller_id: agentId,
      capability,
      tx_hash: null,
      price_paid_usdc: "0.01",
      payment_mode: "direct",
      escrow_provider: null,
      completed_at: completedAt
    },
    result: {
      service: targetUrl ? "x402_launch_triage" : "x402_index_watch",
      input,
      status: upstream.status,
      payload: result
    },
    verification: {
      checks: [
        {
          name: "paid_request_processed",
          passed: verificationOk
        },
        {
          name: "public_surface_only",
          passed: true
        }
      ],
      all_passed: verificationOk
    },
    rating_token: null
  }, null, 2), {
    status: upstream.status >= 500 ? 502 : 200,
    headers: JSON_HEADERS
  });
}

function a2aResult(payload, output) {
  const id = payload?.id ?? null;
  const taskId = payload?.params?.message?.taskId || `task_${crypto.randomUUID()}`;
  const contextId = payload?.params?.message?.contextId || `ctx_${crypto.randomUUID()}`;
  const state = output.status >= 400 ? "failed" : "completed";
  const text = output.status >= 400
    ? `${output.service} returned ${output.status}.`
    : `${output.service} completed.`;

  return {
    jsonrpc: "2.0",
    id,
    result: {
      id: taskId,
      contextId,
      status: {
        state,
        message: {
          role: "agent",
          parts: [
            {
              kind: "text",
              text
            }
          ]
        }
      },
      artifacts: [
        {
          artifactId: "result",
          name: output.service,
          parts: [
            {
              kind: "data",
              data: output.data
            }
          ]
        }
      ],
      metadata: {
        service: output.service,
        delivered_by: "Tate Programs",
        paid_endpoint: true
      }
    }
  };
}

function a2aError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
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

function corsHeaders(origin, allowHeaders = "content-type,x-payment,payment-signature") {
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": allowHeaders,
    "access-control-expose-headers": "payment-required,x-payment-response",
    "access-control-max-age": "600",
    "cache-control": "no-store"
  });
  applyCors(headers, origin);
  return headers;
}

function applyCors(headers, origin) {
  const allowedOrigin = allowedCorsOrigin(origin);
  headers.set("access-control-allow-origin", allowedOrigin);
  headers.append("vary", "Origin");
}

function allowedCorsOrigin(origin) {
  if (!origin) return "https://tateprograms.com";

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol === "https:" && /^([a-z0-9-]+\.)?tateprograms\.com$/i.test(hostname)) {
      return origin;
    }
    if (url.protocol === "https:" && PUBLIC_MARKETPLACE_ORIGINS.has(hostname)) {
      return origin;
    }
  } catch {
    return "https://tateprograms.com";
  }

  return "https://tateprograms.com";
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
