/**
 * Raise-from-planet (v0.5 port into GMap).
 *
 * Why: `forcesActions.mjs` only edits an *existing* fleet/legion against
 * currency and refuses new stacks (`Нельзя создавать юниты напрямую`).
 * v0.5 closed that gap: units come from a planet's population + currency.
 *
 * Behavior (grill Q7–Q11 / domain/forces): recruits are a 30% mobilization
 * ceiling, not a stockpile; militia raises with no building; other units need
 * barracks, ships need shipyard (reuse `systemHasBarracks`/`systemHasShipyard`);
 * cost is `produceForceCost` + population; disband returns population, not a
 * full currency refund. `POST /api/system/action` produce_unit / produce_ship
 * now call this same raise (plus force-AP order tax). `/api/forces/mutate`
 * still only edits existing stacks and refuses net-new counts.
 *
 * Routes: POST `/api/forces/raise`, POST `/api/forces/disband-raised`
 * (unique marker: forces_raise_from_planet_v05).
 */
import { randomUUID } from "crypto";
import { produceForceCost } from "./forceEconomy.mjs";
import { systemHasBarracks, systemHasShipyard } from "./systemActions.mjs";
import { getContent } from "./contentLoader.mjs";
import { laborPopulation, laborToCensus } from "./populationScale.mjs";
import { stampForceMp } from "./forceMp.mjs";
import { factionContentTag } from "./buildingAccess.mjs";
import {
  adjustStock,
  ensureAllFactions,
  ensureFactionEco,
  getFactionPublicEco,
  publicEconomyPayload,
  readLedger,
  writeLedger,
} from "./ledger.mjs";
import { writeLiveBoard } from "./tableStore.mjs";
import { crewCountForRaise } from "./forceKindGuard.mjs";
import { factionHasProperty } from "./techActions.mjs";

/** Overflow recruits (overrideCeiling) cost this many population-units each. */
export const OVER_CEILING_POPULATION_MULT = 1.5;

export function mobilizableRecruits(planet, mobilizationRate, content) {
  const rate = Math.max(0, Math.min(1, Number(mobilizationRate) || 0));
  return Math.floor(laborPopulation(planet, content) * rate);
}

export function populationCostForRaise(count, ceiling, overrideCeiling = false) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const cap = Math.max(0, Math.floor(Number(ceiling) || 0));
  if (!overrideCeiling) return n;
  const within = Math.min(n, cap);
  const above = Math.max(0, n - cap);
  return within + Math.ceil(above * OVER_CEILING_POPULATION_MULT);
}

function planetOwnerId(system, planet) {
  return planet?.ownerFactionId || system?.ownerFactionId || null;
}

function normalizeRaiseKind(kind) {
  if (kind === "fleet" || kind === "ship") return "ship";
  return "unit";
}

function forceListKind(raiseKind) {
  return raiseKind === "ship" ? "fleet" : "legion";
}

/**
 * Whether `factionId` may raise `def` on `planet` right now.
 * Militia (`raisableWithoutBuilding`) skips the building gate.
 */
export function canRaiseUnit(system, planet, def, kind, factionId, eco) {
  if (planetOwnerId(system, planet) !== factionId) {
    return { ok: false, error: "Планета не принадлежит вам" };
  }
  const tag = factionContentTag(factionId);
  const fac = def?.faction;
  if (fac && fac !== "generic" && fac !== tag && fac !== factionId) {
    return { ok: false, error: "Этот тип недоступен вашей фракции" };
  }
  if (!def?.raisableWithoutBuilding) {
    const gated =
      kind === "ship"
        ? systemHasShipyard(system, factionId)
        : systemHasBarracks(system, factionId);
    if (!gated) {
      return {
        ok: false,
        error:
          kind === "ship"
            ? "Нужна верфь/космопорт на планете или военная станция в системе"
            : "Нужны казармы на подконтрольной планете",
      };
    }
  }
  for (const prop of def?.requireProperties || []) {
    if (!factionHasProperty(eco, prop)) {
      return { ok: false, error: `Нужно свойство: ${prop}` };
    }
  }
  return { ok: true };
}

function canAffordCost(stocks, cost) {
  for (const [currencyId, amount] of Object.entries(cost || {})) {
    const amt = Number(amount || 0);
    if (!amt) continue;
    if ((Number(stocks?.[currencyId]) || 0) < amt) {
      return {
        ok: false,
        error: `Недостаточно ${String(currencyId).replace(/^currency\./, "")} (нужно ${amt})`,
      };
    }
  }
  return { ok: true };
}

/**
 * Pure raise: deducts population + returns currency cost and a composition group.
 * Does not touch world/ledger.
 */
