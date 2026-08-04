/**
 * Found hybrid lineage on a planet (intent + API).
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
  publicEconomyPayload,
} from "./ledger.mjs";
import { readLiveBoard, writeLiveBoard } from "./tableStore.mjs";
import { resolvePlanetRaceComposition } from "./modifierStack.mjs";
import {
  canHybridizePair,
  factionHasLineage,
} from "./hybridRegistry.mjs";
import { readIntents, writeIntents, reservedAp } from "./intents.mjs";

function shareOf(composition, raceId) {
  for (const row of composition || []) {
    if (row.raceId === raceId) return Number(row.percent ?? 0);
  }
  return 0;
}

function findPlanet(world, systemId, planetId) {
  const sys = (world.systems || []).find((s) => s.id === systemId);
  if (!sys) return null;
  const planet = (sys.planets || []).find((p) => p.id === planetId);
  if (!planet) return null;
  return { sys, planet };
}

/**
 * @returns {{ ok: boolean, error?: string, lineageId?: string, planet?: object }}
 */
export function foundHybridLineage(factionId, systemId, planetId, raceA, raceB, meta = {}) {
  const content = getContent();
  const world = meta.world ?? readLiveBoard();
  const found = findPlanet(world, systemId, planetId);
  if (!found) return { ok: false, error: "Планета не найдена" };
  const { sys, planet } = found;
  if (sys.ownerFactionId !== factionId) {
    return { ok: false, error: "Система не принадлежит фракции" };
  }
  if ((planet.population ?? 0) <= 0) {
    return { ok: false, error: "Нет населения" };
  }

  const pair = canHybridizePair(content, raceA, raceB);
  if (!pair.ok) return pair;
  const lineageId = pair.lineageId;
  if (!content.races?.[lineageId]) {
    return { ok: false, error: `Линейдж ${lineageId} не описан в контенте` };
  }

  const faction = (world.factions || []).find((f) => f.id === factionId);
  const composition = resolvePlanetRaceComposition(planet, faction);
  const rules = content.hybrid_rules || {};
  const min = Number(rules.minParentSharePercent ?? 35);
  const a = raceA;
  const b = raceB;
  if (shareOf(composition, a) < min || shareOf(composition, b) < min) {
    return {
      ok: false,
      error: `На планете нужно ≥${min}% каждой родительской расы`,
    };
  }

  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  if (factionHasLineage(eco, lineageId)) {
    // allow planet-level mix even if empire already unlocked
  }

  const cost = rules.foundLineageCost || { "currency.cognitio": 40 };
  for (const [cur, amt] of Object.entries(cost)) {
    const need = Number(amt) || 0;
    if (need <= 0) continue;
    const have = Number(eco.stocks?.[cur] ?? 0);
    if (have < need) {
      return { ok: false, error: `Недостаточно ${cur}` };
    }
  }

  const turn = meta.turn ?? world.meta?.turn ?? null;
  for (const [cur, amt] of Object.entries(cost)) {
    const n = Number(amt) || 0;
    if (!n) continue;
    adjustStock(ledger, factionId, cur, -n, {
      turn,
      reason: "found_hybrid_lineage",
      intentId: lineageId,
    });
  }

  if (!Array.isArray(eco.unlockedLineages)) eco.unlockedLineages = [];
  if (!eco.unlockedLineages.includes(lineageId)) {
    eco.unlockedLineages.push(lineageId);
  }
  writeLedger(ledger);

  const addPct = Number(rules.lineageCompositionPercent ?? 20);
  const comp = [...composition];
  const takeFrom = [a, b].sort((x, y) => shareOf(comp, y) - shareOf(comp, x));
  let remaining = addPct;
  for (const pid of takeFrom) {
    if (remaining <= 0) break;
    const row = comp.find((r) => r.raceId === pid);
    if (!row) continue;
    const deduct = Math.min(remaining, Math.floor(Number(row.percent) / 2));
    row.percent = Math.max(0, Number(row.percent) - deduct);
    remaining -= deduct;
  }
  const hybridRow = comp.find((r) => r.raceId === lineageId);
  if (hybridRow) hybridRow.percent = Number(hybridRow.percent) + addPct;
  else comp.push({ raceId: lineageId, percent: addPct });
  const sum = comp.reduce((s, r) => s + Number(r.percent || 0), 0);
  if (sum > 0 && sum !== 100) {
    for (const r of comp) r.percent = Math.round((Number(r.percent) / sum) * 100);
  }
  planet.raceComposition = comp;
  planet.lineageId = lineageId;
  if (!planet.cultureId || planet.cultureId === "culture.baseline") {
    planet.cultureId = "culture.syncretic";
  }

  return {
    ok: true,
    lineageId,
    planet,
    eco: { unlockedLineages: [...eco.unlockedLineages] },
  };
}

function checkAp(factionId, turn, apCost, apMax) {
  if (apCost <= 0) return { ok: true };
  const used = reservedAp(factionId, turn);
  if (used + apCost > apMax) {
    return {
      ok: false,
      error: `Недостаточно AP (занято ${used}/${apMax}, нужно ещё ${apCost})`,
    };
  }
  return { ok: true };
}

function recordAppliedIntent({
  factionId,
  defId,
  payload,
  note,
  turn,
  apCost,
}) {
  const intent = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    defId,
    factionId,
    turn,
    status: "applied",
    apCost,
    payload: payload || {},
    note: note || "",
    submittedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
    source: "society",
    legacyType: defId.replace(/^intent\./, ""),
  };
  const list = readIntents();
  list.push(intent);
  writeIntents(list);
  return intent;
}

/** Instant apply (player UI) — mutates world + ledger, records AP. */
export function applyFoundHybridLineageInstant({
  world,
  factionId,
  systemId,
  planetId,
  raceA,
  raceB,
  apMax,
}) {
  const content = getContent();
  const apCost =
    Number(content.intents?.["intent.found_hybrid_lineage"]?.ap) || 2;
  const turn = world.meta?.turn ?? 0;
  const apGate = checkAp(factionId, turn, apCost, apMax);
  if (!apGate.ok) return apGate;

  const result = foundHybridLineage(factionId, systemId, planetId, raceA, raceB, {
    world,
    turn,
  });
  if (!result.ok) return result;

  writeLiveBoard(world, { backup: false, reason: "found_hybrid_lineage" });
  const intent = recordAppliedIntent({
    factionId,
    defId: "intent.found_hybrid_lineage",
    payload: { systemId, planetId, raceA, raceB },
    turn,
    apCost,
  });
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  return {
    ok: true,
    lineageId: result.lineageId,
    intent,
    economy: publicEconomyPayload(eco),
  };
}
