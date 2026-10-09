import { getModel } from "../../../lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const key = process.env.MIXROUTER_API_KEY;
    const base = (process.env.MIXROUTER_BASE_URL || "https://api.mixroute.ai/v1").replace(/\/$/, "");
    if (!key) {
      return Response.json({ error: "MIXROUTER_API_KEY не настроен на сервере." }, { status: 500 });
    }

    const body = await req.json();
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
      body: JSON.stringify({
        model,
        messages: payloadMessages,
        temperature: 0.7
      })
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
