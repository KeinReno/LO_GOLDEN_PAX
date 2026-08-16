import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createApi } from "./api/createApi.mjs";
import { resolveMasterToken } from "./api/auth.mjs";
import { getDb } from "./db/store.mjs";
import { getContent } from "./contentLoader.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../client-web/dist");
const port = Number(process.env.PORT || 4174);
const host = process.env.HOST || "0.0.0.0";
const devMode = process.env.NODE_ENV !== "production" && !fs.existsSync(path.join(dist, "index.html"));

getDb(); // opens (and initializes, via schema.sql) the SQLite store on boot
getContent(); // warms the content cache at boot instead of stalling the first request that needs it

const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json());
app.use("/api", createApi());

if (devMode) {
  console.log("No client-web build found — API-only mode. Run `npm run dev:client` for the browser client, or `npm run build` first.");
} else {
  app.use(express.static(dist, { index: false, maxAge: process.env.NODE_ENV === "production" ? "1h" : 0 }));
  app.get(/.*/, (_req, res) => {
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.listen(port, host, () => {
  const auth = resolveMasterToken();
  console.log(`Golden Pax server: http://${host}:${port}`);
  console.log(`API:               http://${host}:${port}/api/health`);
  console.log(`Master token:      ${auth.isDefault ? "DEFAULT (CHANGE ME) — set GOLDEN_PAX_MASTER_TOKEN" : `ok (${auth.source})`}`);
});
