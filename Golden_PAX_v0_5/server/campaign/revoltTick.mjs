/**
 * Per-turn stability + revolt orchestration. Domain stays pure; this file
 * is the campaign boundary that may touch db (CLAUDE.md rule 5).
 *
 * NOT a GMap port — GMap never consumed stability or spawned revolts.
 */
import { randomUUID } from "node:crypto";
import { addFaction, getFaction } from "./campaignStore.mjs";
import { seedFactionAccounts } from "./seed.mjs";
import { listFactionPlanets, savePlanet, updateSystem, listSystemsWithPlanets } from "./planetStore.mjs";
import { createForce, loadForce, saveForce, deleteForce, listCampaignForces, transferForceFaction } from "./forcesStore.mjs";
import {
  loadStability,
  saveStability,
  listFactionRevolts,
  upsertPlanetRevolt,
  deletePlanetRevolt,
} from "./stabilityStore.mjs";
import { tickStability, revoltProductionEffects, stabilityBand } from "../domain/court/stability.mjs";
import {
  spawnRebelForce,
  resolveRebelEngagement,
  resolveSecession,
  shouldSecede,
  pickHotspotPlanet,
  ownerLegionAtPlanet,
} from "../domain/court/revolt.mjs";
import { forceAfterExchange } from "../domain/forces/engage.mjs";

export function tickFactionStability(db, campaignId, faction, turn, courtEffects, content) {
  const current = loadStability(db, campaignId, faction.id, content);
  const next = tickStability({ ...faction, stability: current }, turn, courtEffects, content);
  saveStability(db, campaignId, faction.id, next.value);
  return { value: next.value, delta: next.delta, effects: revoltProductionEffects(next.value, content) };
}

function persistExchange(db, campaignId, force, survivingGroups) {
  if (!force) return { deleted: true, force: null };
  const next = forceAfterExchange(force, survivingGroups);
  if (next.deleted) {
    deleteForce(db, campaignId, force.id);
    return next;
  }
  saveForce(db, campaignId, next.force);
  return next;
}

function standDown(db, campaignId, revolt) {
  if (revolt?.rebelForceId) deleteForce(db, campaignId, revolt.rebelForceId);
  deletePlanetRevolt(db, campaignId, revolt.planetId);
}

function applySecession(db, campaignId, faction, planet, rebelForce, turn, content, systems) {
  const plan = resolveSecession(faction, planet, rebelForce, turn, content);
  if (!getFaction(db, campaignId, plan.newFaction.id)) {
    addFaction(db, campaignId, plan.newFaction);
    seedFactionAccounts(db, campaignId, plan.newFaction.id, content);
  }
  savePlanet(db, campaignId, { ...planet, ownerFactionId: plan.newFaction.id });
  if (plan.rebelForceId) transferForceFaction(db, campaignId, plan.rebelForceId, plan.newFaction.id);

  const sys = (systems || []).find((s) => s.id === planet.systemId);
  if (sys && sys.ownerFactionId === faction.id) {
    const remaining = (sys.planets || []).filter(
      (p) => p.id !== planet.id && (p.ownerFactionId ?? sys.ownerFactionId) === faction.id,
    );
    if (remaining.length === 0) {
      updateSystem(db, campaignId, sys.id, { ownerFactionId: plan.newFaction.id });
    }
  }
  deletePlanetRevolt(db, campaignId, planet.id);
  return plan;
}

function spawnAndMaybeEngage(db, campaignId, faction, planet, turn, content, forces) {
  const spawned = spawnRebelForce(planet, content, { stability: faction.stability, turn });
  const force = createForce(db, campaignId, {
    id: randomUUID(),
    factionId: spawned.factionId,
    kind: "legion",
    name: spawned.name,
    homePlanetId: spawned.homePlanetId,
    systemId: spawned.systemId,
    composition: spawned.composition,
  });
  upsertPlanetRevolt(db, campaignId, {
    planetId: planet.id,
    sourceFactionId: faction.id,
    rebelForceId: force.id,
    rebelFactionId: spawned.factionId,
    stage2SinceTurn: turn,
  });

  const garrison = ownerLegionAtPlanet(forces, faction.id, planet);
  let engagement = null;
  if (garrison) {
    const result = resolveRebelEngagement(garrison, force, content);
    if (result.ok) {
      persistExchange(db, campaignId, garrison, result.groupsA);
      const rebelsNext = persistExchange(db, campaignId, force, result.groupsB);
      engagement = { outcome: result.outcome, rebelDeleted: rebelsNext.deleted };
      if (rebelsNext.deleted) {
        deletePlanetRevolt(db, campaignId, planet.id);
      }
    }
  }
  return { force, engagement, rebelFactionId: spawned.factionId };
}

/**
 * Stage 2 spawn / stand-down / Stage 3 secession for one faction.
 * Stage 1 is the production multiplier already merged into flowIncome.
 */
export function applyFactionRevolt(db, campaignId, faction, turn, content) {
  const events = [];
  const planets = listFactionPlanets(db, campaignId, faction.id);
  const systems = listSystemsWithPlanets(db, campaignId);
  const forces = listCampaignForces(db, campaignId);
  const band = stabilityBand(faction.stability, content);
  const revolts = listFactionRevolts(db, campaignId, faction.id);

  if (band < 2) {
    for (const row of revolts) standDown(db, campaignId, row);
    if (revolts.length) events.push({ type: "revolt_stand_down", factionId: faction.id });
    return events;
  }

  const living = [];
  for (const row of revolts) {
    const force = row.rebelForceId ? loadForce(db, campaignId, row.rebelForceId) : null;
    if (!force) {
      deletePlanetRevolt(db, campaignId, row.planetId);
      events.push({ type: "revolt_suppressed", factionId: faction.id, planetId: row.planetId });
      continue;
    }
    living.push({ row, force });
  }

  for (const { row, force } of living) {
    if (!shouldSecede(row, turn, content)) continue;
    const planet = planets.find((p) => p.id === row.planetId);
    if (!planet) continue;
    const plan = applySecession(
      db,
      campaignId,
      faction,
      planet,
      { ...force, factionId: row.rebelFactionId, spawnTurn: row.stage2SinceTurn },
      turn,
      content,
      systems,
    );
    events.push({ type: "secession", factionId: faction.id, planetId: planet.id, newFactionId: plan.newFaction.id });
  }

  const still = listFactionRevolts(db, campaignId, faction.id);
  if (still.length === 0) {
    const remaining = listFactionPlanets(db, campaignId, faction.id);
    const hot = pickHotspotPlanet(remaining);
    if (hot) {
      const spawned = spawnAndMaybeEngage(db, campaignId, faction, hot, turn, content, forces);
      events.push({
        type: spawned.engagement?.rebelDeleted ? "revolt_suppressed" : "rebel_spawn",
        factionId: faction.id,
        planetId: hot.id,
        rebelFactionId: spawned.rebelFactionId,
        forceId: spawned.force?.id,
        engagement: spawned.engagement?.outcome ?? null,
      });
    }
  }
  return events;
}

export function applyAllRevolts(db, campaignId, factions, turn, content) {
  const events = [];
  for (const f of factions) {
    events.push(...applyFactionRevolt(db, campaignId, f, turn, content));
  }
  return events;
}
