/**
 * Builds GET /view JSON. No Express. SQL only via *Store.mjs.
 * Fog: domain/intel/fog.mjs. Briefing: domain/narrative/briefingFilter.mjs.
 */
import { getCampaign, getTableMeta, listFactions } from "./campaignStore.mjs";
import { loadEconomyAccount } from "./economyStore.mjs";
import { loadTechAccount, saveTechAccount } from "./techStore.mjs";
import { loadCivicAccount } from "./civicStore.mjs";
import { loadRelations } from "./diplomacyStore.mjs";
import { loadFactionCourt } from "./npcStore.mjs";
import { loadStability, listFactionRevolts } from "./stabilityStore.mjs";
import { loadFxExchangeState } from "./fxExchangeStore.mjs";
import { listSystemsWithPlanets } from "./planetStore.mjs";
import { listSystemLinks } from "./systemLinksStore.mjs";
import { listCampaignForces } from "./forcesStore.mjs";
import { loadLastTickJournal } from "./tickJournalStore.mjs";
import { resolveFogKnowledge } from "../domain/intel/fog.mjs";
import { filterBriefingForFaction } from "../domain/narrative/briefingFilter.mjs";
import { computeFactionFlowIncome } from "../domain/planets/flowIncome.mjs";
import { ensureOffers } from "../domain/tech/techOffers.mjs";
import { listFactionPlanets } from "./planetStore.mjs";

function silhouettePlanet(p) {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    habitable: p.habitable,
    colonyType: p.colonyType,
    ownerFactionId: p.ownerFactionId,
  };
}

function knowledge0System(system, owned) {
  if (owned) return { ...system, knowledge: 0 };
  return {
    id: system.id,
    name: system.name,
    x: system.x,
    y: system.y,
    kind: system.kind,
    ownerFactionId: system.ownerFactionId,
    isCapital: system.isCapital,
    knowledge: 0,
    planets: (system.planets || []).map(silhouettePlanet),
    spaceObjects: (system.spaceObjects || []).map((o) => ({ id: o.id, typeId: o.typeId })),
  };
}

function knowledge1System(system) {
  return {
    id: system.id,
    name: system.name,
    x: system.x,
    y: system.y,
    kind: system.kind,
    ownerFactionId: system.ownerFactionId,
    isCapital: system.isCapital,
    knowledge: 1,
  };
}

function approxCount(force) {
  return (force.composition || []).reduce((s, g) => s + (Number(g.count) || 0), 0);
}

function ownForceView(force) {
  const { compositionJson, ...rest } = force;
  return rest;
}

function spottedForceView(force) {
  return {
    id: force.id,
    factionId: force.factionId,
    kind: force.kind,
    name: force.name,
    systemId: force.systemId,
    knowledge: "spotted",
    approxCount: approxCount(force),
  };
}

function publicFx(fx) {
  if (!fx) return null;
  return { rates: fx.rates ?? [], updatedAt: fx.updatedAt ?? null, turn: fx.turn ?? null };
}

function selfRelations(relations, factionId) {
  const out = {};
  for (const [key, value] of Object.entries(relations || {})) {
    const [a, b] = key.split("|");
    if (a === factionId || b === factionId) out[key] = value;
  }
  return out;
}

function metFactionIds({ factionId, systems, forces, relations }) {
  const met = new Set();
  for (const s of systems) {
    if (s.ownerFactionId && s.ownerFactionId !== factionId) met.add(s.ownerFactionId);
  }
  for (const f of forces) {
    if (f.factionId && f.factionId !== factionId) met.add(f.factionId);
  }
  for (const key of Object.keys(relations || {})) {
    const [a, b] = key.split("|");
    if (a === factionId && b) met.add(b);
    if (b === factionId && a) met.add(a);
  }
  met.delete(factionId);
  return met;
}

/**
 * @returns {{ unchanged: true, tableRevision: number } | object}
 */
