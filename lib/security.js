import crypto from "node:crypto";

export const PLAN_RANK = { FREE: 0, PLUS: 1, PRO: 2, MAX: 3 };
export const MODEL_MIN_PLAN = {
  qwen: "FREE",
  deepseek: "FREE",
  gpt: "PLUS",
  gemini: "PLUS",
  grok: "PRO",
  claude: "MAX"
};

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function verifyTelegramInitData(initData, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!botToken) return { ok: false, status: 503, error: "Telegram auth is not configured." };
  if (!initData || typeof initData !== "string" || initData.length > 20000) {
    return { ok: false, status: 401, error: "Telegram authorization required." };
  }

  const params = new URLSearchParams(initData);
  const seen = new Set();
  for (const [key] of params) {
    if (seen.has(key)) return { ok: false, status: 401, error: "Invalid Telegram data." };
    seen.add(key);
  }

  const hash = params.get("hash") || "";
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    return { ok: false, status: 401, error: "Invalid Telegram signature." };
  }

  const authDate = Number(params.get("auth_date"));
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate <= 0 || authDate > now + 30 || now - authDate > 3600) {
    return { ok: false, status: 401, error: "Telegram session expired." };
  }

  const check = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    check.push(`${key}=${value}`);
  }
  check.sort();
  const dataCheckString = check.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (!safeEqual(calculated.toLowerCase(), hash.toLowerCase())) {
    return { ok: false, status: 401, error: "Invalid Telegram signature." };
  }

  let user;
  try {
    user = JSON.parse(params.get("user") || "{}");
  } catch {
    return { ok: false, status: 401, error: "Invalid Telegram user." };
  }

  const id = Number(user?.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, status: 401, error: "Invalid Telegram user." };
  }

  return {
    ok: true,
    user: {
      id: String(id),
      username: typeof user.username === "string" ? user.username.slice(0, 64) : "",
      firstName: typeof user.first_name === "string" ? user.first_name.slice(0, 128) : ""
    },
    authDate
  };
}

export function authenticateRequest(req) {
  const internal = process.env.SI_BASE_INTERNAL_TEST_TOKEN;
  const suppliedInternal = req.headers.get("x-si-internal-test") || "";
  if (internal && suppliedInternal && safeEqual(internal, suppliedInternal)) {
    return { ok: true, internal: true, user: { id: "internal-test", username: "internal", firstName: "Internal" } };
  }

  return verifyTelegramInitData(req.headers.get("x-telegram-init-data") || "");
}

export function canUseModel(plan, modelKey) {
  const normalized = String(plan || "FREE").toUpperCase();
  const required = MODEL_MIN_PLAN[modelKey] || "MAX";
  return (PLAN_RANK[normalized] ?? 0) >= PLAN_RANK[required];
}

export function requiredPlanForModel(modelKey) {
  return MODEL_MIN_PLAN[modelKey] || "MAX";
}

export function verifyTributeSignature(rawBody, signature, apiKey = process.env.TRIBUTE_API_KEY) {
  if (!apiKey) return { ok: false, status: 503, error: "Tribute is not configured." };
  if (!signature || typeof signature !== "string") return { ok: false, status: 401, error: "Missing Tribute signature." };

  const expected = crypto.createHmac("sha256", apiKey).update(rawBody).digest("hex");
  const clean = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(clean) || !safeEqual(expected, clean)) {
    return { ok: false, status: 401, error: "Invalid Tribute signature." };
  }
  return { ok: true };
}
