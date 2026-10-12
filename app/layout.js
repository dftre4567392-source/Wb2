import "./styles.css";

export const metadata = {
  title: "SI BASE",
  description: "Simple AI workspace"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false
};

const telegramFetchBridge = `
(() => {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init = {}) => {
    try {
      const url = typeof input === 'string' ? input : input?.url || '';
      const protectedApi = url.startsWith('/api/chat') || url.startsWith('/api/files') || url.startsWith('/api/auth/') || url.startsWith('/api/tribute/products');
      if (protectedApi) {
        const initData = window.Telegram?.WebApp?.initData || '';
        if (initData) {
          const headers = new Headers(init.headers || (typeof input !== 'string' ? input?.headers : undefined) || {});
          headers.set('x-telegram-init-data', initData);
          init = { ...init, headers };
        }
      }
    } catch {}
    return originalFetch(input, init);
  };
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js?64" />
        <script dangerouslySetInnerHTML={{ __html: telegramFetchBridge }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
