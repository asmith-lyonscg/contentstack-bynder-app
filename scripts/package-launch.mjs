import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
writeFileSync(
  join(stage, "PACKAGE_STAMP.txt"),
  `${pkg.name}@${pkg.version}\npackagedAt=${new Date().toISOString()}\n`
);

// Compress-Archive (not `tar -a`) so Windows Explorer can open the zip.
// Entries from `tar -C stage .` start with "./" and Explorer often shows that as empty.
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path (Join-Path '${stage.replace(/'/g, "''")}' '*') -DestinationPath '${outZip.replace(/'/g, "''")}' -Force`,
  ],
  { stdio: "inherit" }
);

const hash = createHash("sha256").update(readFileSync(outZip)).digest("hex").slice(0, 12);
rmSync(join(root, "tmp"), { recursive: true, force: true });

console.log(`Wrote ${outZip}`);
console.log(`sha256(12)=${hash}  version=${pkg.version}`);
console.log(`
Upload this zip in Developer Hub → Hosting → Hosting with Launch.
If the project already exists and Developer Hub does not prompt to update, open the
Launch project and Redeploy (or upload again and confirm PACKAGE_STAMP.txt / version changed).

Launch build settings:
  Framework Preset : Vite (or Other)
  Build Command    : npm run build
  Output Directory : ./dist
  Node.js          : 22 if listed

Do not include a port on the Launch app URL. Paths stay /custom-field and /app-configuration.

This zip is static: authors sign into Bynder in Compact View. There is no OAuth token server.
`);
