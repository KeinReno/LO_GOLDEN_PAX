/**
 * Planet-action read-only queries: pop cap, yields, build preview, build queue.
 * Extracted from ../planetActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, writeLedger, ensureFactionEco } from "../ledger.mjs";
import { resolveAlias } from "../normalizeWorld.mjs";
import { CATEGORIES } from "../flowEngine.mjs";
import {
  BUILD_QUEUE_MAX,
  findSystemPlanet,
  buildingDefs,
  buildingDefFromInstance,
  normalizeColonyType,
  colonyDefForType,
  scaledCost,
  buildCostMult,
} from "./helpers.mjs";

export function planetCapFromBuildings(planet, content) {
  const base = 20;
  let cap = base;
  const all = [
    ...(planet.surfaceBuildings ?? []),
    ...(planet.orbitalBuildings ?? []),
    ...(planet.buildings ?? []),
  ];
  for (const b of all) {
    if (b.disabled) continue;
    const def = buildingDefFromInstance(content, b);
    let added = false;
    for (const e of def?.effects || []) {
      if (e.effect === "pop_cap_add") {
        cap += Number(e.args?.amount || 0);
        added = true;
      }
    }
    if (!added) {
      if (b.kind === "residential" || b.kind === "habitat") cap += 15;
      if (b.kind === "capitol") cap += 10;
    }
  }
  const ct = normalizeColonyType(planet.colonyType);
  const cdef = colonyDefForType(content, ct);
  for (const e of cdef?.effects || []) {
    if (e.effect === "pop_cap_add") cap += Number(e.args?.amount || 0);
  }
  if (!cdef) {
    if (ct === "core") cap += 25;
    if (ct === "outpost") cap += 5;
  }
  return cap;
}

/** Unused by economyTick. Do not wire into tick — would double-count and skip the extract gate. */
export function collectPlanetYields(system, content) {
  const yields = { "currency.metal": 0, "currency.supply": 0 };
  for (const planet of system.planets ?? []) {
    for (const r of planet.resources ?? []) {
      const key = resolveAlias("resources", r);
      let def = content.map_resources?.[key];
      if (!def) {
        def = Object.values(content.map_resources || {}).find(
          (x) => x.name === r || x.id === key,
        );
      }
      if (!def?.yield) continue;
      for (const [cur, amt] of Object.entries(def.yield)) {
        yields[cur] = (yields[cur] || 0) + Number(amt || 0);
      }
    }
    const all = [
      ...(planet.surfaceBuildings ?? []),
      ...(planet.orbitalBuildings ?? []),
    ];
    for (const b of all) {
      if (b.disabled) continue;
      const def = buildingDefFromInstance(content, b);
      for (const e of def?.effects || []) {
        if (e.effect === "yield_flat") {
          const cur = e.args?.currency;
          if (cur) yields[cur] = (yields[cur] || 0) + Number(e.args?.amount || 0);
        }
      }
    }
    const ct = normalizeColonyType(planet.colonyType);
    const cdef = colonyDefForType(content, ct);
    for (const e of cdef?.effects || []) {
      if (e.effect === "yield_flat") {
        const cur = e.args?.currency;
        if (cur) yields[cur] = (yields[cur] || 0) + Number(e.args?.amount || 0);
      }
    }
  }
  return yields;
}

function diffTotals(before, after) {
  const delta = {};
  for (const cat of CATEGORIES) {
    const b = before?.[cat]?.net ?? 0;
    const a = after?.[cat]?.net ?? 0;
    delta[cat] = {
      before: b,
      after: a,
      delta: a - b,
      rateBefore: before?.[cat]?.rate ?? 0,
      rateAfter: after?.[cat]?.rate ?? 0,
    };
  }
  return delta;
}

/**
 * Non-mutating preview of flow totals if a building were constructed.
 */
export async function previewBuild({
  world,
  factionId,
  systemId,
  planetId,
  buildingId,
}) {
  const content = getContent();
  const def = buildingDefs(content)[buildingId];
  if (!def) return { ok: false, error: "Неизвестное здание" };

  const found = findSystemPlanet(world, systemId, planetId);
  if (found.error) return { ok: false, error: found.error };

  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const { computeFlowBreakdown } = await import("../economyTick.mjs");

  const beforeBreak = computeFlowBreakdown(world, factionId, content, eco);
  const before = beforeBreak.totals || {};

  const listKey = def.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
  const virtual = {
    id: `preview_${buildingId}`,
    buildingId,
    name: def.name,
    kind: def.kind,
    zone: def.zone || "surface",
    slotFills: {},
  };

  const clonedWorld = {
    ...world,
    systems: (world.systems ?? []).map((sys) => {
      if (sys.id !== systemId) return sys;
      return {
        ...sys,
        planets: (sys.planets ?? []).map((p) => {
          if (p.id !== planetId) return p;
          return {
            ...p,
            [listKey]: [...(p[listKey] ?? []), virtual],
          };
        }),
      };
    }),
  };

  const afterBreak = computeFlowBreakdown(clonedWorld, factionId, content, eco);
  const after = afterBreak.totals || {};
  const cost = scaledCost(def.cost, buildCostMult(factionId, planet));

  return {
    ok: true,
    building: {
      id: def.id,
      name: def.name,
      kind: def.kind,
      category: def.category ?? null,
      tier: def.tier ?? null,
      zone: def.zone || "surface",
      ap: def.ap ?? 1,
      cost,
    },
    before,
    after,
    delta: diffTotals(before, after),
    buildTurns: 1,
  };
}

/**
 * Replace faction build queue (planned builds, max BUILD_QUEUE_MAX).
 */
export function setBuildQueue(factionId, queue) {
  const content = getContent();
  const buildings = buildingDefs(content);
  if (!Array.isArray(queue)) {
    return { ok: false, error: "queue must be an array" };
  }
  if (queue.length > BUILD_QUEUE_MAX) {
    return { ok: false, error: `Очередь максимум ${BUILD_QUEUE_MAX}` };
  }

  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const clean = [];

  for (const raw of queue) {
    if (!raw || typeof raw !== "object") continue;
    const systemId = String(raw.systemId || "");
    const planetId = String(raw.planetId || "");
    const buildingId = String(raw.buildingId || "");
    if (!systemId || !planetId || !buildingId) continue;
    if (!buildings[buildingId]) {
      return { ok: false, error: `Неизвестное здание: ${buildingId}` };
    }
    clean.push({ systemId, planetId, buildingId });
  }

  eco.buildQueue = clean;
  writeLedger(ledger);
  return {
    ok: true,
    eco: {
      buildQueue: [...clean],
      researchQueue: [...(eco.researchQueue || [])],
    },
  };
}
