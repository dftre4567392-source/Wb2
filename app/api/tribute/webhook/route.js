import crypto from "node:crypto";
import { verifyTributeSignature } from "../../../../lib/security.js";
import { rememberTributeEvent, revokeEntitlement, setEntitlement, storageMode } from "../../../../lib/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 100 * 1024;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function planFromPayload(payload = {}) {
  const productId = String(payload.product_id ?? payload.subscription_id ?? "");
  const idMap = [
    [process.env.TRIBUTE_PRODUCT_MAX_ID, "MAX"],
    [process.env.TRIBUTE_PRODUCT_PRO_ID, "PRO"],
    [process.env.TRIBUTE_PRODUCT_PLUS_ID, "PLUS"]
  ];
  for (const [id, plan] of idMap) {
    if (id && String(id) === productId) return plan;
  }

  const label = [
    payload.product_name,
    payload.subscription_name,
    payload.name,
    payload.title,
    payload.tier
  ].filter(Boolean).join(" ").toUpperCase();
  if (/\bMAX\b/.test(label)) return "MAX";
  if (/\bPRO\b/.test(label)) return "PRO";
  if (/\bPLUS\b/.test(label)) return "PLUS";
  return null;
}

function eventIdentity(event) {
  const p = event?.payload || {};
  const stable = JSON.stringify({
    name: event?.name || "unknown",
    created_at: event?.created_at || "",
    purchase_id: p.purchase_id ?? null,
    transaction_id: p.transaction_id ?? null,
    product_id: p.product_id ?? null,
    telegram_user_id: p.telegram_user_id ?? null,
    amount: p.amount ?? null,
    currency: p.currency ?? null
  });
  return crypto.createHash("sha256").update(stable).digest("hex");
}

function expiryFromPayload(payload = {}) {
  for (const value of [payload.expires_at, payload.expiration_date, payload.end_date, payload.subscription_expires_at]) {
    if (!value) continue;
    const d = new Date(value);
    if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) return d;
  }
  return new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
}

export async function POST(req) {
  try {
    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: "Webhook body too large." }, 413);

    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ error: "Webhook body too large." }, 413);

    const signature = req.headers.get("trbt-signature") || "";
    const verified = verifyTributeSignature(raw, signature);
    if (!verified.ok) return json({ error: verified.error }, verified.status || 401);

    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid webhook JSON." }, 400);
    }

    const name = String(event?.name || "");
    const payload = event?.payload;
    if (!name || !payload || typeof payload !== "object") return json({ error: "Invalid webhook payload." }, 400);

    const eventId = eventIdentity(event);
    const fresh = await rememberTributeEvent(eventId, name);
    if (!fresh) return json({ status: "ok", duplicate: true });

    const userIdRaw = payload.telegram_user_id;
    const userId = userIdRaw == null ? "" : String(userIdRaw);
    const purchaseId = payload.purchase_id ?? payload.transaction_id ?? payload.subscription_id ?? null;

    if (name === "digital_product_refunded") {
      if (userId) await revokeEntitlement({ userId, purchaseId });
      return json({ status: "ok", action: userId ? "revoked" : "ignored", storage: storageMode() });
    }

    if (["new_digital_product", "new_subscription", "renewed_subscription"].includes(name)) {
      const plan = planFromPayload(payload);
      if (!userId || !plan) {
        console.warn("Tribute event verified but entitlement was not mapped", {
          name,
          hasTelegramUser: Boolean(userId),
          productId: payload.product_id ?? null
        });
        return json({ status: "ok", action: "verified_unmapped", storage: storageMode() });
      }

      await setEntitlement({
        userId,
        plan,
        expiresAt: expiryFromPayload(payload),
        source: "tribute",
        purchaseId
      });
      return json({ status: "ok", action: "entitlement_updated", plan, storage: storageMode() });
    }

    if (name === "cancelled_subscription") {
      return json({ status: "ok", action: "verified_cancellation", storage: storageMode() });
    }

    return json({ status: "ok", action: "ignored", storage: storageMode() });
  } catch (error) {
    console.error("Tribute webhook error", error?.message || error);
    return json({ error: "Webhook processing failed." }, 500);
  }
}
