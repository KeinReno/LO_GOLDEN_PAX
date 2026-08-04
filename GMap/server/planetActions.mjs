/**
 * Instant planetary actions: build / demolish / colonize / set colony type.
 */
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";
import { reservedAp, readIntents, writeIntents } from "./intents.mjs";
import { writeLiveBoard } from "./tableStore.mjs";
import { resolveAlias } from "./normalizeWorld.mjs";
import { canBuild as canBuildSlots, resolveSlots, resourceMatchesRequire } from "./slotResolver.mjs";
import { canBuildWithTech, factionHasProperty } from "./techActions.mjs";
import { canFactionBuildDef, raceIdsFromComposition } from "./buildingAccess.mjs";
import { CATEGORIES } from "./flowEngine.mjs";
import {
  listAvailableVariants,
  resolveVariant,
} from "./variantResolver.mjs";

export const BUILD_QUEUE_MAX = 5;
const SYSTEM_HISTORY_MAX = 40;

function normalizeColonyType(type) {
  if (!type || type === "none") return "none";
  if (type === "capital") return "core";
  return type;
}

function findSystemPlanet(world, systemId, planetId) {
  const system = (world.systems ?? []).find((s) => s.id === systemId);
  if (!system) return { error: "Система не найдена" };
  const planet = (system.planets ?? []).find((p) => p.id === planetId);
  if (!planet) return { error: "Планета не найдена" };
  return { system, planet };
}

function planetOwnerId(system, planet) {
  return planet.ownerFactionId || system.ownerFactionId || null;
}

function canManagePlanet(system, planet, factionId) {
  return planetOwnerId(system, planet) === factionId;
}

function canColonizePlanet(system, planet, factionId) {
  if (system.ownerFactionId !== factionId) return false;
  if ((planet.population ?? 0) > 0) return false;
  const ct = normalizeColonyType(planet.colonyType);
  if (ct && ct !== "none") return false;
  if (planet.ownerFactionId && planet.ownerFactionId !== factionId) return false;
  if (planet.colonizable === false) return false;
  return !!(planet.habitable || planet.colonizable !== false);
}

