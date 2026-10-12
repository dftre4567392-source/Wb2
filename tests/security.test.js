import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import JSZip from "jszip";

process.env.TELEGRAM_BOT_TOKEN = "test-telegram-token";
process.env.TRIBUTE_API_KEY = "test-tribute-secret";
process.env.MIXROUTER_API_KEY = "test-mixroute-key";
delete process.env.DATABASE_URL;

const security = await import("../lib/security.js");
const store = await import("../lib/store.js");
const authRoute = await import("../app/api/auth/telegram/route.js");
const chatRoute = await import("../app/api/chat/route.js");
const filesRoute = await import("../app/api/files/route.js");
const tributeRoute = await import("../app/api/tribute/webhook/route.js");

function telegramInitData(userId, authDate = Math.floor(Date.now() / 1000)) {
  const user = JSON.stringify({ id: userId, first_name: "Test" });
  const check = [`auth_date=${authDate}`, `user=${user}`].sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
  const hash = crypto.createHmac("sha256", secret).update(check).digest("hex");
  return new URLSearchParams({ auth_date: String(authDate), user, hash }).toString();
}

function tributeRequest(event) {
  const raw = JSON.stringify(event);
  const signature = crypto.createHmac("sha256", process.env.TRIBUTE_API_KEY).update(raw).digest("hex");
  return new Request("http://localhost/api/tribute/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "trbt-signature": signature },
    body: raw
  });
}

test("Telegram initData accepts a valid signature and rejects stale data", () => {
  const valid = security.verifyTelegramInitData(telegramInitData(101));
  assert.equal(valid.ok, true);
  assert.equal(valid.user.id, "101");

  const stale = security.verifyTelegramInitData(telegramInitData(101, Math.floor(Date.now() / 1000) - 7200));
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 401);
});

test("any new Telegram user is accepted automatically on FREE without registration", async () => {
  const userId = 987654321;
  const response = await authRoute.GET(new Request("http://localhost/api/auth/telegram", {
    headers: { "x-telegram-init-data": telegramInitData(userId) }
  }));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.user.id, String(userId));
  assert.equal(body.plan, "FREE");
  assert.equal(await store.getPlan(userId), "FREE");
});

test("FREE rate limit allows 20 requests and blocks request 21", async () => {
  const user = `rate-${Date.now()}`;
  for (let i = 1; i <= 20; i++) {
    const r = await store.consumeRateLimit(user, "FREE", "unit");
    assert.equal(r.allowed, true, `request ${i} should be allowed`);
    assert.equal(r.limit, 20);
  }
  const blocked = await store.consumeRateLimit(user, "FREE", "unit");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.count, 21);
});

test("Tribute purchase is idempotent and refund revokes entitlement", async () => {
  const userId = `tribute-${Date.now()}`;
  const purchase = {
    name: "new_digital_product",
    created_at: new Date().toISOString(),
    payload: {
      telegram_user_id: userId,
      product_name: "SI BASE PRO",
      purchase_id: "purchase-unit-1"
    }
  };

  const first = await tributeRoute.POST(tributeRequest(purchase));
  assert.equal(first.status, 200);
  assert.equal((await first.json()).action, "entitlement_updated");
  assert.equal(await store.getPlan(userId), "PRO");

  const duplicate = await tributeRoute.POST(tributeRequest(purchase));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);

  const refund = {
    name: "digital_product_refunded",
    created_at: new Date(Date.now() + 1000).toISOString(),
    payload: {
      telegram_user_id: userId,
      product_name: "SI BASE PRO",
      purchase_id: "purchase-unit-1"
    }
  };
  const refunded = await tributeRoute.POST(tributeRequest(refund));
  assert.equal(refunded.status, 200);
  assert.equal((await refunded.json()).action, "revoked");
  assert.equal(await store.getPlan(userId), "FREE");
});

test("chat rejects anonymous users and gates MAX model for FREE users", async () => {
  const anonymous = await chatRoute.POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "qwen", messages: [{ role: "user", content: "OK" }] })
  }));
  assert.equal(anonymous.status, 401);

  const gated = await chatRoute.POST(new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-init-data": telegramInitData(202)
    },
    body: JSON.stringify({ model: "claude", messages: [{ role: "user", content: "OK" }] })
  }));
  assert.equal(gated.status, 403);
  assert.equal((await gated.json()).requiredPlan, "MAX");
});

test("protected file endpoint extracts TXT and bounded DOCX text", async () => {
  const initData = telegramInitData(303);

  const textForm = new FormData();
  textForm.append("file", new Blob(["SI BASE file test"], { type: "text/plain" }), "test.txt");
  const textResponse = await filesRoute.POST(new Request("http://localhost/api/files", {
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: textForm
  }));
  assert.equal(textResponse.status, 200);
  assert.equal((await textResponse.json()).text, "SI BASE file test");

  const zip = new JSZip();
  zip.file("word/document.xml", "<?xml version=\"1.0\"?><w:document xmlns:w=\"urn:test\"><w:body><w:p><w:r><w:t>Hello &amp; SI BASE</w:t></w:r></w:p></w:body></w:document>");
  const docx = await zip.generateAsync({ type: "uint8array" });
  const docxForm = new FormData();
  docxForm.append("file", new Blob([docx], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "test.docx");
  const docxResponse = await filesRoute.POST(new Request("http://localhost/api/files", {
    method: "POST",
    headers: { "x-telegram-init-data": initData },
    body: docxForm
  }));
  assert.equal(docxResponse.status, 200);
  assert.equal((await docxResponse.json()).text, "Hello & SI BASE");
});
