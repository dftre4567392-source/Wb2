export const runtime = "nodejs";

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file) return Response.json({ error: "Файл не передан." }, { status: 400 });

    const name = file.name || "file";
    const type = file.type || "";
    const lower = name.toLowerCase();
    const buffer = Buffer.from(await file.arrayBuffer());

    if (type.startsWith("image/")) {
      return Response.json({
        name,
        type,
        imageDataUrl: `data:${type};base64,${buffer.toString("base64")}`
      });
    }

    if (lower.endsWith(".pdf")) {
      const pdf = (await import("pdf-parse")).default;
      const parsed = await pdf(buffer);
      return Response.json({ name, type, text: parsed.text.slice(0, 50000) });
    }

    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const parsed = await mammoth.extractRawText({ buffer });
      return Response.json({ name, type, text: parsed.value.slice(0, 50000) });
    }

    if (
      type.startsWith("text/") ||
      /\.(txt|md|json|csv|js|jsx|ts|tsx|html|css|xml|yaml|yml)$/i.test(lower)
    ) {
      return Response.json({ name, type, text: buffer.toString("utf8").slice(0, 50000) });
    }

    return Response.json({
      name,
      type,
      text: `[Файл ${name} прикреплён. Автоматическое извлечение текста для этого формата пока не поддерживается.]`
    });
  } catch (error) {
    return Response.json({ error: error?.message || "Не удалось обработать файл." }, { status: 500 });
  }
}
