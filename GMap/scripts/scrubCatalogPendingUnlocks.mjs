/**
 * Strip catalogPending / missing techs from live ledger unlockedTechs, then
 * recompute tiers/properties from remaining live techs + standing buildings.
 * Does not apply a tick.
 *
 * Dry:  node scripts/scrubCatalogPendingUnlocks.mjs
 * Write: node scripts/scrubCatalogPendingUnlocks.mjs --apply
 */
import { getContent } from "../server/contentLoader.mjs";
import { readPublishedRaw } from "../server/tableStore.mjs";
import { normalizeWorld } from "../server/normalizeWorld.mjs";
import { readLedger, writeLedger } from "../server/ledger.mjs";
import { recomputeUnlocksFromTechs } from "../server/techActions.mjs";

const apply = process.argv.includes("--apply");
const content = getContent();
const raw = readPublishedRaw();
if (!raw) {
  console.error("NO published board");
  process.exit(1);
}
const world = normalizeWorld(raw);
const ledger = readLedger();

const majors = ["faction_belator", "faction_amalfea", "faction_karned"];
const report = [];

for (const [fid, eco] of Object.entries(ledger.factions || {})) {
  if (!eco) continue;
  const before = [...(eco.unlockedTechs || [])];
  const beforeTiers = { ...(eco.techTiers || {}) };
  recomputeUnlocksFromTechs(eco, content, fid, world);
  const after = eco.unlockedTechs || [];
  const dropped = before.length - after.length;
  if (!dropped && !majors.includes(fid)) continue;
  report.push({
    fid,
    before: before.length,
    after: after.length,
    dropped,
    tiersBefore: beforeTiers,
    tiersAfter: { ...eco.techTiers },
  });
}

const depot = content.buildings?.["logistics.depot"];
console.log(JSON.stringify({ apply, depot: Boolean(depot?.id), factions: report }, null, 2));

if (apply) {
  writeLedger(ledger);
  console.log("wrote ledger");
}
