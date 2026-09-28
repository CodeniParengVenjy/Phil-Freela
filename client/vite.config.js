import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // AI_SERVICE_URL in client/.env: where /ai goes (e.g. the Vercel address).
  // Without it, /ai goes to the AI service running on this laptop. It has no
  // VITE_ prefix, so it stays here and never ends up in the website's code.
  const aiServiceUrl = loadEnv(mode, process.cwd(), '').AI_SERVICE_URL || 'http://127.0.0.1:8000'

  return {
    // basicSsl gives the dev server a practice HTTPS certificate. Phones only
    // allow live camera video (the identity verification face scan) on HTTPS
    // sites. Browsers show a one-time "Not secure" warning for it: choose
    // Advanced -> Proceed. A real deployment uses a real certificate instead.
    plugins: [react(), basicSsl()],
    server: {
      // Also serve the site on this computer's Wi-Fi address, so a phone on the
      // same Wi-Fi can open the identity verification QR link.
      host: true,
      // The website reaches the Python AI service through its own /ai address,
      // which is forwarded to the service here. The browser (laptop or phone)
      // then only talks to this one site, so HTTPS and the AI service's
      // address never get in the way.
      proxy: {
        '/ai': {
          target: aiServiceUrl,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai/, ''),
        },
        // The call relay's passwords (client/functions/turn.js) only exist on
        // the live site, so the laptop version asks the live site for them.
        '/turn': {
          target: 'https://phil-freela.pages.dev',
          changeOrigin: true,
        },
      },
    },
  }
})
