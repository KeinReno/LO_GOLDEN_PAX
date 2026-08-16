import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const techs = JSON.parse(fs.readFileSync(path.join(root, "content/core/technologies.json"), "utf8"));

function isPathOrHybrid(def) {
  const id = String(def?.id || "");
  if (id.startsWith("tech.path.")) return true;
  if (Array.isArray(def?.hybridOf) && def.hybridOf.length) return true;
  return false;
}

function liveSpine(techs) {
  const spine = {};
  for (const t of Object.values(techs)) {
    if (!t?.id || t.catalogPending || isPathOrHybrid(t) || t.id.match(/^tech\.[a-f]_/)) continue;
    const hasTier = (t.effects || []).some((e) => e.effect === "unlock_tech_tier");
    const k = `${t.category}:${t.era}`;
    const cur = spine[k];
    if (!cur || (hasTier && !cur.hasTier)) {
      spine[k] = { id: t.id, hasTier };
    }
  }
  return spine;
}

console.log("liveSpine result:", liveSpine(techs));
