import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
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
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ai/, ''),
      },
    },
  },
})
