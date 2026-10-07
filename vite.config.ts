import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

/** Static hosts (Launch) have no SPA fallback; emit real HTML for each app route. */
function emitSpaShells(dist: string, index: string) {
  const routes = ["picker", "custom-field", "app-configuration"];
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
  },
  server: {
    port: 3000,
    host: true,
    allowedHosts: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
