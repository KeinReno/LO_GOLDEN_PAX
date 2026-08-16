/**
 * 3-stage revolt: production debuff (stability.mjs) → rebel militia
 * occupation → secession into a real new faction.
 *
 * NOT a GMap port. GMap never built stability or revolt; `revolt_risk` is
 * an unconsumed channelKey. Internal-bloc `threat` is not read here
 * (COURT_AND_NPC_ROSTER_SPEC Part 6 stays display-only).
 *
 * Stage 2 composition reuses boarding.mjs's `syntheticCrewGroup`
 * (unit.militia stats verbatim, count from population). Population is not
 * spent — it becomes the breakaway faction's starting population at
 * Stage 3. Rebels get stance:"retreat" so resolveExchange's existing
 * <80% relative-power disengage rule applies unchanged.
 *
 * `resolveSecession` is a pure plan (CLAUDE.md rule 3: domain never sees
 * db). campaign/revoltTick.mjs applies it via addFaction/seedFactionAccounts
 * + planet/system ownership transfer — same building blocks as the GM
 * POST /factions route, not through that route.
 */
import { syntheticCrewGroup } from "../combat/boarding.mjs";
import { resolveExchange } from "../combat/resolveExchange.mjs";
import { stabilityBand, stabilityCfg } from "./stability.mjs";

const MILITIA_ID = "unit.militia";

export function revoltStage(faction, planet, content) {
  void planet;
  return stabilityBand(faction?.stability, content);
}

export function rebelCount(planet, stability, content) {
  const cfg = stabilityCfg(content);
  const pop = Math.max(0, Number(planet?.population) || 0);
  const deficit = Math.max(0, cfg.stage2Threshold - Number(stability));
  const raw = Math.floor(pop * cfg.rebelPopShare * (deficit / Math.max(1, cfg.stage2Threshold)));
  return Math.max(1, raw);
}

export function rebelFactionId(planetId, turn) {
  return `rebel.${planetId}.${turn}`;
}

export function rebelFactionName(planet) {
  const name = planet?.name || planet?.id || "unknown";
  return `Breakaway of ${name}`;
}

export function rebelColorHex(planetId) {
  let h = 0;
  for (const ch of String(planetId || "")) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  const n = Math.abs(h) || 1;
  const r = 96 + (n % 96);
  const g = 48 + ((n >> 5) % 80);
  const b = 48 + ((n >> 11) % 80);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function majorityRaceId(planet, fallback) {
  const comp = Array.isArray(planet?.raceComposition) ? planet.raceComposition : [];
  let best = null;
  let bestPct = -1;
  for (const row of comp) {
    const pct = Number(row?.percent ?? row?.count ?? 0);
    if (row?.raceId && pct > bestPct) {
      best = row.raceId;
      bestPct = pct;
    }
  }
  return best || fallback || "race_human";
}

/**
 * Militia-shaped rebel legion. Count from population × deficit; stats
 * from unit.militia via boarding's syntheticCrewGroup — not a parallel
 * construction.
 */
export function spawnRebelForce(planet, content, opts = {}) {
  const militia = content?.units?.[MILITIA_ID];
  const count = rebelCount(planet, opts.stability ?? 0, content);
  const group = syntheticCrewGroup(count, militia);
  const turn = opts.turn ?? 0;
  return {
    kind: "legion",
    name: `Rebels of ${planet?.name || planet?.id || "planet"}`,
    homePlanetId: planet?.id ?? null,
    systemId: planet?.systemId ?? null,
    composition: [group],
    factionId: opts.factionId || rebelFactionId(planet?.id, turn),
    count,
  };
}

/** Contingent fight: rebels retreat when outmatched (<80% power). */
export function resolveRebelEngagement(garrisonForce, rebelForce, content) {
  return resolveExchange(
    garrisonForce?.composition || [],
    rebelForce?.composition || [],
    {
      stanceA: "hold",
      stanceB: "retreat",
      factionIdA: garrisonForce?.factionId,
      factionIdB: rebelForce?.factionId,
    },
    content,
  );
}

export function shouldSecede(revolt, turn, content) {
  if (!revolt) return false;
  const cfg = stabilityCfg(content);
  return Number(turn) >= Number(revolt.stage2SinceTurn) + cfg.stage3DurationTurns;
}

/**
 * Pure secession plan. Caller persists via addFaction + seedFactionAccounts
 * + ownership transfer (campaign/revoltTick.mjs).
 */
export function resolveSecession(faction, planet, rebelForce, turn, content) {
  void content;
  const spawnTurn = rebelForce?.spawnTurn ?? turn;
  const id = rebelForce?.factionId || rebelFactionId(planet?.id, spawnTurn);
  return {
    newFaction: {
      id,
      name: rebelFactionName(planet),
      raceId: majorityRaceId(planet, faction?.raceId),
      colorHex: rebelColorHex(planet?.id),
      isNpc: true,
      playerId: null,
    },
    planetId: planet?.id,
    systemId: planet?.systemId,
    sourceFactionId: faction?.id,
    rebelForceId: rebelForce?.id ?? null,
    population: Number(planet?.population) || 0,
  };
}

export function pickHotspotPlanet(planets) {
  const owned = (planets || []).filter((p) => Number(p.population) > 0);
  if (!owned.length) return null;
  return owned.reduce((best, p) => (Number(p.population) > Number(best.population) ? p : best));
}

export function ownerLegionAtPlanet(forces, factionId, planet) {
  const systemId = planet?.systemId;
  const planetId = planet?.id;
  const candidates = (forces || []).filter(
    (f) => f.factionId === factionId && f.kind === "legion" && (f.systemId === systemId || f.homePlanetId === planetId),
  );
  if (!candidates.length) return null;
  const size = (f) => (f.composition || []).reduce((s, g) => s + (Number(g.count) || 0), 0);
  return candidates.reduce((best, f) => (size(f) > size(best) ? f : best));
}
