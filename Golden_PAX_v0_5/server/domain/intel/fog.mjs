/**
 * Hop-1 fog of war. Ports GMap/server/fogStore.mjs `expandVisionHops` +
 * the ownership/presence seed of `resolveVisibleWithFog` only — not intel
 * 0–4, JSON masks, permanentReveal, espionage, or fullMapVision.
 *
 * Neighbors come from domain/systems/pathfinding.mjs (same undirected
 * hyperlane walk GMap used).
 */
import { neighborIds } from "../systems/pathfinding.mjs";

export const VISION_HOPS = 1;

function listedForces(world) {
  if (Array.isArray(world?.forces)) return world.forces;
  return [...(world?.fleets ?? []), ...(world?.legions ?? [])];
}

/**
 * BFS from startIds; returns ids at distance 1..maxHops (not the seeds).
 * Byte-shaped port of GMap fogStore.expandVisionHops.
 */
export function expandVisionHops(world, startIds, maxHops) {
  const added = new Set();
  if (maxHops <= 0) return added;
  const dist = new Map();
  const q = [];
  for (const id of startIds) {
    if (!id) continue;
    dist.set(id, 0);
    q.push(id);
  }
  while (q.length) {
    const id = q.shift();
    const d = dist.get(id) ?? 0;
    if (d >= maxHops) continue;
    for (const n of neighborIds(world, id)) {
      if (dist.has(n)) continue;
      dist.set(n, d + 1);
      added.add(n);
      q.push(n);
    }
  }
  return added;
}

/** Systems the faction owns or has a fleet/legion in (hop-0 seeds). */
export function visionHop0Seeds(world, factionId) {
  const seeds = new Set();
  for (const s of world?.systems ?? []) {
    if (s.ownerFactionId === factionId) seeds.add(s.id);
  }
  for (const f of listedForces(world)) {
    if (f.factionId === factionId && f.systemId) seeds.add(f.systemId);
  }
  return seeds;
}

/**
 * Visible system ids = hop-0 seeds ∪ 1-hop neighbors.
 * @returns {Set<string>}
 */
export function resolveVisibleWithFog(world, factionId) {
  const hop0 = visionHop0Seeds(world, factionId);
  const visible = new Set(hop0);
  for (const id of expandVisionHops(world, hop0, VISION_HOPS)) visible.add(id);
  return visible;
}

/**
 * Knowledge split for the viewer payload.
 * hop0: owned or own force present (knowledge 0).
 * hop1: 1 hop from seeds, excluding hop0 (knowledge 1).
 */
export function resolveFogKnowledge(world, factionId) {
  const hop0 = visionHop0Seeds(world, factionId);
  const hop1 = expandVisionHops(world, hop0, VISION_HOPS);
  for (const id of hop0) hop1.delete(id);
  const visible = new Set(hop0);
  for (const id of hop1) visible.add(id);
  return { hop0, hop1, visible };
}
