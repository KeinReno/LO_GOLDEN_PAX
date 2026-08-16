/**
 * System-level player actions: stations + ship/unit production.
 *
 * produce_unit / produce_ship hire through forceRecruit raise rules
 * (population + currency + 30% ceiling + building gates). Force AP is
 * an order tax only — currency is not billed a second time.
 */
import { randomUUID } from "crypto";
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";
import { reservedAp, reservedForceAp, readIntents, writeIntents } from "./intents.mjs";
import { writeLiveBoard } from "./tableStore.mjs";
import { produceForceAp, stationCost } from "./forceEconomy.mjs";
import { intentApCosts } from "./apBudget.mjs";
import { applyForceRaise } from "./forceRecruit.mjs";
import { canBuildWithTech } from "./techActions.mjs";

const STATION_DEFS = {
  mining: {
    kind: "mining",
    name: "Добывающая станция",
    ap: 1,
    cost: { "currency.metal": 24, "currency.supply": 10 },
  },
  military: {
    kind: "military",
    name: "Оборонная платформа",
    ap: 2,
    cost: { "currency.metal": 36, "currency.supply": 15 },
  },
  science: {
    kind: "science",
    name: "Научная станция",
    ap: 1,
    cost: { "currency.metal": 22, "currency.supply": 9 },
  },
  trade: {
    kind: "trade",
    name: "Торговый узел",
    ap: 1,
    cost: { "currency.metal": 24, "currency.supply": 10 },
  },
  relay: {
    kind: "relay",
    name: "Релейный маяк",
    ap: 1,
    cost: { "currency.metal": 20, "currency.supply": 8 },
  },
};

const MAX_STATIONS = 8;

function findSystem(world, systemId) {
  const system = (world.systems ?? []).find((s) => s.id === systemId);
  if (!system) return { error: "Система не найдена" };
  return { system };
}

function ownsSystem(system, factionId) {
  return system.ownerFactionId === factionId;
}

