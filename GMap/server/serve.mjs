import fs from "node:fs";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApiMiddleware } from "./api.mjs";
import {
  ensureDataDir,
  LORE_PATH,
  PUBLISHED_PATH,
  writeLiveBoard,
  readJson,
} from "./tableStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

ensureDataDir();
if (!fs.existsSync(PUBLISHED_PATH) && fs.existsSync(LORE_PATH)) {
  const lore = readJson(LORE_PATH, null);
  if (lore) {
    writeLiveBoard(lore, { reason: "seed_lore" });
    console.log("Seeded live board from campaign lore.");
  }
}

if (!fs.existsSync(path.join(dist, "index.html"))) {
  console.error(`Missing build: ${dist}/index.html — run npm run build first.`);
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1);
app.use(createApiMiddleware());
app.use(
  express.static(dist, {
    index: false,
    maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
  }),
);
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(dist, "index.html"));
});

app.listen(port, host, () => {
  const token = process.env.GMAP_MASTER_TOKEN || "master2142";
  console.log(`GMap server: http://${host}:${port}`);
  console.log(`Players:     http://${host}:${port}/view`);
  console.log(`Master:      http://${host}:${port}/`);
  console.log(
    `Master token: ${token === "master2142" ? "master2142 (CHANGE ME)" : "(custom)"}`,
  );
});
