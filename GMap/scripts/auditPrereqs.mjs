import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const techs = JSON.parse(fs.readFileSync(path.join(root, "content/core/technologies.json"), "utf8"));

console.log("=== PREREQUISITE GRAPH AUDIT ===");

for (const [id, t] of Object.entries(techs)) {
  for (const p of t.prerequisites || []) {
    const pre = techs[p];
    if (!pre) {
      console.log(`[MISSING PREREQ] ${id} (era ${t.era}) -> ${p} (NOT FOUND)`);
    } else if (pre.era > t.era) {
      console.log(`[INVERTED ERA] ${id} (${t.category} era ${t.era}) -> ${p} (${pre.category} era ${pre.era})`);
    }
  }
}
