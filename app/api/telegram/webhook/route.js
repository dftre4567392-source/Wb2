export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.SI_BASE_APP_URL || "https://si-base.onrender.com";

function isAuthorized(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expected) return true;
  return req.headers.get("x-telegram-bot-api-secret-token") === expected;
}

async function sendWelcome(chatId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "Привет! Это SI BASE.\n\nНажми кнопку ниже, чтобы открыть приложение.\n\n👇 Тыкни сюда",
      reply_markup: {
        inline_keyboard: [[
          {
            text: "Открыть SI BASE →",
            web_app: { url: APP_URL }
          }
        ]]
      }
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body.slice(0, 200)}`);
  }
}

export async function POST(req) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  try {
    const update = await req.json();
    const message = update?.message;
    const chatId = message?.chat?.id;
    const text = typeof message?.text === "string" ? message.text.trim() : "";

    if (chatId && (text === "/start" || text.startsWith("/start ") || text === "/help")) {
      await sendWelcome(chatId);
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error?.message || error);
    return Response.json({ ok: true });
  }
}
