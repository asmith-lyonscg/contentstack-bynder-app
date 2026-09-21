import { copyFileSync, existsSync, writeFileSync } from "node:fs";
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

export default defineConfig({
  base: resolveViteBase(),
  plugins: [
    react(),
    {
      name: "github-pages-spa",
      closeBundle() {
        const dist = path.resolve(__dirname, "dist");
        const index = path.join(dist, "index.html");
        if (!existsSync(index)) return;
        copyFileSync(index, path.join(dist, "404.html"));
        writeFileSync(path.join(dist, ".nojekyll"), "");
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
