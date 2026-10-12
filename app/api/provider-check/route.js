export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req) {
  const url = new URL(req.url);
  const supplied = url.searchParams.get("token") || "";
  const expected = process.env.SI_BASE_INTERNAL_TEST_TOKEN || "";

  if (!expected || supplied !== expected) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const key = process.env.MIXROUTER_API_KEY;
  if (!key) {
    return Response.json({ ok: false, error: "MIXROUTER_API_KEY is not configured" }, { status: 503 });
  }

  const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");
  const model = process.env.MIXROUTER_MODEL_QWEN || "glm-4-flash";

  try {
    const upstream = await fetch(`${base}/chat/completions`, {
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
      }),
      cache: "no-store"
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    return Response.json({
      ok: upstream.ok,
      providerStatus: upstream.status,
      model,
      content: data?.choices?.[0]?.message?.content || null,
      providerError: upstream.ok ? null : (data?.error?.message || data?.message || data?.raw || null)
    }, { status: upstream.ok ? 200 : 502, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error?.message || "Provider connection failed", model }, { status: 502 });
  }
}