export function raiseUnit(system, planet, def, kind, factionId, count, stocks, content, opts = {}) {
  const raiseKind = normalizeRaiseKind(kind);
  const gate = canRaiseUnit(system, planet, def, raiseKind, factionId, opts.eco);
  if (!gate.ok) return gate;

  const n = Math.max(1, Math.floor(Number(count) || 0));
  const mobilizationRate =
    content?.economy_balance?.forces?.mobilizationRate ?? 0.3;
  const ceiling = mobilizableRecruits(planet, mobilizationRate, content);
  const overrideCeiling = opts.overrideCeiling === true;
  const crewCount = crewCountForRaise(
    raiseKind,
    def,
    n,
    content?.economy_balance?.forces?.crewPerTier,
  );
  const recruitAsk = n + crewCount;
  if (!overrideCeiling && ceiling < recruitAsk) {
    return {
      ok: false,
      error: `Недостаточно мобилизуемого населения (есть ${ceiling}, нужно ${recruitAsk})`,
    };
  }

  const popCost = populationCostForRaise(recruitAsk, ceiling, overrideCeiling);
  const labor = laborPopulation(planet, content);
  if (popCost > labor) {
    return {
      ok: false,
      error: `Недостаточно населения (есть ${labor}, нужно ${popCost})`,
    };
  }
  const censusCost = laborToCensus(popCost, planet, content);
  const pop = Number(planet.population) || 0;

  const cost = produceForceCost(raiseKind, def, n);
  const afford = canAffordCost(stocks, cost);
  if (!afford.ok) return afford;

  const nextStocks = { ...stocks };
  for (const [currencyId, amount] of Object.entries(cost)) {
    const amt = Number(amount || 0);
    if (!amt) continue;
    nextStocks[currencyId] = (Number(nextStocks[currencyId]) || 0) - amt;
  }

  const group = {
    type: def.name || def.id,
    defId: def.id,
    count: n,
  };
  if (def.tier != null) group.tier = Number(def.tier) || 1;
  if (Array.isArray(def.roles)) group.roles = [...def.roles];
  if (raiseKind === "ship" && crewCount > 0) group.crewCount = crewCount;

  return {
    ok: true,
    planet: { ...planet, population: Math.max(0, pop - censusCost) },
    stocks: nextStocks,
    cost,
    popCost,
    group,
  };
}

/** Disband returns population to the planet — no currency refund. */
export function disbandUnits(planet, count, content) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const census = laborToCensus(n, planet, content);
  return { ...planet, population: (Number(planet.population) || 0) + census };
}

export function reduceComposition(composition, count, defId) {
  const groups = Array.isArray(composition) ? composition.map((g) => ({ ...g })) : [];
  const total = groups.reduce((s, g) => s + (Number(g.count) || 0), 0);

  if (!defId && (count == null || count >= total)) {
    return { ok: true, composition: [], disbandedCount: total };
  }

  let idx = -1;
  if (defId) {
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].defId === defId || groups[i].type === defId) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return { ok: false, error: `Нет группы ${defId}` };
  } else {
    idx = groups.length - 1;
    if (idx < 0) return { ok: true, composition: [], disbandedCount: 0 };
  }

  const groupCount = Number(groups[idx].count) || 0;
  const take =
    count == null
      ? groupCount
      : Math.min(Math.max(0, Math.floor(Number(count) || 0)), groupCount);
  groups[idx] = { ...groups[idx], count: groupCount - take };
  return {
    ok: true,
    composition: groups.filter((g) => (g.count || 0) > 0),
    disbandedCount: take,
  };
}

function findSystem(world, systemId) {
  const system = (world?.systems ?? []).find((s) => s.id === systemId);
  return system || null;
}

function findPlanet(system, planetId) {
  return (system?.planets ?? []).find((p) => p.id === planetId) || null;
}

function findPlanetAnywhere(world, planetId) {
  if (!planetId) return null;
  for (const system of world?.systems ?? []) {
    const planet = findPlanet(system, planetId);
    if (planet) return { system, planet };
  }
  return null;
}

function upsertForce(world, opts) {
  const { forceKind, factionId, systemId, forceId, planetId, group, name, systemName } =
    opts;
  const listKey = forceKind === "fleet" ? "fleets" : "legions";
  let force = forceId
    ? (world[listKey] ?? []).find(
        (f) => f.id === forceId && f.factionId === factionId && f.systemId === systemId,
      )
    : null;
  if (!force) {
    force = {
      id: randomUUID(),
      name:
        name ||
        (forceKind === "fleet"
          ? `Эскадра · ${systemName}`
          : `Легион · ${systemName}`),
      factionId,
      systemId,
      homePlanetId: planetId,
      composition: [],
      route: [],
    };
    if (forceKind === "fleet") {
      force.kind = "combat";
      force.stance = "idle";
    } else {
      force.strength = 0;
      force.status = "idle";
    }
    world[listKey] = world[listKey] ?? [];
    world[listKey].push(force);
  }
  if (!force.homePlanetId) force.homePlanetId = planetId;
  force.composition = Array.isArray(force.composition) ? force.composition : [];
  const existing = force.composition.find(
    (g) => g.defId === group.defId || g.type === group.type,
  );
  if (existing) existing.count = (existing.count || 0) + group.count;
  else force.composition.push({ ...group });
  if (forceKind === "legion") {
    force.strength = force.composition.reduce((s, g) => s + (g.count || 0), 0);
  }
  return force;
}

