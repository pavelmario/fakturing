import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
