import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Kept in step with `public/_headers` (Netlify, Cloudflare Pages) and
 * `vercel.json`, so dev and preview behave like production.
 */
const securityHeaders = {
  // Suite Web's connect popup reports back through window.opener, which
  // Cross-Origin-Opener-Policy: same-origin would sever. Trezor Connect then
  // fails as a handshake timeout, with nothing pointing at the header.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  // frame-src covers two framers: Connect bootstraps its channel to Suite Web
  // in an iframe, and the invoice PDF preview frames a blob: URL.
  "Content-Security-Policy": "frame-src 'self' blob: https://suite.trezor.io",
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: null,
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,wasm}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: "index.html",
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["@evolu/web", "@evolu/react-web", "@evolu/common"],
  },
  server: {
    headers: securityHeaders,
    proxy: {
      "/api/ares": {
        target: "https://ares.gov.cz",
        changeOrigin: true,
        secure: true,
        rewrite: (path) =>
          path.replace(
            /^\/api\/ares/,
            "/ekonomicke-subjekty-v-rejstricich/rest",
          ),
      },
    },
  },
  preview: {
    headers: securityHeaders,
  },
});
