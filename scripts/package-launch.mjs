import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const stage = join(root, "tmp", "launch-package");
const outDir = join(root, "launch");
const outZip = join(outDir, "bynder-image-settings.zip");

const files = [
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.node.json",
  "vite.config.ts",
  "index.html",
  "launch.json",
  "README.md",
  ".env.example",
];

const dirs = ["public", "src"];

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(outDir, { recursive: true });
if (existsSync(outZip)) rmSync(outZip);

for (const file of files) {
  const from = join(root, file);
  if (!existsSync(from)) {
    throw new Error(`Missing ${file}`);
  }
  cpSync(from, join(stage, file));
}

for (const dir of dirs) {
  const from = join(root, dir);
  if (!existsSync(from)) {
    throw new Error(`Missing ${dir}/`);
  }
  cpSync(from, join(stage, dir), { recursive: true });
}

execFileSync("tar", ["-a", "-c", "-f", outZip, "-C", stage, "."], { stdio: "inherit" });
rmSync(join(root, "tmp"), { recursive: true, force: true });

console.log(`Wrote ${outZip}`);
console.log(`
Upload this zip in Developer Hub → Hosting → Hosting with Launch → Create a New Project
→ Upload a .zip file.

Launch build settings:
  Framework Preset : Vite (or Other)
  Build Command    : npm run build
  Output Directory : ./dist
  Node.js          : 22 if listed

Do not include a port on the Launch app URL. Paths stay /custom-field and /app-configuration.

This zip is static: authors sign into Bynder in Compact View. There is no OAuth token server.
`);
