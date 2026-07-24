/**
 * Per-faction fog masks (P3).
 * systems listed in mask[factionId] are hidden unless reveal applies.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, ensureDataDir, readJson, writeJson } from "./tableStore.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FOG_PATH = path.join(DATA_DIR, "fog-masks.json");

/**
 * @typedef {{
 *   masks: Record<string, string[]>,
 *   permanentReveal: Record<string, string[]>,
 * }} FogState
 */

export function defaultFogState() {
  return { masks: {}, permanentReveal: {} };
}

export function readFog() {
  const raw = readJson(FOG_PATH, null);
  if (!raw || typeof raw !== "object") return defaultFogState();
  return {
    masks: raw.masks && typeof raw.masks === "object" ? raw.masks : {},
    permanentReveal:
      raw.permanentReveal && typeof raw.permanentReveal === "object"
        ? raw.permanentReveal
        : {},
  };
}

export function writeFog(state) {
  ensureDataDir();
  writeJson(FOG_PATH, state);
}

export function paintFog(factionId, systemIds, mode = "paint") {
  const fog = readFog();
  const set = new Set(fog.masks[factionId] ?? []);
  for (const id of systemIds) {
    if (!id) continue;
    if (mode === "erase") set.delete(id);
    else set.add(id);
  }
  fog.masks[factionId] = [...set];
  writeFog(fog);
  return fog;
}

export function addPermanentReveal(factionId, systemId) {
  const fog = readFog();
  const list = new Set(fog.permanentReveal[systemId] ?? []);
  list.add(factionId);
  fog.permanentReveal[systemId] = [...list];
  // Opening permanently also clears mask bit
  if (fog.masks[factionId]) {
    fog.masks[factionId] = fog.masks[factionId].filter((id) => id !== systemId);
  }
  writeFog(fog);
  return fog;
}

/**
 * Resolve visible system ids with fog mask + legacy rules + reveals.
 */
export function resolveVisibleWithFog(world, factionId, fogState) {
  const faction = (world.factions ?? []).find((f) => f.id === factionId);
  if (
    faction?.fullMapVision === true ||
    factionId === "faction_belator"
  ) {
    return new Set((world.systems ?? []).map((s) => s.id));
  }

  const mask = new Set(fogState?.masks?.[factionId] ?? []);
  const visible = new Set();

  // Legacy base visibility
  for (const s of world.systems ?? []) {
    if (s.ownerFactionId === factionId) visible.add(s.id);
    if ((s.visibleToFactionIds ?? []).includes(factionId)) visible.add(s.id);
  }
  for (const f of world.fleets ?? []) {
    if (f.factionId === factionId) visible.add(f.systemId);
  }
  for (const l of world.legions ?? []) {
    if (l.factionId === factionId) visible.add(l.systemId);
  }

  // Permanent reveal
  for (const [sysId, facs] of Object.entries(fogState?.permanentReveal ?? {})) {
    if ((facs ?? []).includes(factionId)) visible.add(sysId);
  }

  // Mask hides unless currently revealed by presence/ownership/permanent
  if (mask.size > 0) {
    for (const id of mask) {
      const sys = (world.systems ?? []).find((s) => s.id === id);
      const owned = sys?.ownerFactionId === factionId;
      const fleetHere = (world.fleets ?? []).some(
        (f) => f.factionId === factionId && f.systemId === id,
      );
      const legionHere = (world.legions ?? []).some(
        (l) => l.factionId === factionId && l.systemId === id,
      );
      const perm = (fogState?.permanentReveal?.[id] ?? []).includes(factionId);
      if (!(owned || fleetHere || legionHere || perm)) {
        visible.delete(id);
      }
    }
  }

  return visible;
}
