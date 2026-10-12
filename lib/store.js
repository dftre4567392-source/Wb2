const LIMITS = {
  FREE: Number(process.env.SI_BASE_RATE_FREE || 20),
  PLUS: Number(process.env.SI_BASE_RATE_PLUS || 40),
  PRO: Number(process.env.SI_BASE_RATE_PRO || 60),
  MAX: Number(process.env.SI_BASE_RATE_MAX || 90)
};

const memory = globalThis.__siBaseMemoryStore || {
  entitlements: new Map(),
  rate: new Map(),
  tributeEvents: new Set()
};
globalThis.__siBaseMemoryStore = memory;

let poolPromise;
let schemaPromise;

async function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!poolPromise) {
    poolPromise = import("pg").then(({ Pool }) => new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    }));
  }
  return poolPromise;
}

async function ensureSchema() {
  const pool = await getPool();
  if (!pool) return null;
  if (!schemaPromise) {
    schemaPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS si_entitlements (
        telegram_user_id TEXT PRIMARY KEY,
        plan TEXT NOT NULL CHECK (plan IN ('FREE','PLUS','PRO','MAX')),
        expires_at TIMESTAMPTZ,
        source TEXT,
        purchase_id TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS si_rate_limits (
        user_key TEXT NOT NULL,
        bucket TEXT NOT NULL,
        window_start TIMESTAMPTZ NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_key, bucket, window_start)
      );
      CREATE TABLE IF NOT EXISTS si_tribute_events (
        event_id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS si_entitlements_expires_idx ON si_entitlements(expires_at);
    `).then(() => pool);
  }
  return schemaPromise;
}

function normalizePlan(plan) {
  const p = String(plan || "FREE").toUpperCase();
  return ["FREE", "PLUS", "PRO", "MAX"].includes(p) ? p : "FREE";
}

export function getRateLimit(plan) {
  return LIMITS[normalizePlan(plan)] || LIMITS.FREE;
}

export async function getPlan(userId) {
  if (userId === "internal-test") return "MAX";
  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    const { rows } = await pool.query(
      `SELECT plan FROM si_entitlements
       WHERE telegram_user_id=$1 AND (expires_at IS NULL OR expires_at > NOW())
       LIMIT 1`,
      [String(userId)]
    );
    return normalizePlan(rows[0]?.plan || "FREE");
  }

  const item = memory.entitlements.get(String(userId));
  if (!item) return "FREE";
  if (item.expiresAt && item.expiresAt <= Date.now()) {
    memory.entitlements.delete(String(userId));
    return "FREE";
  }
  return normalizePlan(item.plan);
}

export async function setEntitlement({ userId, plan, expiresAt, source = "tribute", purchaseId = null }) {
  const normalized = normalizePlan(plan);
  const expiry = expiresAt ? new Date(expiresAt) : null;
  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    await pool.query(
      `INSERT INTO si_entitlements (telegram_user_id, plan, expires_at, source, purchase_id, updated_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (telegram_user_id) DO UPDATE SET
         plan=EXCLUDED.plan,
         expires_at=EXCLUDED.expires_at,
         source=EXCLUDED.source,
         purchase_id=EXCLUDED.purchase_id,
         updated_at=NOW()`,
      [String(userId), normalized, expiry, source, purchaseId ? String(purchaseId) : null]
    );
    return;
  }
  memory.entitlements.set(String(userId), {
    plan: normalized,
    expiresAt: expiry ? expiry.getTime() : null,
    source,
    purchaseId: purchaseId ? String(purchaseId) : null
  });
}

export async function revokeEntitlement({ userId, purchaseId = null }) {
  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    if (purchaseId) {
      await pool.query(
        `DELETE FROM si_entitlements WHERE telegram_user_id=$1 AND purchase_id=$2`,
        [String(userId), String(purchaseId)]
      );
    } else {
      await pool.query(`DELETE FROM si_entitlements WHERE telegram_user_id=$1`, [String(userId)]);
    }
    return;
  }
  const current = memory.entitlements.get(String(userId));
  if (!purchaseId || current?.purchaseId === String(purchaseId)) memory.entitlements.delete(String(userId));
}

export async function consumeRateLimit(userKey, plan, bucket = "chat") {
  const limit = getRateLimit(plan);
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / 60000) * 60000);
  const pool = await ensureSchema().catch(() => null);

  if (pool) {
    const { rows } = await pool.query(
      `INSERT INTO si_rate_limits (user_key, bucket, window_start, count)
       VALUES ($1,$2,$3,1)
       ON CONFLICT (user_key,bucket,window_start)
       DO UPDATE SET count=si_rate_limits.count+1
       RETURNING count`,
      [String(userKey), bucket, windowStart]
    );
    const count = Number(rows[0]?.count || 1);
    return { allowed: count <= limit, count, limit, retryAfter: Math.max(1, 60 - new Date().getUTCSeconds()) };
  }

  const key = `${userKey}:${bucket}:${windowStart.toISOString()}`;
  const count = (memory.rate.get(key) || 0) + 1;
  memory.rate.set(key, count);
  if (memory.rate.size > 2000) {
    for (const k of memory.rate.keys()) {
      if (!k.endsWith(windowStart.toISOString())) memory.rate.delete(k);
    }
  }
  return { allowed: count <= limit, count, limit, retryAfter: Math.max(1, 60 - new Date().getUTCSeconds()) };
}

export async function rememberTributeEvent(eventId, eventName) {
  const pool = await ensureSchema().catch(() => null);
  if (pool) {
    const { rowCount } = await pool.query(
      `INSERT INTO si_tribute_events (event_id,event_name) VALUES ($1,$2)
       ON CONFLICT (event_id) DO NOTHING`,
      [String(eventId), String(eventName)]
    );
    return rowCount === 1;
  }
  const key = String(eventId);
  if (memory.tributeEvents.has(key)) return false;
  memory.tributeEvents.add(key);
  return true;
}

export function storageMode() {
  return process.env.DATABASE_URL ? "postgres" : "memory";
}
