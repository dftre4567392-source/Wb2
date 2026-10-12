import { authenticateRequest } from "../../../../lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(req) {
  const auth = authenticateRequest(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status || 401);

  const key = process.env.TRIBUTE_API_KEY;
  if (!key) return json({ error: "Tribute is not configured." }, 503);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let upstream;
    try {
      upstream = await fetch("https://tribute.tg/api/v1/products?size=100", {
        headers: { "Api-Key": key, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store"
      });
    } finally {
      clearTimeout(timer);
    }

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = null; }

    if (!upstream.ok) {
      console.warn("Tribute products request failed", { status: upstream.status });
      return json({ error: "Не удалось загрузить тарифы Tribute.", providerStatus: upstream.status }, upstream.status >= 500 ? 502 : upstream.status);
    }

    const list = Array.isArray(data?.rows)
      ? data.rows
      : Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.products)
            ? data.products
            : [];

    const products = list.map(p => ({
      id: p.id,
      type: p.type,
      name: p.name,
      description: p.description,
      amount: p.amount,
      currency: p.currency,
      starsAmount: p.starsAmount,
      status: p.status,
      link: p.link,
      webLink: p.webLink,
      imageUrl: p.imageUrl
    }));

    return json({ products, meta: data?.meta || null });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    console.error("Tribute products connection error", timedOut ? "timeout" : error?.message || error);
    return json({ error: timedOut ? "Tribute отвечает слишком долго." : "Не удалось связаться с Tribute." }, timedOut ? 504 : 502);
  }
}
