export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SI_BASE_RUN_STARTUP_SELFTEST !== "1") return;

  const startedAt = Date.now();
  const report = {
    version: 1,
    startedAt: new Date().toISOString(),
    storage: "unknown",
    telegram: { configured: Boolean(process.env.TELEGRAM_BOT_TOKEN), signature: false, api: null },
    tribute: { configured: Boolean(process.env.TRIBUTE_API_KEY), signature: false, api: null },
    rateLimit: null,
    ai: []
  };

  try {
    const crypto = await import("node:crypto");
    const { verifyTelegramInitData, verifyTributeSignature } = await import("./lib/security.js");
    const { consumeRateLimit, getRateLimit, storageMode } = await import("./lib/store.js");
    const { MODELS } = await import("./lib/config.js");

    report.storage = storageMode();

    if (process.env.TELEGRAM_BOT_TOKEN) {
      const user = JSON.stringify({ id: 999000111, first_name: "Selftest" });
      const authDate = Math.floor(Date.now() / 1000);
      const pairs = [`auth_date=${authDate}`, `user=${user}`].sort();
      const dataCheck = pairs.join("\n");
      const secret = crypto.createHmac("sha256", "WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
      const hash = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
      const initData = new URLSearchParams({ auth_date: String(authDate), user, hash }).toString();
      report.telegram.signature = Boolean(verifyTelegramInitData(initData)?.ok);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`, {
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timer);
        const data = await r.json().catch(() => ({}));
        report.telegram.api = { status: r.status, ok: Boolean(r.ok && data?.ok) };
      } catch (e) {
        report.telegram.api = { status: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
      }
    }

    if (process.env.TRIBUTE_API_KEY) {
      const raw = JSON.stringify({ name: "selftest", payload: {} });
      const signature = crypto.createHmac("sha256", process.env.TRIBUTE_API_KEY).update(raw).digest("hex");
      report.tribute.signature = Boolean(verifyTributeSignature(raw, signature)?.ok);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const r = await fetch("https://tribute.tg/api/v1/products?size=1", {
          headers: { "Api-Key": process.env.TRIBUTE_API_KEY, Accept: "application/json" },
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timer);
        report.tribute.api = { status: r.status, ok: r.ok };
      } catch (e) {
        report.tribute.api = { status: 0, ok: false, error: e?.name === "AbortError" ? "timeout" : "network" };
      }
    }

    try {
      const plan = "MAX";
      const limit = getRateLimit(plan);
      const userKey = `startup-selftest-${Date.now()}`;
      let firstBlockedAt = null;
      for (let i = 1; i <= limit + 1; i++) {
        const result = await consumeRateLimit(userKey, plan, "selftest");
        if (!result.allowed && firstBlockedAt == null) firstBlockedAt = i;
      }
      report.rateLimit = {
        plan,
        configured: limit,
        firstBlockedAt,
        ok: firstBlockedAt === limit + 1
      };
    } catch (e) {
      report.rateLimit = { ok: false, error: "store" };
    }

    const apiKey = process.env.MIXROUTER_API_KEY;
    const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");
    const entries = Object.entries(MODELS);

    async function probe([key, model]) {
      if (!apiKey) return { key, model, status: 0, ok: false, error: "missing_key", ms: 0 };
      const started = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Ответь ровно: OK" }],
            max_tokens: 8,
            stream: false
          }),
          signal: controller.signal,
          cache: "no-store"
        });
        clearTimeout(timer);
        const body = await r.text();
        let category = null;
        if (r.status === 402 || /insufficient balance/i.test(body)) category = "balance";
        else if (r.status === 429) category = "rate_limit";
        else if (!r.ok && /no available channel/i.test(body)) category = "no_channel";
        else if (!r.ok) category = "provider_error";
        return { key, model, status: r.status, ok: r.ok, category, ms: Date.now() - started };
      } catch (e) {
        return { key, model, status: 0, ok: false, category: e?.name === "AbortError" ? "timeout" : "network", ms: Date.now() - started };
      }
    }

    for (let i = 0; i < entries.length; i += 3) {
      const batch = await Promise.all(entries.slice(i, i + 3).map(probe));
      report.ai.push(...batch);
    }
  } catch (e) {
    report.fatal = e?.message || "selftest_failed";
  }

  report.totalMs = Date.now() - startedAt;
  console.log("SI_BASE_SELFTEST " + JSON.stringify(report));
}
