/**
 * Planet-action shared helpers/validators: lookups, cost math, AP/afford
 * gates, building/colony def resolution. Extracted from ../planetActions.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { readLedger, ensureFactionEco, adjustStock } from "../ledger.mjs";
import { reservedAp, readIntents, writeIntents } from "../intents.mjs";
import { canBuildWithTech } from "../techActions.mjs";
import { canFactionBuildDef, raceIdsFromComposition } from "../buildingAccess.mjs";
import { planetAllowsBuildingBiome } from "../biomeMatch.mjs";
import { listAvailableVariants, resolveVariant } from "../variantResolver.mjs";
import { zoneSlotCap } from "../planetGrade.mjs";

export const BUILD_QUEUE_MAX = 5;
const SYSTEM_HISTORY_MAX = 40;

export function normalizeColonyType(type) {
  if (!type || type === "none") return "none";
  if (type === "capital") return "core";
  return type;
}

export function findSystemPlanet(world, systemId, planetId) {
  const system = (world.systems ?? []).find((s) => s.id === systemId);
  if (!system) return { error: "Система не найдена" };
  const planet = (system.planets ?? []).find((p) => p.id === planetId);
  if (!planet) return { error: "Планета не найдена" };
  return { system, planet };
}

function planetOwnerId(system, planet) {
  return planet.ownerFactionId || system.ownerFactionId || null;
}

export function canManagePlanet(system, planet, factionId) {
  return planetOwnerId(system, planet) === factionId;
}

export function canColonizePlanet(system, planet, factionId) {
  if (system.ownerFactionId !== factionId) return false;
  if ((planet.population ?? 0) > 0) return false;
  const ct = normalizeColonyType(planet.colonyType);
  if (ct && ct !== "none") return false;
  if (planet.ownerFactionId && planet.ownerFactionId !== factionId) return false;
  if (planet.colonizable === false) return false;
  return !!(planet.habitable || planet.colonizable !== false);
}

export function buildingDefs(content) {
  return content.buildings || {};
}

/**
 * Available building variants for a planet's race composition.
 */
export function listBuildingVariantsForPlanet(
  world,
  systemId,
  planetId,
  buildingId,
) {
  const content = getContent();
  const found = findSystemPlanet(world, systemId, planetId);
  if (found.error) return { ok: false, error: found.error };
  const composition = found.planet.raceComposition || [];
  const listed = listAvailableVariants(
    "buildings",
    buildingId,
    composition,
    content,
    content.rules,
  );
  return {
    ok: true,
    baseId: listed.baseId,
    threshold: listed.threshold,
    variants: listed.available.map((a) => ({
      id: a.id,
      name: a.def?.name,
      raceTag: a.raceTag,
      cost: a.def?.cost,
      flavor: a.def?.flavor,
      legacy: !!a.legacy,
    })),
  };
}

/**
 * Resolve a building id that may be a racial variant.
 */
export function resolveBuildingDef(content, buildingId, composition) {
  const resolved = resolveVariant("buildings", buildingId, content, {
    composition,
    rules: content.rules,
  });
  if (resolved?.def) return resolved;
  const raw = buildingDefs(content)[buildingId];
  if (!raw) return null;
  return { id: buildingId, def: raw, baseId: buildingId };
}

/**
 * Append a soft history row on a star system (mutates system).
 */
export function pushSystemHistory(system, entry) {
  if (!system || !entry) return;
  const row = {
    turn: Number(entry.turn) || 0,
    type: entry.type || "build",
    description: String(entry.description || ""),
  };
  if (entry.planetId) row.planetId = entry.planetId;
  if (entry.buildingId) row.buildingId = entry.buildingId;
  const list = Array.isArray(system.history) ? system.history : [];
  list.push(row);
  system.history = list.slice(-SYSTEM_HISTORY_MAX);
}

export function colonyDefs(content) {
  return content.colonies || {};
}

export function defForKindZone(content, kind, zone) {
  return Object.values(buildingDefs(content)).find(
    (d) => d.kind === kind && d.zone === zone,
  );
}

/** Prefer exact buildingId / baseBuildingId; fall back to kind+zone. */
export function buildingDefFromInstance(content, buildingInst) {
  const defs = buildingDefs(content);
  const id = buildingInst?.buildingId || buildingInst?.id;
  if (id && defs[id]) return defs[id];
  const baseId = buildingInst?.baseBuildingId;
  if (baseId && defs[baseId]) return defs[baseId];
  return defForKindZone(
    content,
    buildingInst?.kind,
    buildingInst?.zone || "surface",
  );
}

export function colonyDefForType(content, colonyType) {
  const t = normalizeColonyType(colonyType);
  return Object.values(colonyDefs(content)).find((d) => d.colonyType === t);
}

