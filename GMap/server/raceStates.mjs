/**
 * Race State — campaign-dynamic modifiers (RP / deficit / events).
 * Lives in data/race_states.json, not content packs.
 * Local DATA_DIR (not from tableStore) avoids TDZ on circular import via
 * tableStore → normalizeWorld → orderEngine → … → raceStates.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJson, writeJson, ensureDataDir } from "./tableStore.mjs";
import { resolveRace } from "./raceRegistry.mjs";

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data",
);
export const RACE_STATES_PATH = path.join(DATA_DIR, "race_states.json");

/**
 * @typedef {{
 *   id: string,
 *   source?: string,
 *   turn_applied?: number,
 *   effects?: Array<{ effect: string, args?: Record<string, unknown> }>,
 *   expires?: number | null,
 *   permanent?: boolean,
 * }} RaceStateModifier
 *
 * @typedef {{
 *   factionId?: string | null,
 *   modifiers?: RaceStateModifier[],
 * }} RaceStateEntry
 */

/** @returns {Record<string, RaceStateEntry>} */
export function readRaceStates() {
  ensureDataDir();
  const raw = readJson(RACE_STATES_PATH, { races: {} });
  if (raw?.races && typeof raw.races === "object") return raw.races;
  // Flat legacy: top-level race ids
  if (raw && typeof raw === "object" && !raw.races) {
    const { version, updatedAt, ...rest } = raw;
    if (Object.keys(rest).some((k) => k.startsWith("race_"))) return rest;
  }
  return {};
}

/** @param {Record<string, RaceStateEntry>} races */
export function writeRaceStates(races) {
  ensureDataDir();
  writeJson(RACE_STATES_PATH, {
    version: 1,
    updatedAt: new Date().toISOString(),
    races,
  });
}

/**
 * Drop expired modifiers. Call each turn.
 * @param {number} turn
 * @returns {{ expired: string[], races: Record<string, RaceStateEntry> }}
 */
export function expireRaceStateModifiers(turn) {
  const races = readRaceStates();
  const expired = [];
  for (const [raceId, entry] of Object.entries(races)) {
    if (!entry?.modifiers?.length) continue;
    const kept = [];
    for (const mod of entry.modifiers) {
      if (mod.permanent) {
        kept.push(mod);
        continue;
      }
      if (mod.expires == null) {
        // Spec: must have expires OR permanent — treat null as permanent for safety
        kept.push({ ...mod, permanent: true });
        continue;
      }
      if (Number(mod.expires) < Number(turn)) {
        expired.push(`${raceId}:${mod.id}`);
        continue;
      }
      kept.push(mod);
    }
    entry.modifiers = kept;
  }
  if (expired.length) writeRaceStates(races);
  return { expired, races };
}

/**
 * Collect active state modifier effects for a race (optionally scoped to faction).
 * @param {string} raceId
 * @param {{ factionId?: string, turn?: number, states?: Record<string, RaceStateEntry> }} [opts]
 */
export function collectRaceStateEffects(raceId, opts = {}) {
  const states = opts.states || readRaceStates();
  const entry = states[raceId];
  if (!entry?.modifiers?.length) return [];
  const out = [];
  for (const mod of entry.modifiers) {
    if (
      entry.factionId &&
      opts.factionId &&
      entry.factionId !== opts.factionId
    ) {
      continue;
    }
    if (
      !mod.permanent &&
      mod.expires != null &&
      opts.turn != null &&
      Number(mod.expires) < Number(opts.turn)
    ) {
      continue;
    }
    for (const eff of mod.effects || []) {
      out.push({
        ...eff,
        source: {
          kind: "race_state",
          id: mod.id,
          label: mod.source || mod.id,
        },
      });
    }
  }
  return out;
}

/**
 * Effects from resolved race traits + active state modifiers, weighted by composition.
 * Drop-in enhancement over collectRaceEffects for callers that have turn/faction.
 *
 * @param {object} racesContent
 * @param {{ raceId: string, percent: number }[]} composition
 * @param {{
 *   factionId?: string,
 *   turn?: number,
 *   states?: Record<string, RaceStateEntry>,
 *   scaleArgs?: (effect: string, args: object, w: number) => object,
 * }} [opts]
 */
export function collectResolvedRaceEffects(
  racesContent,
  composition,
  opts = {},
) {
  const out = [];
  for (const share of composition || []) {
    const resolved = resolveRace(share.raceId, racesContent);
    if (!resolved) continue;
    const w = (share.percent ?? 0) / 100;
    if (w <= 0) continue;
    for (const trait of resolved.traits || []) {
      for (const eff of trait.effects || []) {
        const args = opts.scaleArgs
          ? opts.scaleArgs(eff.effect, eff.args || {}, w)
          : { ...eff.args };
        out.push({
          ...eff,
          args,
          source: {
            kind: "race",
            id: `${resolved.id}:${trait.id}`,
            label: resolved.name,
          },
        });
      }
    }
    for (const eff of collectRaceStateEffects(share.raceId, opts)) {
      const args = opts.scaleArgs
        ? opts.scaleArgs(eff.effect, eff.args || {}, w)
        : { ...eff.args };
      out.push({ ...eff, args });
    }
  }
  return out;
}

/**
 * Apply a modifier (RP / engine). Validates expires|permanent.
 * @param {string} raceId
 * @param {RaceStateModifier} modifier
 * @param {{ factionId?: string }} [opts]
 */
export function applyRaceStateModifier(raceId, modifier, opts = {}) {
  if (!modifier?.id) throw new Error("race state modifier requires id");
  if (!modifier.permanent && modifier.expires == null) {
    throw new Error(
      `modifier ${modifier.id}: must set expires or permanent: true`,
    );
  }
  const races = readRaceStates();
  if (!races[raceId]) {
    races[raceId] = {
      factionId: opts.factionId ?? null,
      modifiers: [],
    };
  }
  if (opts.factionId != null) races[raceId].factionId = opts.factionId;
  const mods = races[raceId].modifiers || [];
  const idx = mods.findIndex((m) => m.id === modifier.id);
  if (idx >= 0) mods[idx] = modifier;
  else mods.push(modifier);
  races[raceId].modifiers = mods;
  writeRaceStates(races);
  return races[raceId];
}
