import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createApiMiddleware } from "./server/api.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "gmap-api",
      configureServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(createApiMiddleware());
      },
    },
  ],
  // Avoid prebundling Tauri IPC into .vite/deps — WebView loads globals instead.
  optimizeDeps: {
    exclude: ["@tauri-apps/api", "@tauri-apps/api/core"],
  },
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    clearScreen: false,
    // Cloudflare / ngrok tunnels change subdomain each run
    allowedHosts: true,
  },
  preview: {
    port: 4173,
    host: true,
    allowedHosts: true,
  },
});
