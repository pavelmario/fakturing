import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
});
