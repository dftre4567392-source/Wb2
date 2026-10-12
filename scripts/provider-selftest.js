const key = process.env.MIXROUTER_API_KEY;
const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");

if (!key) {
  console.log("[provider-selftest] skipped: MIXROUTER_API_KEY missing");
  process.exit(0);
}

async function parse(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 400) }; }
}

async function testModel(model) {
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "OK" }],
      max_tokens: 2,
      stream: false
    })
  });
  const payload = await parse(response);
  return {
    ok: response.ok,
    status: response.status,
    model,
    content: payload?.choices?.[0]?.message?.content || null,
    error: response.ok ? null : (payload?.error?.message || payload?.message || payload?.raw || null)
  };
}

try {
  const modelsResponse = await fetch(`${base}/models`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store"
  });
  const modelsPayload = await parse(modelsResponse);
  const ids = Array.isArray(modelsPayload?.data)
    ? modelsPayload.data.map(item => item?.id).filter(Boolean)
    : [];

  console.log("[provider-models]", JSON.stringify({ status: modelsResponse.status, count: ids.length }));

  const preferred = [
    "glm-4-flash",
    "qwen3.6-flash",
    "deepseek-v4-flash",
    "deepseek-v3",
    "hy-mt2-plus",
    "qwen3.6-35b-a3b"
  ];
  const lightweight = ids.filter(id => /free|flash|mini|lite/i.test(id));
  const candidates = [...new Set([...preferred, ...lightweight])].slice(0, 18);
  console.log("[provider-candidates]", JSON.stringify(candidates));

  let selected = null;
  for (const model of candidates) {
    try {
      const result = await testModel(model);
      console.log("[provider-probe]", JSON.stringify(result));
      if (result.ok) {
        selected = model;
        break;
      }
    } catch (error) {
      console.log("[provider-probe]", JSON.stringify({ ok: false, model, error: error?.message || String(error) }));
    }
  }

  console.log("[provider-selected]", JSON.stringify({ model: selected }));
} catch (error) {
  console.log("[provider-selftest]", JSON.stringify({ ok: false, error: error?.message || String(error) }));
}
