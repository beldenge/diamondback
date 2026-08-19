import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const extractRoot = path.resolve(repoRoot, "dfextract/out");

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".csv": "text/csv; charset=utf-8",
};

function serveExtract(): Connect.NextHandleFunction {
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
    const file = path.resolve(extractRoot, `.${rel.replaceAll("\\", "/")}`);
    const prefix = extractRoot.endsWith(path.sep) ? extractRoot : extractRoot + path.sep;
    if (file !== extractRoot && !file.startsWith(prefix)) {
      res.statusCode = 403;
      res.end();
      return;
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) {
        next();
        return;
      }
      res.setHeader("Content-Type", MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=3600");
      fs.createReadStream(file).pipe(res);
    });
  };
}

function extractPlugin(): Plugin {
  return {
    name: "serve-dust-extract",
    configureServer(server) {
      server.middlewares.use("/extract", serveExtract());
    },
    configurePreviewServer(server) {
      server.middlewares.use("/extract", serveExtract());
    },
  };
}

export default defineConfig({
  plugins: [extractPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [repoRoot, extractRoot],
    },
  },
});
