import { getModel } from "../../../lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEGACY_CHAT = process.env.SI_BASE_LEGACY_CHAT_URL || "https://si-base.vercel.app/api/chat";

async function legacyFallback(body) {
  const alias = body.model === "aven" ? "free" : body.model;
  const r = await fetch(LEGACY_CHAT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: alias,
      modelAlias: alias,
      messages: Array.isArray(body.messages) ? body.messages : [],
      systemPrompt: String(body.system || ""),
      webSearch: false
    }),
    cache: "no-store"
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok) throw new Error(data?.error || data?.message || data?.raw || `Legacy API HTTP ${r.status}`);

  return Response.json({
    content: data?.content ?? data?.text ?? data?.choices?.[0]?.message?.content ?? "Модель вернула пустой ответ.",
    model: data?.modelUsed || alias,
    bridge: true
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const key = process.env.MIXROUTER_API_KEY;

    // Пока секрет переносится с прежнего хостинга, сервер Render может
    // использовать старый серверный API как мост. Ключ при этом не попадает
    // ни в браузер, ни в GitHub.
    if (!key) return await legacyFallback(body);

    const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");
    const model = getModel(body.model);
    if (!model) {
      return Response.json({ error: "Для выбранной модели не задан model ID." }, { status: 400 });
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const system = String(body.system || "").trim();
    const payloadMessages = system
      ? [{ role: "system", content: system }, ...messages]
      : messages;

    const upstream = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({ model, messages: payloadMessages, temperature: 0.7 })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      return Response.json(
        { error: data?.error?.message || data?.message || data?.raw || "Ошибка MixRoute" },
        { status: upstream.status }
      );
    }

    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      data?.output_text ??
      "Модель вернула пустой ответ.";

    return Response.json({ content, model });
  } catch (error) {
    return Response.json({ error: error?.message || "Server error" }, { status: 500 });
  }
}
