import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const techs = JSON.parse(fs.readFileSync(path.join(root, "content/core/technologies.json"), "utf8"));
const live = Object.values(techs).filter(t => !t.id.match(/^tech\.[a-f]_/));

console.log("Live techs count:", live.length);
live.sort((a, b) => a.category.localeCompare(b.category) || a.era - b.era || a.id.localeCompare(b.id));

for (const t of live) {
  const hasTier = (t.effects || []).find(e => e.effect === "unlock_tech_tier");
  console.log(`${t.category} E${t.era} ${t.id} (${t.name}) tier:${hasTier ? hasTier.args.to : "-"}`);
}
