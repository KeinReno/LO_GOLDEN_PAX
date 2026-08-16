/**
 * One-shot repair: loyalty death spiral + empty-treasury false positives.
 *
 * Usage (from GMap/):
 *   node scripts/repairLoyaltyCollapse.mjs
 *   node scripts/repairLoyaltyCollapse.mjs --dry-run
 */
import {
  readLiveBoard,
  writeLiveBoard,
  backupTurnSnapshot,
  LEDGER_PATH,
  readJson,
  writeJson,
} from "../server/tableStore.mjs";
import { repairLoyaltyCollapse } from "../server/loyalty.mjs";
import { ensureFactionEco } from "../server/ledger.mjs";

const dryRun = process.argv.includes("--dry-run");

const STOCK_FLOORS = {
  "currency.materia": 40,
  "currency.energia": 40,
  "currency.bios": 40,
  "currency.supply": 80,
  "currency.metal": 80,
};

function seedLedgerFloors(ledger, world) {
  const seeded = [];
  const factionIds = new Set((world.factions || []).map((f) => f.id));
  for (const id of factionIds) {
    if (!id || id === "faction_rebels") continue;
    const eco = ensureFactionEco(ledger, id);
    const before = { ...eco.stocks };
    let changed = false;
    for (const [cur, floor] of Object.entries(STOCK_FLOORS)) {
      const v = Number(eco.stocks[cur] ?? 0);
      if (v < floor) {
        eco.stocks[cur] = floor;
        changed = true;
      }
    }
    if ((eco.pressure ?? 0) > 2) {
      eco.pressure = Math.min(2, Number(eco.pressure) || 0);
      changed = true;
    }
    // Always clamp pressure ceiling even if already low-ish
    if ((eco.pressure ?? 0) > 12) {
      eco.pressure = 12;
      changed = true;
    }
    // Recompute deficit like economyTick (critical B/D/E + supply only).
    const critical = {
      "currency.materia": 40,
      "currency.energia": 40,
      "currency.bios": 40,
      "currency.supply": 80,
    };
    let anyEmpty = false;
    let anyLow = false;
    for (const [cur, ref] of Object.entries(critical)) {
      const v = Number(eco.stocks[cur] ?? 0);
      if (v <= 0) anyEmpty = true;
      else if (v < ref * 0.15) anyLow = true;
    }
    const metal = Number(eco.stocks["currency.metal"] ?? 0);
    if (metal > 0 && metal < 80 * 0.15) anyLow = true;
    eco.deficit = anyEmpty ? "empty" : anyLow ? "low" : "ok";
    if (changed) {
      seeded.push({
        id,
        deficit: eco.deficit,
        pressure: eco.pressure,
        from: before,
        to: { ...eco.stocks },
      });
    }
  }
  return seeded;
}

function summarizeLoyalty(world) {
  let low = 0;
  let mid = 0;
  let high = 0;
  let sum = 0;
  let n = 0;
  for (const s of world.systems || []) {
    for (const p of s.planets || []) {
      if ((p.population ?? 0) <= 0) continue;
      const L = Number(p.loyalty ?? 50);
      sum += L;
      n += 1;
      if (L < 20) low += 1;
      else if (L < 40) mid += 1;
      else high += 1;
    }
  }
  const rebels = (world.legions || []).filter(
    (l) =>
      l.factionId === "faction_rebels" ||
      String(l.id || "").startsWith("legion_rebel_"),
  ).length;
  const contested = (world.systems || []).filter((s) => s.contested).length;
  return {
    planets: { low, mid, high, avg: n ? +(sum / n).toFixed(1) : null, n },
    rebels,
    contested,
  };
}

const world = readLiveBoard();
if (!world) {
  console.error("No published board");
  process.exit(1);
}

const before = summarizeLoyalty(world);
const turn = world.meta?.turn ?? 0;

if (!dryRun) {
  backupTurnSnapshot(turn, "pre_loyalty_repair");
}

const loyaltyStats = repairLoyaltyCollapse(world, {
  matrixTarget: 50,
  planetLoyalty: 55,
  removeRebels: true,
  clearRevoltFlags: true,
});

// Clear orphan activity:battle with no multi-faction presence (revolt leftovers).
let battlesCleared = 0;
for (const sys of world.systems || []) {
  if (sys.activity !== "battle") continue;
  const fleets = (world.fleets || []).filter((f) => f.systemId === sys.id);
  const legions = (world.legions || []).filter((l) => l.systemId === sys.id);
  const facs = new Set([
    ...fleets.map((f) => f.factionId),
    ...legions.map((l) => l.factionId),
  ]);
  if (facs.size <= 1) {
    sys.activity = null;
    battlesCleared += 1;
  }
}

const ledger = readJson(LEDGER_PATH, { factions: {}, entries: [] }) || {
  factions: {},
  entries: [],
};
const seeded = seedLedgerFloors(ledger, world);

const after = summarizeLoyalty(world);

console.log(
  JSON.stringify(
    {
      dryRun,
      turn,
      before,
      loyaltyStats,
      battlesCleared,
      ledgerSeeded: seeded.length,
      after,
      sampleSeeded: seeded.slice(0, 8).map((s) => ({
        id: s.id,
        deficit: s.deficit,
        pressure: s.pressure,
      })),
    },
    null,
    2,
  ),
);

if (dryRun) {
  console.log("Dry run — no files written");
  process.exit(0);
}

const written = writeLiveBoard(world, {
  backup: false,
  reason: "loyalty_repair",
  skipEngagementReconcile: false,
});
if (!written.ok) {
  console.error("writeLiveBoard failed", written);
  process.exit(1);
}
writeJson(LEDGER_PATH, ledger);
console.log(`Wrote published rev=${written.tableRevision}, ledger floors applied`);
