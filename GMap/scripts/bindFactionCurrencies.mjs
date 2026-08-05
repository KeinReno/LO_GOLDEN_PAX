/**
 * Bind FX currencies + treasury peg resources to all polities.
 * Also seeds peg stocks in ledger.
 *
 * Run: node GMap/scripts/bindFactionCurrencies.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const BINDINGS = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "content/core/faction_currency_bindings.json"),
    "utf8",
  ),
);

const WORLD_PATHS = [
  path.join(ROOT, "data/published.json"),
  path.join(ROOT, "data/campaign-draft.json"),
  path.join(ROOT, "public/campaigns/lo_golden_pax.json"),
];

const LEDGER_PATH = path.join(ROOT, "data/ledger.json");

const CANON_FX = new Set([
  "fx.damyl_doubloon",
  "fx.terrial_credit",
  "fx.turon_credit",
  "fx.elan_doubloon",
  "fx.belator_solarit",
  "fx.karned_trill",
  "fx.aphel_ilir",
  "fx.universal_credit",
]);

function applyWorld(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("skip missing", path.relative(ROOT, filePath));
    return;
  }
  const world = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let n = 0;
  let cleared = 0;
  for (const f of world.factions ?? []) {
    const b = BINDINGS.bindings?.[f.id];
    if (b) {
      f.fxCurrencyId = b.fxCurrencyId ?? null;
      f.treasuryPeg = b.treasuryPeg ?? null;
      n++;
      continue;
    }
    // Unbound polities: no FX / peg (UC is numeraire, not a state currency).
    if (f.fxCurrencyId != null) {
      delete f.fxCurrencyId;
      cleared++;
    }
    if (f.treasuryPeg != null) {
      delete f.treasuryPeg;
      cleared++;
    }
  }
  fs.writeFileSync(filePath, JSON.stringify(world, null, 2));
  console.log(
    "world",
    path.relative(ROOT, filePath),
    "bound",
    n,
    "cleared",
    cleared,
  );
}

function seedLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    console.log("skip ledger");
    return;
  }
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8"));
  const seeds = BINDINGS.seedStocks ?? {};
  let touched = 0;
  for (const [fid, stocks] of Object.entries(seeds)) {
    if (!ledger.factions?.[fid]) continue;
    const s = ledger.factions[fid].stocks ?? (ledger.factions[fid].stocks = {});
    for (const [rid, amount] of Object.entries(stocks)) {
      const cur = Number(s[rid] ?? 0);
      if (!Number.isFinite(cur) || cur < amount) {
        s[rid] = amount;
        touched++;
      }
    }
  }
  // Ensure every bound faction has at least 0 peg stock key present.
  for (const [fid, b] of Object.entries(BINDINGS.bindings ?? {})) {
    if (!b?.treasuryPeg || !ledger.factions?.[fid]) continue;
    const s = ledger.factions[fid].stocks ?? (ledger.factions[fid].stocks = {});
    if (s[b.treasuryPeg] == null) {
      s[b.treasuryPeg] = 0;
      touched++;
    }
  }
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
  console.log("ledger peg seeds touched", touched);
}

for (const p of WORLD_PATHS) applyWorld(p);
seedLedger();
console.log("done");
