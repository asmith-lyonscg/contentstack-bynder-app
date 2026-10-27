import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Same bundle as the Highlight marketplace plugin: SystemJS, React external,
 * default export is registerRTEPlugins. The editor provides React.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "publish-json-rte",
      closeBundle() {
        const dist = path.resolve(__dirname, "dist");
        const built = path.join(dist, "json-rte.js");
        if (!existsSync(dist)) return;
        for (const name of readdirSync(dist)) {
          if (name.endsWith(".css")) unlinkSync(path.join(dist, name));
        }
        if (!existsSync(built)) return;
        const publicDir = path.resolve(__dirname, "public");
        mkdirSync(publicDir, { recursive: true });
        copyFileSync(built, path.join(publicDir, "json-rte.js"));
      },
    },
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "react/jsx-runtime": path.resolve(__dirname, "src/rte/jsx-runtime.ts"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "src/rte/jsx-runtime.ts"),
      "react-dom/client": path.resolve(__dirname, "src/rte/reactDomClient.ts"),
    },
  },
  build: {
    emptyOutDir: false,
    outDir: "dist",
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    lib: {
      entry: path.resolve(__dirname, "src/rte/plugin.tsx"),
      formats: ["system"],
      fileName: () => "json-rte",
    },
    rollupOptions: {
      external: ["react"],
      output: {
        format: "system",
        inlineDynamicImports: true,
        entryFileNames: "json-rte.js",
      },
    },
  },
});
