const key = process.env.MIXROUTER_API_KEY;
const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");
const model = process.env.MIXROUTER_MODEL_QWEN || "glm-4-flash";

if (!key) {
  console.log("[provider-selftest] skipped: MIXROUTER_API_KEY missing");
  process.exit(0);
}

try {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Ответь одним словом: OK" }],
      max_tokens: 8,
      stream: false
    })
  });

  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = { raw: text.slice(0, 300) }; }
  const content = payload?.choices?.[0]?.message?.content || null;
  const error = payload?.error?.message || payload?.message || payload?.raw || null;
  console.log("[provider-selftest]", JSON.stringify({ ok: response.ok, status: response.status, model, content, error }));
} catch (error) {
  console.log("[provider-selftest]", JSON.stringify({ ok: false, model, error: error?.message || String(error) }));
}
