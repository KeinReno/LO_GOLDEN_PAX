/**
 * Удаляет всех мятежников (faction_rebels / legion_rebel_*) из world-файлов.
 * Run: node GMap/scripts/clearAllRebels.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const WORLD_FILES = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

function isRebel(l) {
  return (
    l?.factionId === "faction_rebels" ||
    String(l?.id || "").startsWith("legion_rebel_") ||
    String(l?.factionId || "").includes("rebel") ||
    String(l?.name || "").startsWith("Мятеж")
  );
}

function main() {
  for (const file of WORLD_FILES) {
    if (!fs.existsSync(file)) continue;
    const world = JSON.parse(fs.readFileSync(file, "utf8"));
    const before = (world.legions || []).length;
    world.legions = (world.legions || []).filter((l) => !isRebel(l));
    // мятежные флоты, если есть
    const fleetsBefore = (world.fleets || []).length;
    world.fleets = (world.fleets || []).filter(
      (f) =>
        f?.factionId !== "faction_rebels" &&
        !String(f?.id || "").includes("rebel"),
    );
    if (world.meta) {
      world.meta.updatedAt = new Date().toISOString();
      world.meta.tableRevision = (world.meta.tableRevision ?? 0) + 1;
    }
    fs.writeFileSync(file, JSON.stringify(world, null, 2) + "\n", "utf8");
    console.log(
      path.basename(file),
      "legions",
      before,
      "→",
      world.legions.length,
      `(−${before - world.legions.length} rebels)`,
      "fleets",
      fleetsBefore,
      "→",
      world.fleets.length,
    );
  }
}

main();
