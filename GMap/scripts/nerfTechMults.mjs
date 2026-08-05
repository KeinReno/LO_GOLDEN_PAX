/**
 * Soft-nerf tech upgrade mults so stacks fit even_growth + modifierCaps.
 * efficiency: 1.1→1.04, 1.05→1.025; austerity: 0.9→0.96, 0.95→0.97
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TECH_PATH = path.join(__dirname, "../content/core/technologies.json");
const techs = JSON.parse(fs.readFileSync(TECH_PATH, "utf8"));

function mapMult(effect, mult) {
  const m = Number(mult);
  if (!Number.isFinite(m)) return mult;
  if (effect === "production_mult") {
    if (Math.abs(m - 1.1) < 0.001) return 1.04;
    if (Math.abs(m - 1.05) < 0.001) return 1.025;
  }
  if (effect === "upkeep_mult") {
    if (Math.abs(m - 0.9) < 0.001) return 0.96;
    if (Math.abs(m - 0.95) < 0.001) return 0.97;
  }
  return m;
}

let changed = 0;
for (const tech of Object.values(techs)) {
  for (const e of tech.effects || []) {
    if (e.args?.mult != null) {
      const next = mapMult(e.effect, e.args.mult);
      if (next !== e.args.mult) {
        e.args.mult = next;
        changed++;
      }
    }
  }
  for (const u of tech.upgrades || []) {
    for (const e of u.effects || []) {
      if (e.args?.mult != null) {
        const next = mapMult(e.effect, e.args.mult);
        if (next !== e.args.mult) {
          e.args.mult = next;
          changed++;
        }
      }
    }
  }
}

fs.writeFileSync(TECH_PATH, JSON.stringify(techs, null, 2) + "\n", "utf8");
console.log("[nerfTechMults] changed", changed);