function resolveHomePlanet(world, force, planetId) {
  const byId = planetId || force?.homePlanetId;
  if (byId) {
    const found = findPlanetAnywhere(world, byId);
    if (found) return found.planet;
  }
  const system = findSystem(world, force?.systemId);
  if (!system) return null;
  return (
    (system.planets ?? []).find(
      (p) => planetOwnerId(system, p) === force.factionId,
    ) || null
  );
}

/**
 * Persist raise onto the live board + ledger.
 * Pass `{ persist: false, ledger }` from tests to skip disk writes.
 */
export function applyForceRaise(opts) {
  const {
    world,
    factionId,
    systemId,
    planetId,
    kind,
    defId,
    count = 1,
    forceId,
    overrideCeiling = false,
    name,
    persist = true,
    ledger: ledgerArg,
  } = opts;
  if (!world) return { ok: false, error: "Нет мира" };
  if (!factionId) return { ok: false, error: "Нет фракции" };
  if (!systemId || !planetId) {
    return { ok: false, error: "Нужны systemId и planetId" };
  }

  const system = findSystem(world, systemId);
  if (!system) return { ok: false, error: "Система не найдена" };
  const planet = findPlanet(system, planetId);
  if (!planet) return { ok: false, error: "Планета не найдена" };

  const raiseKind = normalizeRaiseKind(kind);
  const content = getContent();
  const catalog = raiseKind === "ship" ? content.ships : content.units;
  const def = catalog?.[defId];
  if (!def) return { ok: false, error: "Неизвестный тип сил" };

  const ledger = ledgerArg || (persist ? ensureAllFactions(readLedger(), world) : { factions: {} });
  const eco = ensureFactionEco(ledger, factionId);
  const result = raiseUnit(
    system,
    planet,
    def,
    raiseKind,
    factionId,
    count,
    eco.stocks,
    content,
    { overrideCeiling, eco },
  );
  if (!result.ok) return result;

  planet.population = result.planet.population;
  const forceKind = forceListKind(raiseKind);
  const force = upsertForce(world, {
    forceKind,
    factionId,
    systemId,
    forceId,
    planetId,
    group: result.group,
    name,
    systemName: system.name || systemId,
  });
  stampForceMp(force, content, forceKind === "legion" ? "legion" : "fleet", def);

  if (persist) {
    const turn = world.meta?.turn ?? 0;
    if (!Array.isArray(ledger.entries)) ledger.entries = [];
    for (const [currencyId, amount] of Object.entries(result.cost || {})) {
      const amt = Number(amount || 0);
      if (!amt) continue;
      adjustStock(ledger, factionId, currencyId, -amt, {
        turn,
        reason: "forces_raise_from_planet_v05",
        intentId: `${raiseKind}:${def.id}`,
      });
    }
    writeLedger(ledger);
    writeLiveBoard(world, { backup: false, reason: "forces_raise_from_planet_v05" });
  } else {
    eco.stocks = result.stocks;
  }

  const pub = persist ? getFactionPublicEco(factionId) : eco;
  return {
    ok: true,
    force,
    kind: forceKind,
    planet,
    popCost: result.popCost,
    cost: result.cost,
    economy: publicEconomyPayload(pub),
  };
}

/**
 * Disband raised units: population returns to the home planet, no currency refund.
 * Marker: forces_raise_from_planet_v05. `/api/forces/mutate` still refunds metal
 * on deck edits.
 */
export function applyForceDisband(opts) {
  const {
    world,
    factionId,
    kind,
    id,
    count,
    defId,
    planetId,
    persist = true,
  } = opts;
  if (!world) return { ok: false, error: "Нет мира" };
  if (!factionId) return { ok: false, error: "Нет фракции" };
  if (!id) return { ok: false, error: "Нет id флота/легиона" };

  const forceKind = kind === "fleet" || kind === "ship" ? "fleet" : "legion";
  const listKey = forceKind === "fleet" ? "fleets" : "legions";
  const list = world[listKey] ?? [];
  const idx = list.findIndex((u) => u.id === id);
  if (idx < 0) return { ok: false, error: `${forceKind} не найден` };
  const force = list[idx];
  if (force.factionId !== factionId) {
    return { ok: false, error: "Чужой флот/легион" };
  }

  const reduced = reduceComposition(force.composition, count, defId);
  if (!reduced.ok) return reduced;

  const home = resolveHomePlanet(world, force, planetId);
  let planet = home;
  if (home && reduced.disbandedCount > 0) {
    const next = disbandUnits(home, reduced.disbandedCount, getContent());
    home.population = next.population;
    planet = home;
  }

  if (reduced.composition.length === 0) {
    list.splice(idx, 1);
    world[listKey] = list;
    if (persist) {
      writeLiveBoard(world, { backup: false, reason: "forces_disband_raised_v05" });
    }
    return { ok: true, force: null, planet, disbandedCount: reduced.disbandedCount };
  }

  force.composition = reduced.composition;
  if (forceKind === "legion") {
    force.strength = force.composition.reduce((s, g) => s + (g.count || 0), 0);
  }
  if (persist) {
    writeLiveBoard(world, { backup: false, reason: "forces_disband_raised_v05" });
  }
  return { ok: true, force, planet, disbandedCount: reduced.disbandedCount };
}
