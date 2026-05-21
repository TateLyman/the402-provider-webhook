#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes } from "viem";

const API = "https://api.tools402.dev";
const PK_FILE = process.env.TOOLS402_PK_FILE || "/Users/tatelyman/.codex/secrets/tools402-tate-programs-seller.pk";
const STATE_FILE = process.env.TOOLS402_STATE_FILE || "/Users/tatelyman/.codex/secrets/tools402-tate-programs-seller.json";
const SLUG = "tate-programs";
const PATH_SUFFIX = "x402-readiness";
const UPSTREAM_URL = "https://the402.tateprograms.com/api/tools402/readiness-snapshot";
const ATOMIC_PRICE = 10000;
const DESC = "Safe no-payment x402 and agent-commerce readiness snapshot with proof links and paid review path.";
const MODE = "proxy";
const DOMAIN = { name: "tools402", version: "1", chainId: 8453 };
const TYPES = {
  SellerAction: [
    { name: "wallet", type: "address" },
    { name: "action", type: "string" },
    { name: "payloadHash", type: "bytes32" },
    { name: "timestamp", type: "uint256" }
  ]
};

function loadOrCreatePrivateKey() {
  mkdirSync(dirname(PK_FILE), { recursive: true });
  if (existsSync(PK_FILE)) {
    return readFileSync(PK_FILE, "utf8").trim();
  }

  const privateKey = generatePrivateKey();
  writeFileSync(PK_FILE, privateKey, { mode: 0o600 });
  return privateKey;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function sellerSignature(account, action, payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const payloadHash = keccak256(toBytes(payload));
  const signature = await account.signTypedData({
    domain: DOMAIN,
    types: TYPES,
    primaryType: "SellerAction",
    message: {
      wallet: account.address,
      action,
      payloadHash,
      timestamp: BigInt(timestamp)
    }
  });

  return { signature, timestamp };
}

async function main() {
  const account = privateKeyToAccount(loadOrCreatePrivateKey());
  const targetPath = `/v1/${SLUG}/${PATH_SUFFIX}`;
  const meta = await fetch(`${API}/v1/_meta`).then(readJson);
  const endpoints = Array.isArray(meta?.endpoints) ? meta.endpoints : [];
  const alreadySeller = endpoints.some(endpoint => endpoint.seller?.toLowerCase?.() === account.address.toLowerCase());
  const alreadyPublished = endpoints.some(endpoint => endpoint.path === targetPath);

  if (!alreadySeller) {
    const auth = await sellerSignature(account, "register", SLUG);
    const response = await fetch(`${API}/v1/_seller/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        wallet: account.address,
        slug: SLUG,
        signature: auth.signature,
        timestamp: auth.timestamp
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new Error(`register failed (${response.status}): ${JSON.stringify(body)}`);
    }
  }

  if (!alreadyPublished) {
    const endpoint = {
      path_suffix: PATH_SUFFIX,
      upstream_url: UPSTREAM_URL,
      atomic_price: ATOMIC_PRICE,
      unit: "call",
      desc: DESC,
      mode: MODE
    };
    const auth = await sellerSignature(account, "add_endpoint", JSON.stringify(endpoint));
    const response = await fetch(`${API}/v1/_seller/${account.address}/endpoints`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...endpoint,
        signature: auth.signature,
        timestamp: auth.timestamp
      })
    });
    const body = await readJson(response);
    if (!response.ok) {
      throw new Error(`add_endpoint failed (${response.status}): ${JSON.stringify(body)}`);
    }
  }

  const state = {
    marketplace: "tools402",
    seller_wallet: account.address,
    slug: SLUG,
    path: targetPath,
    url: `${API}${targetPath}`,
    upstream_url: UPSTREAM_URL,
    atomic_price: ATOMIC_PRICE,
    price_usd: ATOMIC_PRICE / 1_000_000,
    mode: MODE,
    private_key_file: PK_FILE,
    updated_at: new Date().toISOString()
  };
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });

  console.log(JSON.stringify({
    ok: true,
    seller_wallet: state.seller_wallet,
    url: state.url,
    price_usd: state.price_usd,
    mode: state.mode,
    state_file: STATE_FILE
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
