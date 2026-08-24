import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const extractRoot = path.resolve(repoRoot, "dfextract/out");
const rsrcRoot = path.resolve(repoRoot, "dustdecompile/out/rsrc");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".csv": "text/csv; charset=utf-8",
  ".cur": "image/vnd.microsoft.icon",
};

function serveTree(root: string): Connect.NextHandleFunction {
  const prefix = root.endsWith(path.sep) ? root : root + path.sep;
  return (req, res, next) => {
    const raw = (req.url ?? "/").split("?")[0];
    let rel: string;
    try {
      rel = decodeURIComponent(raw);
    } catch {
      res.statusCode = 400;
      res.end();
      return;
    }
    const file = path.resolve(root, `.${rel.replaceAll("\\", "/")}`);
    if (file !== root && !file.startsWith(prefix)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        next();
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const etag = `"${st.size.toString(16)}-${Math.trunc(st.mtimeMs)}"`;
      if (req.headers["if-none-match"] === etag) {
        res.statusCode = 304;
        res.end();
        return;
      }
      res.setHeader("Content-Type", MIME[ext] ?? "application/octet-stream");
      res.setHeader("Content-Length", String(st.size));
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", st.mtime.toUTCString());
      // PNGs change when extract is re-run. A 1-day max-age plus
      // fetch `force-cache` kept HOUSE table silhouettes after the
      // SET-palette recolor. Revalidate; 304 if mtime/size match.
      res.setHeader("Cache-Control", ext === ".wav" ? "public, max-age=86400" : "no-cache");
      fs.createReadStream(file).pipe(res);
    });
  };
}

function extractPlugin(): Plugin {
  return {
    name: "serve-dust-extract",
    configureServer(server) {
      server.middlewares.use("/extract", serveTree(extractRoot));
      server.middlewares.use("/rsrc", serveTree(rsrcRoot));
    },
    configurePreviewServer(server) {
      server.middlewares.use("/extract", serveTree(extractRoot));
      server.middlewares.use("/rsrc", serveTree(rsrcRoot));
    },
  };
}

export default defineConfig({
  // Custom domain (diamondback.town) is `/`. Project-pages path comes from CI.
  base: process.env.VITE_BASE || "/",
  plugins: [extractPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repoRoot, extractRoot, rsrcRoot],
    },
  },
});
