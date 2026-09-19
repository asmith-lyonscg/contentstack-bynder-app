import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { handleApiRequest } from "./server/api.mjs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "bynder-oauth-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          void handleApiRequest(req, res)
            .then((handled) => {
              if (!handled) next();
            })
            .catch(next);
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          void handleApiRequest(req, res)
            .then((handled) => {
              if (!handled) next();
            })
            .catch(next);
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
  },
  server: {
    port: 3000,
    host: true,
    // Cloudflare Tunnel / ngrok hostnames change each run.
    allowedHosts: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.js"],
  },
});
