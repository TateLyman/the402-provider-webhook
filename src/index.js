const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

const ALLOWED_EVENT_TYPES = new Set([
  "job_dispatch",
  "thread_inquiry",
  "quote_request",
  "new_inquiry",
  "new_message",
  "price_accepted"
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        service: "tateprograms-the402-provider",
        brand: env.BRAND_NAME || "Tate Programs"
      });
    }

    if (request.method === "POST" && url.pathname === "/webhook/the402") {
      return handleWebhook(request, env, ctx);
    }

    return json({ error: "not_found" }, { status: 404 });
  }
};

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

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload, null, 2), {
    ...init,
    headers: {
      ...JSON_HEADERS,
      ...(init.headers || {})
    }
  });
}