function buildingCostMultOnPlanet(content, planet) {
  let best = 1;
  const all = [
    ...(planet?.surfaceBuildings || []),
    ...(planet?.orbitalBuildings || []),
  ];
  for (const b of all) {
    if (b?.disabled) continue;
    const def = buildingDefFromInstance(content, b);
    if (!def) continue;
    for (const e of [...(def.effects || []), ...(def.extra_effects || [])]) {
      if (
        e.effect === "cost_mult" &&
        (e.args?.tag === "build" || !e.args?.tag) &&
        e.args?.mult != null
      ) {
        const m = Number(e.args.mult);
        if (Number.isFinite(m) && m > 0 && m < best) best = m;
      }
    }
  }
  return best;
}

export function buildCostMult(factionId, planet = null) {
  const content = getContent();
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  let mult = 1;
  for (const th of content.rules?.tax?.pressureThresholds || []) {
    if ((eco.pressure ?? 0) >= (th.min ?? 99)) {
      for (const e of th.effects || []) {
        if (e.effect === "cost_mult" && (e.args?.tag === "build" || !e.args?.tag)) {
          mult *= Number(e.args?.mult ?? 1);
        }
      }
    }
  }
  if (planet) mult *= buildingCostMultOnPlanet(content, planet);
  const floor = Number(content.economy_balance?.buildings?.buildCostMultFloor ?? 0.75);
  return Math.max(floor, mult);
}

function countBuildingInSystem(system, buildingId) {
  let n = 0;
  for (const p of system?.planets || []) {
    for (const b of [
      ...(p.surfaceBuildings || []),
      ...(p.orbitalBuildings || []),
    ]) {
      if (b?.disabled) continue;
      if (b.buildingId === buildingId || b.baseBuildingId === buildingId) n += 1;
    }
  }
  return n;
}

/**
 * Placement gates that used to live inline in applyPlanetAction's build
 * branch (biome, faction/race, tech, grade-derived slot cap, per-planet /
 * per-system limits). Ownership / colonize / AP / cost stay in the action.
 *
 * Grade is the source of truth for slot caps when set (P4a).
 */
export function canPlaceBuilding(system, planet, def, factionId, eco, content) {
  const pack = content || getContent();
  if (
    !canFactionBuildDef(def, factionId, {
      raceIds: raceIdsFromComposition(planet.raceComposition),
    })
  ) {
    return { ok: false, error: "Это здание недоступно вашей фракции" };
  }
  const techGate = canBuildWithTech(eco, def);
  if (!techGate.ok) return techGate;
  if (!planetAllowsBuildingBiome(planet, def.biome_restrictions)) {
    const need = (def.biome_restrictions || []).join(", ");
    return {
      ok: false,
      error: `«${def.name}» требует биом: ${need}`,
    };
  }
  const listKey = def.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
  const zone = def.zone || "surface";
  const list = planet[listKey] ?? [];
  const max = zoneSlotCap(planet, listKey, pack);
  if (list.length >= max) {
    return { ok: false, error: `Нет свободных слотов (${zone})` };
  }
  const buildingId = def.id;
  if (def.maxPerPlanet) {
    const all = [
      ...(planet.surfaceBuildings ?? []),
      ...(planet.orbitalBuildings ?? []),
    ];
    const same = all.filter(
      (b) => (b.buildingId === buildingId || b.baseBuildingId === buildingId) && !b.disabled,
    ).length;
    if (same >= def.maxPerPlanet) {
      return { ok: false, error: `Лимит «${def.name}» на планете` };
    }
  }
  if (def.maxPerSystem) {
    const sameSys = countBuildingInSystem(system, buildingId);
    if (sameSys >= def.maxPerSystem) {
      return { ok: false, error: `Лимит «${def.name}» на систему` };
    }
  }
  return { ok: true, listKey, zone };
}

export function scaledCost(cost, mult) {
  const out = {};
  for (const [k, v] of Object.entries(cost || {})) {
    out[k] = Math.ceil(Number(v || 0) * mult);
  }
  return out;
}

export function canAfford(eco, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const numAmt = Number(amt || 0);
    if (numAmt < 0) return { ok: false, error: "Отрицательная стоимость недопустима" };
    if ((eco.stocks?.[cur] ?? 0) < numAmt) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${numAmt})` };
    }
  }
  return { ok: true };
}

export function spendCost(ledger, factionId, cost, turn, intentId, reason) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    if (!amt) continue;
    adjustStock(ledger, factionId, cur, -amt, { turn, reason, intentId });
  }
}

export function recordAppliedIntent({
  factionId,
  defId,
  payload,
  note,
  turn,
  apCost,
  forceApCost = 0,
}) {
  const intent = {
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    defId,
    factionId,
    turn,
    status: "applied",
    apCost,
    forceApCost,
    payload: payload || {},
    note: note || "",
    submittedAt: new Date().toISOString(),
    resolvedAt: new Date().toISOString(),
    source: "planet",
    legacyType: defId.replace(/^intent\./, ""),
  };
  const list = readIntents();
  list.push(intent);
  writeIntents(list);
  return intent;
}

export function checkAp(factionId, turn, apCost, apMax) {
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

export function checkBuildForbidden(factionId) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  if (eco.deficit === "empty") {
    return { ok: false, error: "Пустая казна: строительство запрещено" };
  }
  return { ok: true };
}

export function sanitizeName(raw, fallback = "Безымянный") {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return name || fallback;
}