function canAfford(eco, cost) {
  for (const [cur, amt] of Object.entries(cost || {})) {
    const numAmt = Number(amt || 0);
    if (numAmt < 0) return { ok: false, error: "Отрицательная стоимость недопустима" };
    if ((eco.stocks?.[cur] ?? 0) < numAmt) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${numAmt})` };
    }
  }
  return { ok: true };
}

function pay(factionId, cost, apNeed, apMax, turn, opts = {}) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const force = !!opts.force;
  const used = force
    ? reservedForceAp(factionId, turn)
    : reservedAp(factionId, turn);
  const cap = force ? opts.forceApMax ?? 0 : apMax;
  if (apNeed > 0 && used + apNeed > cap) {
    const label = force ? "ОД сил" : "ОД";
    return {
      ok: false,
      error: `Не хватает ${label} (нужно ${apNeed}, свободно ${Math.max(0, cap - used)})`,
    };
  }
  const aff = canAfford(eco, cost);
  if (!aff.ok) return aff;
  for (const [cur, amt] of Object.entries(cost || {})) {
    adjustStock(ledger, factionId, cur, -amt, {
      turn,
      reason: "system_action",
    });
  }
  writeLedger(ledger);
  return {
    ok: true,
    cost,
    ap: force ? 0 : apNeed,
    forceAp: force ? apNeed : 0,
  };
}

function recordIntent(factionId, defId, payload, note, turn, cost, apMeta = {}) {
  const intents = readIntents();
  const fromDef = intentApCosts(getContent().intents?.[defId]);
  const intent = {
    id: randomUUID(),
    factionId,
    defId,
    status: "resolved",
    turn,
    submittedAt: new Date().toISOString(),
    payload,
    note: note || "",
    cost: cost || null,
    apCost: apMeta.apCost ?? fromDef.apCost,
    forceApCost: apMeta.forceApCost ?? fromDef.forceApCost,
    source: "system",
  };
  intents.push(intent);
  writeIntents(intents);
  return intent;
}

export function systemHasShipyard(system, factionId) {
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of [...(p.orbitalBuildings ?? []), ...(p.surfaceBuildings ?? [])]) {
      if (b.kind === "shipyard" || b.kind === "spaceport") return true;
    }
  }
  if ((system.stations ?? []).some((s) => s.kind === "military" && s.factionId === factionId)) {
    return true;
  }
  return false;
}

export function systemHasBarracks(system, factionId) {
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of p.surfaceBuildings ?? []) {
      if (b.kind === "barracks") return true;
    }
  }
  return false;
}

function produceAp(def, count) {
  return produceForceAp(def, count);
}

/**
 * Produce hire costs (document once; both produce_unit and produce_ship):
 * - Population: forceRecruit raise (30% ceiling; ships also pay crewCount).
 * - Currency: billed once by applyForceRaise (`produceForceCost`).
 * - Force AP: order tax only (`produceForceAp`). Not a second currency charge.
 */
function planetOwnerId(system, planet) {
  return planet?.ownerFactionId || system?.ownerFactionId || null;
}

export function resolveProducePlanet(system, factionId, planetId) {
  const planets = system?.planets ?? [];
  if (planetId) {
    const planet = planets.find((p) => p.id === planetId);
    if (!planet) return { ok: false, error: "Планета не найдена" };
    return { ok: true, planet };
  }
  const owned = planets.filter((p) => planetOwnerId(system, p) === factionId);
  if (!owned.length) {
    return { ok: false, error: "Нет подконтрольной планеты для набора" };
  }
  owned.sort(
    (a, b) => (Number(b.population) || 0) - (Number(a.population) || 0),
  );
  return { ok: true, planet: owned[0] };
}

function checkForceApTax(factionId, apNeed, forceApMax, turn) {
  if (apNeed <= 0) return { ok: true };
  const used = reservedForceAp(factionId, turn);
  const cap = forceApMax ?? 0;
  if (used + apNeed > cap) {
    return {
      ok: false,
      error: `Не хватает ОД сил (нужно ${apNeed}, свободно ${Math.max(0, cap - used)})`,
    };
  }
  return { ok: true };
}

function produceViaRaise({
  world,
  factionId,
  system,
  kind,
  def,
  count,
  forceId,
  planetId,
  note,
  turn,
  forceApMax,
  persist = true,
  ledger,
}) {
  const ap = produceAp(def, count);
  if (persist !== false) {
    const apOk = checkForceApTax(factionId, ap, forceApMax, turn);
    if (!apOk.ok) return apOk;
  }

  const picked = resolveProducePlanet(system, factionId, planetId);
  if (!picked.ok) return picked;

  const raised = applyForceRaise({
    world,
    factionId,
    systemId: system.id,
    planetId: picked.planet.id,
    kind,
    defId: def.id,
    count,
    forceId,
    persist: persist !== false,
    ledger,
  });
  if (!raised.ok) return raised;

  let intent = null;
  if (persist !== false) {
    intent = recordIntent(
      factionId,
      kind === "ship" ? "intent.produce_ship" : "intent.produce_unit",
      {
        systemId: system.id,
        planetId: picked.planet.id,
        count,
        ...(kind === "ship"
          ? { shipId: def.id, fleetId: raised.force?.id }
          : { unitId: def.id, legionId: raised.force?.id }),
      },
      note,
      turn,
      raised.cost,
      { apCost: 0, forceApCost: ap },
    );
  }

  return {
    ok: true,
    intent,
    fleet: kind === "ship" ? raised.force : undefined,
    legion: kind === "unit" ? raised.force : undefined,
    planet: raised.planet,
    popCost: raised.popCost,
    cost: raised.cost,
    forceAp: ap,
  };
}

function resolveStationDef(kind) {
  const fromContent = getContent().stations?.[kind];
  if (fromContent) {
    return {
      kind: fromContent.kind ?? kind,
      name: fromContent.name,
      ap: Number(fromContent.ap ?? 1),
      requireProperties: fromContent.requireProperties || [],
      cost:
        fromContent.cost ??
        stationCost(kind) ??
        STATION_DEFS[kind]?.cost ??
        {},
    };
  }
  const fallback = STATION_DEFS[kind];
  if (!fallback) return null;
  return {
    ...fallback,
    cost: stationCost(kind) ?? fallback.cost,
  };
}

/**
 * @returns {{ ok: boolean, error?: string, intent?: object, station?: object, fleet?: object, legion?: object }}
 */
function sanitizeName(raw, fallback = "Безымянный") {
  const name = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 48);
  return name || fallback;
}

export function applySystemAction({
  world,
  factionId,
  action,
  systemId,
  stationKind,
  stationId,
  shipId,
  unitId,
  count = 1,
  fleetId,
  legionId,
  planetId,
  beltAngle,
  name,
  note,
  apMax,
  forceApMax = 0,
  persist = true,
  ledger,
}) {
  const found = findSystem(world, systemId);
  if (found.error) return { ok: false, error: found.error };
  const { system } = found;
  if (!ownsSystem(system, factionId)) {
    return { ok: false, error: "Система не под вашим контролем" };
  }
  const turn = world.meta?.turn ?? 0;
  const n = Math.max(1, Math.min(20, Number(count) || 1));

  if (action === "build_station") {
    const def = resolveStationDef(stationKind);
    if (!def) return { ok: false, error: "Неизвестный тип станции" };
    const ledgerGate = readLedger();
    const ecoGate = ensureFactionEco(ledgerGate, factionId);
    const techGate = canBuildWithTech(ecoGate, def);
    if (!techGate.ok) return techGate;
    system.stations = system.stations ?? [];
    if (system.stations.length >= MAX_STATIONS) {
      return { ok: false, error: `Лимит станций в системе (${MAX_STATIONS})` };
    }
    const paid = pay(factionId, def.cost, def.ap, apMax, turn);
    if (!paid.ok) return paid;
    const angleOk =
      typeof beltAngle === "number" && Number.isFinite(beltAngle)
        ? ((beltAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
        : undefined;
    const station = {
      id: randomUUID(),
      name: def.name,
      kind: def.kind,
      factionId,
      orbitIndex:
        planetId && (system.planets ?? []).some((p) => p.id === planetId)
          ? (system.planets.find((p) => p.id === planetId)?.orbitIndex ??
            system.planets.findIndex((p) => p.id === planetId) + 1)
          : undefined,
      anchorPlanetId: planetId || undefined,
      ...(angleOk != null ? { beltAngle: angleOk } : {}),
    };
    system.stations.push(station);
    writeLiveBoard(world);
    const intent = recordIntent(
      factionId,
      "intent.build_station",
      {
        systemId,
        stationKind,
        stationId: station.id,
        planetId,
        beltAngle: angleOk,
      },
      note,
      turn,
      paid.cost,
      { apCost: paid.ap, forceApCost: 0 },
    );
    return { ok: true, intent, station };
  }

  if (action === "demolish_station") {
    system.stations = system.stations ?? [];
    const idx = system.stations.findIndex((s) => s.id === stationId);
    if (idx < 0) return { ok: false, error: "Станция не найдена" };
    const st = system.stations[idx];
    const ownerOk =
      st.factionId === factionId ||
      (!st.factionId && system.ownerFactionId === factionId);
    if (!ownerOk) {
      return { ok: false, error: "Станция не принадлежит вам" };
    }
    const [removed] = system.stations.splice(idx, 1);
    writeLiveBoard(world);
    const intent = recordIntent(
      factionId,
      "intent.demolish_station",
      { systemId, stationId },
      note,
      turn,
      null,
    );
    return { ok: true, intent, station: removed };
  }

  if (action === "rename_system") {
    const next = sanitizeName(name ?? note, system.name);
    if (next === system.name) {
      return { ok: true, system };
    }
    system.name = next;
    writeLiveBoard(world);
    const intent = recordIntent(
      factionId,
      "intent.rename_system",
      { systemId, name: next },
      note,
      turn,
      null,
    );
    return { ok: true, intent, system };
  }

  if (action === "produce_ship") {
    const def = getContent().ships?.[shipId];
    if (!def) return { ok: false, error: "Неизвестный корабль" };
    return produceViaRaise({
      world,
      factionId,
      system,
      kind: "ship",
      def,
      count: n,
      forceId: fleetId,
      planetId,
      note,
      turn,
      forceApMax,
      persist,
      ledger,
    });
  }

  if (action === "produce_unit") {
    const def = getContent().units?.[unitId];
    if (!def) return { ok: false, error: "Неизвестный юнит" };
    return produceViaRaise({
      world,
      factionId,
      system,
      kind: "unit",
      def,
      count: n,
      forceId: legionId,
      planetId,
      note,
      turn,
      forceApMax,
      persist,
      ledger,
    });
  }

  return { ok: false, error: `Неизвестное действие: ${action}` };
}

export function listStationCatalog() {
  const content = getContent();
  const kinds = new Set([
    ...Object.keys(content.stations || {}),
    ...Object.keys(STATION_DEFS),
  ]);
  return [...kinds].map((kind) => resolveStationDef(kind)).filter(Boolean);
}