function buildingDefs(content) {
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
function resolveBuildingDef(content, buildingId, composition) {
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

function colonyDefs(content) {
  return content.colonies || {};
}

function defForKindZone(content, kind, zone) {
  return Object.values(buildingDefs(content)).find(
    (d) => d.kind === kind && d.zone === zone,
  );
}

function colonyDefForType(content, colonyType) {
  const t = normalizeColonyType(colonyType);
  return Object.values(colonyDefs(content)).find((d) => d.colonyType === t);
}

function buildCostMult(factionId) {
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
  return mult;
}

function scaledCost(cost, mult) {
  const out = {};
  for (const [k, v] of Object.entries(cost || {})) {
    out[k] = Math.ceil(Number(v || 0) * mult);
  }
  return out;
}

function canAfford(eco, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    if ((eco.stocks?.[cur] ?? 0) < amt) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${amt})` };
    }
  }
  return { ok: true };
}

function spendCost(ledger, factionId, cost, turn, intentId, reason) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    if (!amt) continue;
    adjustStock(ledger, factionId, cur, -amt, { turn, reason, intentId });
  }
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
    source: "planet",
    legacyType: defId.replace(/^intent\./, ""),
  };
  const list = readIntents();
  list.push(intent);
  writeIntents(list);
  return intent;
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

function checkBuildForbidden(factionId) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  if (eco.deficit === "empty") {
    return { ok: false, error: "Пустая казна: строительство запрещено" };
  }
  return { ok: true };
}

/**
 * @returns {{ ok: true, intent, world, planet } | { ok: false, error: string }}
 */
function sanitizeName(raw, fallback = "Безымянный") {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return name || fallback;
}

export function applyPlanetAction({
  world,
  factionId,
  action,
  systemId,
  planetId,
  buildingId,
  instanceId,
  colonyType,
  note,
  apMax,
  // New economy model: fill_slot params
  slotRole,
  slotResourceId,
  name,
}) {
  const content = getContent();
  const turn = world.meta?.turn ?? 0;
  const found = findSystemPlanet(world, systemId, planetId);
  if (found.error) return { ok: false, error: found.error };
  const { system, planet } = found;

  if (action === "build") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    if ((planet.population ?? 0) <= 0 && normalizeColonyType(planet.colonyType) === "none") {
      return { ok: false, error: "Сначала колонизируйте планету" };
    }
    const resolved = resolveBuildingDef(
      content,
      buildingId,
      planet.raceComposition || [],
    );
    if (!resolved?.def) return { ok: false, error: "Неизвестное здание" };
    const def = resolved.def;
    // Variant must be available for this planet's race mix
    if (def.base && def.base !== buildingId) {
      const listed = listAvailableVariants(
        "buildings",
        def.base,
        planet.raceComposition || [],
        content,
        content.rules,
      );
      if (!listed.available.some((a) => a.id === buildingId || a.id === resolved.id)) {
        return {
          ok: false,
          error: "Этот расовый вариант недоступен при текущем составе населения",
        };
      }
    }
    if (
      !canFactionBuildDef(def, factionId, {
        raceIds: raceIdsFromComposition(planet.raceComposition),
      })
    ) {
      return { ok: false, error: "Это здание недоступно вашей фракции" };
    }
    const ledgerPre = readLedger();
    const ecoPre = ensureFactionEco(ledgerPre, factionId);
    const techGate = canBuildWithTech(ecoPre, def);
    if (!techGate.ok) return techGate;
    // orbital → orbital list; surface/subsurface/deep → surface list (zone preserved on instance)
    const listKey = def.zone === "orbital" ? "orbitalBuildings" : "surfaceBuildings";
    const zone = def.zone || "surface";
    const list = [...(planet[listKey] ?? [])];
    const max =
      listKey === "orbitalBuildings"
        ? (planet.orbitalSlots ?? 4)
        : (planet.surfaceSlots ?? 8);
    if (list.length >= max) {
      return { ok: false, error: `Нет свободных слотов (${zone})` };
    }
    if (def.maxPerPlanet) {
      const all = [
        ...(planet.surfaceBuildings ?? []),
        ...(planet.orbitalBuildings ?? []),
      ];
      const same = all.filter(
        (b) =>
          (b.buildingId === buildingId || b.kind === def.kind) && !b.disabled,
      ).length;
      if (same >= def.maxPerPlanet) {
        return { ok: false, error: `Лимит «${def.name}» на планете` };
      }
    }
    const apCost = def.ap ?? content.intents?.["intent.build"]?.ap ?? 1;
    const apGate = checkAp(factionId, turn, apCost, apMax);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(def.cost, buildCostMult(factionId));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, cost);
    if (!afford.ok) return afford;

    const building = {
      id: `bld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      buildingId: resolved.id || buildingId,
      baseBuildingId: resolved.baseId || buildingId,
      name: def.name,
      kind: def.kind,
      zone,
      slotFills: {},
    };
    list.push(building);
    planet[listKey] = list;
    if (!planet.ownerFactionId) planet.ownerFactionId = factionId;

    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.build",
      payload: { systemId, planetId, buildingId, instanceId: building.id },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, cost, turn, intent.id, "build");
    writeLedger(ledger);
    pushSystemHistory(system, {
      turn,
      type: "build",
      planetId,
      buildingId,
      description: `Построено: ${def.name} на ${planet.name}`,
    });
    writeLiveBoard(world, { backup: false, reason: "planet_build" });
    // New economy model: surface slot requirements (advisory, non-blocking)
    let slotInfo = null;
    try {
      const slotCheck = canBuildSlots(def);
      slotInfo = {
        hasSlots: !!(def.slots && def.slots.length > 0),
        slots: def.slots || [],
        canBuild: slotCheck.ok,
        missing: slotCheck.missing,
        bottlenecks: slotCheck.bottlenecks,
      };
    } catch (_e) {
      slotInfo = null;
    }
    return { ok: true, intent, world, planet, cost, building, slotInfo };
  }

  if (action === "demolish") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const apCost = content.intents?.["intent.demolish"]?.ap ?? 0;
    const apGate = checkAp(factionId, turn, apCost, apMax);
    if (!apGate.ok) return apGate;
    let removed = null;
    for (const key of ["surfaceBuildings", "orbitalBuildings"]) {
      const list = planet[key] ?? [];
      const idx = list.findIndex((b) => b.id === instanceId);
      if (idx >= 0) {
        removed = list[idx];
        planet[key] = list.filter((b) => b.id !== instanceId);
        break;
      }
    }
    if (!removed) return { ok: false, error: "Постройка не найдена" };
    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.demolish",
      payload: { systemId, planetId, instanceId },
      note,
      turn,
      apCost,
    });
    pushSystemHistory(system, {
      turn,
      type: "demolish",
      planetId,
      buildingId: removed.buildingId || removed.id,
      description: `Снесено: ${removed.name || removed.kind} на ${planet.name}`,
    });
    writeLiveBoard(world, { backup: false, reason: "planet_demolish" });
    return { ok: true, intent, world, planet, removed };
  }

  if (action === "colonize") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canColonizePlanet(system, planet, factionId)) {
      return {
        ok: false,
        error: "Нельзя колонизировать (нужна своя система и пустая планета)",
      };
    }
    const targetType = normalizeColonyType(colonyType || "outpost");
    if (targetType === "none") {
      return { ok: false, error: "Укажите тип колонии" };
    }
    const cdef = colonyDefForType(content, targetType);
    if (!cdef) return { ok: false, error: "Неизвестный тип колонии" };
    const apCost = cdef.colonizeAp ?? content.intents?.["intent.colonize"]?.ap ?? 1;
    const apGate = checkAp(factionId, turn, apCost, apMax);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(cdef.colonizeCost, buildCostMult(factionId));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, cost);
    if (!afford.ok) return afford;

    planet.colonyType = targetType;
    planet.population = Math.max(
      planet.population || 0,
      cdef.colonizePopulation ?? 2,
    );
    planet.ownerFactionId = factionId;
    planet.habitable = planet.habitable ?? true;
    planet.colonizable = true;
    planet.surveyed = true;
    if (!planet.surfaceBuildings) planet.surfaceBuildings = [];
    if (!planet.orbitalBuildings) planet.orbitalBuildings = [];

    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.colonize",
      payload: { systemId, planetId, colonyType: targetType },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, cost, turn, intent.id, "colonize");
    writeLedger(ledger);
    pushSystemHistory(system, {
      turn,
      type: "colonize",
      planetId,
      description: `Колонизирована планета ${planet.name} (${targetType})`,
    });
    writeLiveBoard(world, { backup: false, reason: "planet_colonize" });
    return { ok: true, intent, world, planet, cost };
  }

  if (action === "set_colony_type") {
    const forbid = checkBuildForbidden(factionId);
    if (!forbid.ok) return forbid;
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    if ((planet.population ?? 0) <= 0) {
      return { ok: false, error: "Нет колонии — сначала колонизируйте" };
    }
    const targetType = normalizeColonyType(colonyType);
    if (!targetType || targetType === "none") {
      return { ok: false, error: "Укажите тип колонии" };
    }
    if (normalizeColonyType(planet.colonyType) === targetType) {
      return { ok: false, error: "Тип уже установлен" };
    }
    const cdef = colonyDefForType(content, targetType);
    if (!cdef) return { ok: false, error: "Неизвестный тип колонии" };
    const apCost =
      cdef.setTypeAp ?? content.intents?.["intent.set_colony_type"]?.ap ?? 1;
    const apGate = checkAp(factionId, turn, apCost, apMax);
    if (!apGate.ok) return apGate;
    const cost = scaledCost(cdef.setTypeCost, buildCostMult(factionId));
    const ledger = readLedger();
    const eco = ensureFactionEco(ledger, factionId);
    const afford = canAfford(eco, cost);
    if (!afford.ok) return afford;

    planet.colonyType = targetType;

    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.set_colony_type",
      payload: { systemId, planetId, colonyType: targetType },
      note,
      turn,
      apCost,
    });
    spendCost(ledger, factionId, cost, turn, intent.id, "set_colony_type");
    writeLedger(ledger);
    writeLiveBoard(world, { backup: false, reason: "planet_set_type" });
    return { ok: true, intent, world, planet, cost };
  }

  if (action === "rename") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const next = sanitizeName(name ?? note, planet.name);
    if (next === planet.name) {
      return { ok: true, planet };
    }
    planet.name = next;
    writeLiveBoard(world, { backup: false, reason: "planet_rename" });
    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.rename_planet",
      payload: { systemId, planetId, name: next },
      note,
      turn,
      apCost: 0,
    });
    return { ok: true, intent, planet };
  }

  if (action === "fill_slot") {
    if (!canManagePlanet(system, planet, factionId)) {
      return { ok: false, error: "Планета не под вашим контролем" };
    }
    const inst = instanceId;
    const role = slotRole;
    const resourceId = slotResourceId;
    if (!inst || !role) {
      return { ok: false, error: "Нужны instanceId и slotRole" };
    }
    let target = null;
    let listKey = null;
    for (const key of ["surfaceBuildings", "orbitalBuildings"]) {
      const list = planet[key] ?? [];
      const idx = list.findIndex((b) => b.id === inst);
      if (idx >= 0) {
        target = list[idx];
        listKey = key;
        break;
      }
    }
    if (!target) return { ok: false, error: "Постройка не найдена" };
    const def =
      (target.buildingId && buildingDefs(content)[target.buildingId]) ||
      defForKindZone(content, target.kind, target.zone || "surface");
    if (!def?.slots) return { ok: false, error: "У здания нет слотов" };
    const slot = def.slots.find((s) => s.role === role);
    if (!slot) return { ok: false, error: `Слот '${role}' не найден` };

    if (!target.slotFills) target.slotFills = {};

    // Unfill when resourceId empty / null / "__clear__"
    const clearing =
      resourceId == null ||
      resourceId === "" ||
      resourceId === "__clear__";
    let filledId = null;
    if (clearing) {
      delete target.slotFills[role];
    } else {
      const resDef = Object.values(content.map_resources || {}).find(
        (r) => r.id === resourceId || r.name === resourceId,
      );
      if (!resDef) return { ok: false, error: "Ресурс не найден" };
      if (!resourceMatchesRequire(resDef, slot.require)) {
        return { ok: false, error: "Ресурс не подходит под требования слота" };
      }
      const ledgerGate = readLedger();
      const ecoGate = ensureFactionEco(ledgerGate, factionId);
      const slotProps = slot.require?.properties || [];
      for (const p of slotProps) {
        if (!(resDef.properties || []).includes(p)) continue;
        if (!factionHasProperty(ecoGate, p)) {
          const label =
            content.economy_schema?.properties?.[p]?.label || p;
          return { ok: false, error: `Нужно свойство: ${label}` };
        }
      }
      // Prefer planet-local deposits when planet has resources listed
      const local = planet.resources || [];
      if (local.length > 0) {
        const onPlanet = local.some(
          (n) => n === resDef.name || n === resDef.id,
        );
        if (!onPlanet) {
          return {
            ok: false,
            error: "Ресурс должен быть на этой планете",
          };
        }
      }
      target.slotFills[role] = resDef.id;
      filledId = resDef.id;
    }

    const list = planet[listKey];
    const idx = list.findIndex((b) => b.id === inst);
    list[idx] = target;
    planet[listKey] = list;
    const intent = recordAppliedIntent({
      factionId,
      defId: "intent.fill_slot",
      payload: {
        systemId,
        planetId,
        instanceId,
        role,
        resourceId: filledId,
        cleared: clearing,
      },
      note,
      turn,
      apCost: 0,
    });
    writeLiveBoard(world, {
      backup: false,
      reason: clearing ? "planet_unfill_slot" : "planet_fill_slot",
    });
    return { ok: true, intent, world, planet, building: target };
  }

  return { ok: false, error: `Неизвестное действие: ${action}` };
}

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
    const def = defForKindZone(content, b.kind, b.zone || "surface");
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
      const def = defForKindZone(content, b.kind, b.zone || "surface");
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
  const { computeFlowBreakdown } = await import("./economyTick.mjs");

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
  const cost = scaledCost(def.cost, buildCostMult(factionId));

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
