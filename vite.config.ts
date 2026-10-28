import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

function resolveViteBase(): string {
  const explicit = process.env.VITE_BASE_PATH?.trim();
  if (explicit) {
    if (explicit === "/") return "/";
    return explicit.endsWith("/") ? explicit : `${explicit}/`;
  }
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  if (process.env.GITHUB_ACTIONS && repo && !repo.endsWith(".github.io")) {
    return `/${repo}/`;
  }
  return "/";
}

/** Static hosts (GitHub Pages) have no SPA fallback; emit real HTML for each app route. */
function emitSpaShells(dist: string, index: string) {
  const routes = ["picker", "custom-field", "app-configuration", "content-type-sidebar"];
  for (const route of routes) {
    const dir = path.join(dist, route);
    mkdirSync(dir, { recursive: true });
    copyFileSync(index, path.join(dir, "index.html"));
    copyFileSync(index, path.join(dist, `${route}.html`));
  }
}

export default defineConfig({
  base: resolveViteBase(),
  plugins: [
    react(),
    {
      name: "serve-json-rte",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split("?")[0];
          if (url !== "/json-rte.js") return next();
          // rte-extension.contentstack.com loads this script from loopback.
          // Chrome blocks that unless the preflight opts into private-network access.
          const origin = req.headers.origin;
          res.setHeader("Access-Control-Allow-Origin", typeof origin === "string" && origin ? origin : "*");
          res.setHeader("Access-Control-Allow-Private-Network", "true");
          res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
          const requestedHeaders = req.headers["access-control-request-headers"];
          res.setHeader(
            "Access-Control-Allow-Headers",
            typeof requestedHeaders === "string" && requestedHeaders ? requestedHeaders : "*"
          );
          res.setHeader("Vary", "Origin");
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.end();
            return;
          }
          const file = path.resolve(__dirname, "dist/json-rte.js");
          if (!existsSync(file)) {
            res.statusCode = 404;
            res.end("dist/json-rte.js is missing. Run npm run build.");
            return;
          }
          res.setHeader("Content-Type", "text/javascript; charset=utf-8");
          res.end(readFileSync(file));
        });
      },
    },
    {
      name: "spa-static-shells",
      closeBundle() {
        const dist = path.resolve(__dirname, "dist");
        const index = path.join(dist, "index.html");
        if (!existsSync(index)) return;
        copyFileSync(index, path.join(dist, "404.html"));
        writeFileSync(path.join(dist, ".nojekyll"), "");
        emitSpaShells(dist, index);
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
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, "index.html"),
      },
      output: {
        // Stable names so a publish overwrites the custom-field script instead of
        // deleting the hashed file an open entry is still requesting.
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
    headers: {
      "Access-Control-Allow-Private-Network": "true",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
