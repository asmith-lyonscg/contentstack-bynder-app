import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleApiRequest } from "./api.mjs";

const root = join(fileURLToPath(new URL("..", import.meta.url)), "dist");
const port = Number(process.env.PORT || 3000);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendFile(res, file, type) {
  res.statusCode = 200;
  res.setHeader("Content-Type", type);
  createReadStream(file).pipe(res);
}

function sendIndex(res) {
  const index = join(root, "index.html");
  if (!existsSync(index)) {
    res.statusCode = 404;
    res.end("Build the app first (npm run build).");
    return;
  }
  sendFile(res, index, types[".html"]);
}

const server = createServer(async (req, res) => {
  try {
    if (await handleApiRequest(req, res)) return;
    const url = new URL(req.url || "/", "http://localhost");
    const relative = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = join(root, relative);
    if (existsSync(file) && statSync(file).isFile()) {
      sendFile(res, file, types[extname(file)] || "application/octet-stream");
      return;
    }
    sendIndex(res);
  } catch (error) {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : "Server error");
  }
});

server.listen(port, () => {
  console.log(`Bynder Image Settings listening on ${port}`);
});
