import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const techs = JSON.parse(fs.readFileSync(path.join(root, "content/core/technologies.json"), "utf8"));

console.log("=== ERA 1 CATALOG TECHS PREREQUISITES ===");
const byCat = {};
for (const [id, t] of Object.entries(techs)) {
  if (t.era === 1 && id.match(/^tech\.[a-f]_/)) {
    byCat[t.category] = byCat[t.category] || [];
    byCat[t.category].push({ id, prereqs: t.prerequisites });
  }
}

for (const [cat, list] of Object.entries(byCat)) {
  console.log(`Category ${cat} (count: ${list.length}):`);
  for (const item of list) {
    console.log(`  ${item.id} -> ${JSON.stringify(item.prereqs)}`);
  }
}
