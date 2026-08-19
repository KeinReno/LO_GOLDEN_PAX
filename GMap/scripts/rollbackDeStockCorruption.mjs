/**
 * Remediation: turn 65->66's ambient D/E tick ran on the pre-labor-scale
 * code path (raw census fed into applyAmbientDE instead of laborPopulation()),
 * exploding currency.energia/currency.bios ×4-73000 for 26 factions. The
 * root cause is already fixed live (economyTick.mjs:544 now uses
 * laborPopulation()) - this only repairs the corrupted STOCK left behind.
 *
 * Also relabels the live turn counter 66 -> 15 per owner instruction: the
 * real (narrative) game is at turn 15; turns 16-66 were automated
 * cron/testing cycles, not real play. This does not replay history - it
 * only rewrites the turn counter and the D/E stocks; population, buildings,
 * territory, and every other field are left exactly as they are now.
 *
 * Usage: node scripts/rollbackDeStockCorruption.mjs [--apply]
 * Without --apply: dry run, prints the diff, writes nothing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const apply = process.argv.includes("--apply");

const PUBLISHED_PATH = join(root, "data/published.json");
const LEDGER_PATH = join(root, "data/ledger.json");
const BASELINE_PATH = join(
  root,
  "data/turns/65_2026-08-16T08-29-09-905Z_pre_tick/ledger.json",
);
const NEW_TURN = 15;

function loadJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

const published = loadJson(PUBLISHED_PATH);
const ledger = loadJson(LEDGER_PATH);
const baseline = loadJson(BASELINE_PATH);

console.log(`turn: ${published.meta?.turn} -> ${NEW_TURN}`);

const rows = [];
for (const [id, fac] of Object.entries(ledger.factions || {})) {
  const base = baseline.factions?.[id];
  if (!base) continue;
  const dNow = Number(fac.stocks?.["currency.energia"]) || 0;
  const eNow = Number(fac.stocks?.["currency.bios"]) || 0;
  const dBase = Number(base.stocks?.["currency.energia"]) || 0;
  const eBase = Number(base.stocks?.["currency.bios"]) || 0;
  const dRatio = dBase > 0 ? dNow / dBase : dNow > 1000 ? Infinity : 1;
  const eRatio = eBase > 0 ? eNow / eBase : eNow > 1000 ? Infinity : 1;
  if (dRatio > 20 || eRatio > 20) {
    rows.push({ id, name: fac.name, dNow, dBase, eNow, eBase });
  }
}

console.log(`affected factions: ${rows.length}`);
for (const r of rows) {
  console.log(
    `  ${r.id} (${r.name}): energia ${r.dNow} -> ${r.dBase} | bios ${r.eNow} -> ${r.eBase}`,
  );
}

if (!apply) {
  console.log("\nDRY RUN - no files written. Re-run with --apply to commit.");
  process.exit(0);
}

published.meta.turn = NEW_TURN;
for (const r of rows) {
  ledger.factions[r.id].stocks["currency.energia"] = r.dBase;
  ledger.factions[r.id].stocks["currency.bios"] = r.eBase;
}

writeFileSync(PUBLISHED_PATH, JSON.stringify(published, null, 2));
writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
console.log(`\nAPPLIED - turn set to ${NEW_TURN}, ${rows.length} factions' energia/bios rolled back.`);