export function buildViewerPayload(db, campaignId, factionId, content, { sinceRevision } = {}) {
  const campaign = getCampaign(db, campaignId);
  if (!campaign) return { error: "campaign_not_found" };
  const meta = getTableMeta(db, campaignId) || { currentTurn: 0, tableRevision: 0 };
  if (sinceRevision != null && Number(sinceRevision) === meta.tableRevision) {
    return { unchanged: true, tableRevision: meta.tableRevision };
  }

  const factions = listFactions(db, campaignId);
  const selfRow = factions.find((f) => f.id === factionId);
  if (!selfRow) return { error: "faction_not_found" };

  const systems = listSystemsWithPlanets(db, campaignId);
  const links = listSystemLinks(db, campaignId);
  const allForces = listCampaignForces(db, campaignId);
  const relations = loadRelations(db, campaignId);
  const world = { systems, links, forces: allForces };
  const fog = resolveFogKnowledge(world, factionId);
  const visibleSystemIds = [...fog.visible];

  const systemViews = [];
  for (const sys of systems) {
    if (fog.hop0.has(sys.id)) {
      const owned = sys.ownerFactionId === factionId;
      systemViews.push(knowledge0System(sys, owned));
    } else if (fog.hop1.has(sys.id)) {
      systemViews.push(knowledge1System(sys));
    }
  }

  const visibleLinks = links
    .filter((l) => fog.visible.has(l.fromId) && fog.visible.has(l.toId))
    .map((l) => ({ fromId: l.fromId, toId: l.toId, type: l.type }));

  const forceViews = [];
  for (const force of allForces) {
    if (force.factionId === factionId) {
      forceViews.push(ownForceView(force));
      continue;
    }
    if (force.systemId && fog.visible.has(force.systemId)) {
      forceViews.push(spottedForceView(force));
    }
  }

  let tech = loadTechAccount(db, campaignId, factionId);
  if (tech) {
    const ensured = ensureOffers(tech, content, { factionPlanets: listFactionPlanets(db, campaignId, factionId) });
    if (ensured.changed) {
      saveTechAccount(db, campaignId, factionId, ensured.techAccount, { turn: meta.currentTurn ?? 0 });
    }
    tech = ensured.techAccount;
  }
  const eco = loadEconomyAccount(db, campaignId, factionId);
  const civic = loadCivicAccount(db, campaignId, factionId);
  const court = loadFactionCourt(db, campaignId, factionId, content);
  const journal = loadLastTickJournal(db, campaignId);
  const flowSnapshot = journal?.economy?.[factionId] ?? null;
  let flow = flowSnapshot;
  if (!flow) {
    flow = computeFactionFlowIncome(systems, factionId, content, tech, [], {
      faction: selfRow,
      currentTurn: meta.currentTurn ?? 0,
    }).income;
  }

  const self = {
    faction: {
      id: selfRow.id,
      name: selfRow.name,
      raceId: selfRow.raceId,
      colorHex: selfRow.colorHex,
      isNpc: selfRow.isNpc,
      pegResourceId: selfRow.pegResourceId,
      pegChangedTurn: selfRow.pegChangedTurn,
    },
    economy: eco
      ? {
          stocks: eco.stocks,
          taxes: eco.taxes,
          pressure: eco.pressure,
          deficit: eco.deficit,
          stockReserves: eco.stockReserves,
        }
      : null,
    flow,
    tech: tech
      ? {
          unlockedTechs: tech.unlockedTechs,
          techGrades: tech.techGrades,
          techSockets: tech.techSockets,
          currentOffers: tech.currentOffers,
          techTiers: tech.techTiers,
          unlockedProperties: tech.unlockedProperties,
        }
      : null,
    civic,
    court: { npcs: court.npcs, seats: court.council, blocs: court.internalBlocs },
    stability: loadStability(db, campaignId, factionId, content),
    revolts: listFactionRevolts(db, campaignId, factionId),
  };

  const relSelf = selfRelations(relations, factionId);
  const met = metFactionIds({ factionId, systems: systemViews, forces: forceViews, relations: relSelf });
  const others = factions
    .filter((f) => met.has(f.id))
    .map((f) => ({ id: f.id, name: f.name, colorHex: f.colorHex, isNpc: f.isNpc }));

  return {
    campaign: { id: campaign.id, name: campaign.name },
    currentTurn: meta.currentTurn ?? 0,
    tableRevision: meta.tableRevision ?? 0,
    viewer: { role: "player", factionId },
    self,
    others,
    visibleSystemIds,
    systems: systemViews,
    links: visibleLinks,
    forces: forceViews,
    relations: relSelf,
    briefing: filterBriefingForFaction(journal, factionId, { systems }),
    fx: publicFx(loadFxExchangeState(db, campaignId)),
  };
}
