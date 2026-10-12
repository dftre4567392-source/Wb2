const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = (process.env.SI_BASE_APP_URL || "https://si-base.onrender.com").replace(/\/$/, "");
const secret = process.env.TELEGRAM_WEBHOOK_SECRET || "";

if (!token) {
  console.log("[telegram-setup] skipped: TELEGRAM_BOT_TOKEN missing");
  process.exit(0);
}

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    throw new Error(`${method} failed: ${response.status} ${data?.description || "unknown error"}`);
  }
}

try {
  const webhookBody = {
    url: `${appUrl}/api/telegram/webhook`,
    allowed_updates: ["message"]
  };
  if (secret) webhookBody.secret_token = secret;

  await call("setWebhook", webhookBody);
  await call("setMyCommands", {
    commands: [
      { command: "start", description: "Открыть SI BASE" },
      { command: "help", description: "Открыть SI BASE" }
    ]
  });
  await call("setChatMenuButton", {
    menu_button: {
      type: "web_app",
      text: "Открыть SI BASE",
      web_app: { url: appUrl }
    }
  });

  console.log("[telegram-setup] webhook and menu button configured");
} catch (error) {
  console.error("[telegram-setup]", error?.message || error);
}
