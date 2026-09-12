import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // 5174 so it doesn't clash with mi7rab's web on 5173.
    port: 5174,
    // Dev: proxy /api to the backend so the app + API are same-origin and the
    // HttpOnly auth cookies "just work" (no CORS dance in development).
    proxy: {
      "/api": { target: "http://localhost:3001", changeOrigin: true },
      // The reachability probe hits /health, which lives at the API root rather than
      // under /api — without this it would resolve to the dev server and always pass.
      "/health": { target: "http://localhost:3001", changeOrigin: true },
    },
  },
});
