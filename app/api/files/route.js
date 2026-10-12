import { authenticateRequest } from "../../../lib/security";
import { consumeRateLimit, getPlan } from "../../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 6 * 1024 * 1024;

function json(data, status = 200, headers = {}) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers }
  });
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

async function extractDocxText(buffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  const document = zip.file("word/document.xml");
  if (!document) throw new Error("DOCX_DOCUMENT_XML_MISSING");

  const declaredSize = Number(document?._data?.uncompressedSize || 0);
  if (declaredSize > MAX_DOCX_XML_BYTES) throw new Error("DOCX_TOO_LARGE");

  const xml = await document.async("string");
  if (Buffer.byteLength(xml, "utf8") > MAX_DOCX_XML_BYTES) throw new Error("DOCX_TOO_LARGE");

  const text = xml
    .replace(/<w:tab\b[^>]*\/>/gi, "\t")
    .replace(/<w:br\b[^>]*\/>/gi, "\n")
    .replace(/<\/w:p>/gi, "\n")
    .replace(/<[^>]+>/g, "");

  return decodeXml(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req) {
  try {
    const auth = authenticateRequest(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status || 401);

    const plan = auth.internal ? "MAX" : await getPlan(auth.user.id);
    const rate = await consumeRateLimit(auth.user.id, plan, "files");
    if (!rate.allowed) {
      return json(
        { error: "Слишком много загрузок. Попробуйте позже.", limit: rate.limit },
        429,
        { "Retry-After": String(rate.retryAfter), "X-RateLimit-Limit": String(rate.limit) }
      );
    }

    const contentLength = Number(req.headers.get("content-length") || 0);
    if (contentLength > MAX_FILE_BYTES + 1_000_000) return json({ error: "Файл слишком большой. Максимум 10 МБ." }, 413);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "Файл не передан." }, 400);
    if (Number(file.size || 0) > MAX_FILE_BYTES) return json({ error: "Файл слишком большой. Максимум 10 МБ." }, 413);

    const name = String(file.name || "file").slice(0, 255);
    const type = String(file.type || "").slice(0, 128);
    const lower = name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_FILE_BYTES) return json({ error: "Файл слишком большой. Максимум 10 МБ." }, 413);

    if (type.startsWith("image/")) {
      if (buffer.length > 8 * 1024 * 1024) return json({ error: "Изображение слишком большое. Максимум 8 МБ." }, 413);
      return json({
        name,
        type,
        imageDataUrl: `data:${type};base64,${buffer.toString("base64")}`
      });
    }

    if (lower.endsWith(".pdf")) {
      const pdf = (await import("pdf-parse")).default;
      const parsed = await pdf(buffer);
      return json({ name, type, text: String(parsed.text || "").slice(0, 50000) });
    }

    if (lower.endsWith(".docx")) {
      try {
        const text = await extractDocxText(buffer);
        return json({ name, type, text: text.slice(0, 50000) });
      } catch (error) {
        if (error?.message === "DOCX_TOO_LARGE") return json({ error: "DOCX слишком большой для безопасной обработки." }, 413);
        return json({ error: "Не удалось прочитать DOCX." }, 422);
      }
    }

    if (
      type.startsWith("text/") ||
      /\.(txt|md|json|csv|js|jsx|ts|tsx|html|css|xml|yaml|yml)$/i.test(lower)
    ) {
      return json({ name, type, text: buffer.toString("utf8").slice(0, 50000) });
    }

    return json({
      name,
      type,
      text: `[Файл ${name} прикреплён. Автоматическое извлечение текста для этого формата пока не поддерживается.]`
    });
  } catch (error) {
    console.error("/api/files error", error?.message || error);
    return json({ error: "Не удалось обработать файл." }, 500);
  }
}
