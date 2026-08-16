import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const techs = JSON.parse(fs.readFileSync(path.join(root, "content/core/technologies.json"), "utf8"));

console.log("=== ALL CATALOG PREREQUISITES BY CATEGORY AND ERA ===");

for (const cat of ["A", "B", "C", "D", "E", "F"]) {
  console.log(`\n================ CATEGORY ${cat} ================`);
  for (let era = 1; era <= 5; era++) {
    const list = Object.values(techs).filter(t => t.category === cat && t.era === era && t.id.match(/^tech\.[a-f]_/));
    console.log(`\n--- Era ${era} (count: ${list.length}) ---`);
    const prereqCounts = {};
    for (const t of list) {
      const pStr = (t.prerequisites || []).join(", ") || "(none)";
      prereqCounts[pStr] = (prereqCounts[pStr] || 0) + 1;
    }
    for (const [pStr, count] of Object.entries(prereqCounts)) {
      console.log(`  prereqs: [${pStr}] x ${count}`);
    }
  }
}
