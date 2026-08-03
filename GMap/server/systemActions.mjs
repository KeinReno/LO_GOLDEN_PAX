/**
 * System-level player actions: stations + ship/unit production (Stellaris-style).
 */
import { randomUUID } from "crypto";
import { getContent } from "./contentLoader.mjs";
import {
  readLedger,
  writeLedger,
  ensureFactionEco,
  adjustStock,
} from "./ledger.mjs";
import { reservedAp, readIntents, writeIntents } from "./intents.mjs";
import { writeLiveBoard } from "./tableStore.mjs";

const STATION_DEFS = {
  mining: {
    kind: "mining",
    name: "Добывающая станция",
    ap: 1,
    cost: { "currency.metal": 24, "currency.supply": 6 },
  },
  military: {
    kind: "military",
    name: "Оборонная платформа",
    ap: 2,
    cost: { "currency.metal": 36, "currency.supply": 12 },
  },
  science: {
    kind: "science",
    name: "Научная станция",
    ap: 1,
    cost: { "currency.metal": 18, "currency.supply": 10 },
  },
  trade: {
    kind: "trade",
    name: "Торговый узел",
    ap: 1,
    cost: { "currency.metal": 22, "currency.supply": 8 },
  },
  relay: {
    kind: "relay",
    name: "Релейный маяк",
    ap: 1,
    cost: { "currency.metal": 28, "currency.supply": 6 },
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
    if ((eco.stocks?.[cur] ?? 0) < amt) {
      return { ok: false, error: `Не хватает ${cur} (нужно ${amt})` };
    }
  }
  return { ok: true };
}

function pay(factionId, cost, apNeed, apMax, turn) {
  const ledger = readLedger();
  const eco = ensureFactionEco(ledger, factionId);
  const used = reservedAp(factionId, turn);
  if (used + apNeed > apMax) {
    return { ok: false, error: `Не хватает AP (нужно ${apNeed}, свободно ${Math.max(0, apMax - used)})` };
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
  return { ok: true, cost, ap: apNeed };
}

function recordIntent(factionId, defId, payload, note, turn, cost) {
  const intents = readIntents();
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
    source: "system",
  };
  intents.push(intent);
  writeIntents(intents);
  return intent;
}

function systemHasShipyard(system, factionId) {
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

function systemHasBarracks(system, factionId) {
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of p.surfaceBuildings ?? []) {
      if (b.kind === "barracks") return true;
    }
  }
  return false;
}

function produceCost(def, count) {
  const tier = Number(def.tier ?? 1);
  const n = Math.max(1, count | 0);
  return {
    "currency.metal": Math.ceil((8 + tier * 6) * n),
    "currency.supply": Math.ceil((4 + tier * 2) * n),
  };
}

function produceAp(def, count) {
  const tier = Number(def.tier ?? 1);
  return Math.max(1, Math.ceil((tier >= 4 ? 2 : 1) * Math.max(1, count | 0) * 0.5));
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
    const def = STATION_DEFS[stationKind];
    if (!def) return { ok: false, error: "Неизвестный тип станции" };
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
    if (!systemHasShipyard(system, factionId)) {
      return {
        ok: false,
        error: "Нужна верфь/космопорт на планете или военная станция в системе",
      };
    }
    const content = getContent();
    const def = content.ships?.[shipId];
    if (!def) return { ok: false, error: "Неизвестный корабль" };
    const cost = produceCost(def, n);
    const ap = produceAp(def, n);
    const paid = pay(factionId, cost, ap, apMax, turn);
    if (!paid.ok) return paid;

    let fleet = (world.fleets ?? []).find(
      (f) => f.id === fleetId && f.factionId === factionId && f.systemId === systemId,
    );
    if (!fleet) {
      fleet = (world.fleets ?? []).find(
        (f) => f.factionId === factionId && f.systemId === systemId,
      );
    }
    if (!fleet) {
      fleet = {
        id: randomUUID(),
        name: `Эскадра · ${system.name}`,
        factionId,
        systemId,
        kind: "combat",
        composition: [],
        stance: "idle",
        route: [],
      };
      world.fleets = world.fleets ?? [];
      world.fleets.push(fleet);
    }
    fleet.composition = Array.isArray(fleet.composition)
      ? fleet.composition
      : [];
    const group = fleet.composition.find(
      (g) => g.defId === def.id || g.type === def.name || g.type === def.id,
    );
    if (group) group.count = (group.count || 0) + n;
    else {
      fleet.composition.push({
        type: def.name,
        defId: def.id,
        count: n,
      });
    }
    writeLiveBoard(world);
    const intent = recordIntent(
      factionId,
      "intent.produce_ship",
      { systemId, shipId, count: n, fleetId: fleet.id },
      note,
      turn,
      paid.cost,
    );
    return { ok: true, intent, fleet };
  }

  if (action === "produce_unit") {
    if (!systemHasBarracks(system, factionId)) {
      return { ok: false, error: "Нужны казармы на подконтрольной планете" };
    }
    const content = getContent();
    const def = content.units?.[unitId];
    if (!def) return { ok: false, error: "Неизвестный юнит" };
    const cost = produceCost(def, n);
    const ap = produceAp(def, n);
    const paid = pay(factionId, cost, ap, apMax, turn);
    if (!paid.ok) return paid;

    let legion = (world.legions ?? []).find(
      (l) => l.id === legionId && l.factionId === factionId && l.systemId === systemId,
    );
    if (!legion) {
      legion = (world.legions ?? []).find(
        (l) => l.factionId === factionId && l.systemId === systemId,
      );
    }
    if (!legion) {
      legion = {
        id: randomUUID(),
        name: `Легион · ${system.name}`,
        factionId,
        systemId,
        strength: 0,
        status: "idle",
        composition: [],
        route: [],
      };
      world.legions = world.legions ?? [];
      world.legions.push(legion);
    }
    legion.composition = legion.composition ?? [];
    const group = legion.composition.find(
      (g) => g.defId === def.id || g.type === def.name || g.type === def.id,
    );
    if (group) group.count = (group.count || 0) + n;
    else legion.composition.push({ type: def.name, defId: def.id, count: n });
    legion.strength = legion.composition.reduce((s, g) => s + (g.count || 0), 0);
    writeLiveBoard(world);
    const intent = recordIntent(
      factionId,
      "intent.produce_unit",
      { systemId, unitId, count: n, legionId: legion.id },
      note,
      turn,
      paid.cost,
    );
    return { ok: true, intent, legion };
  }

  return { ok: false, error: `Неизвестное действие: ${action}` };
}

export function listStationCatalog() {
  return Object.values(STATION_DEFS);
}
