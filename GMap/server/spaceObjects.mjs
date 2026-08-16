/**
 * P4b — space-object combat modifiers + usage-based field depletion.
 *
 * Economy application stays in flowEngine.applySpaceObjectEffects
 * (called from economyTick). This module does not redo that path.
 *
 * Depletion is designed from scratch for space objects only.
 * Planet deposits (planet.resources / addPlanetExtraction) stay infinite.
 *
 * GMap systems keep `spaceObjects: string[]` tags. Remaining amounts live
 * on `system.spaceObjectRemaining[typeId]` (JSON world — no extra table).
 */

export function spaceObjectDef(content, typeId) {
  return content?.space_objects?.objects?.[typeId] || null;
}

export function spaceObjectTypeId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.typeId || entry?.id || null;
}

function remainingOf(system, typeId, def, entry) {
  if (entry && typeof entry === "object" && entry.remainingAmount != null) {
    return Number(entry.remainingAmount);
  }
  const map = system?.spaceObjectRemaining;
  if (map && map[typeId] != null) return Number(map[typeId]);
  if (def?.startingRemaining != null) return Number(def.startingRemaining);
  return 0;
}

export function isSpaceObjectExhausted(system, typeId, def, entry) {
  if (!def?.depletes) return false;
  const map = system?.spaceObjectRemaining;
  if (entry && typeof entry === "object" && entry.remainingAmount != null) {
    return Number(entry.remainingAmount) <= 0;
  }
  if (map && Object.prototype.hasOwnProperty.call(map, typeId)) {
    return Number(map[typeId]) <= 0;
  }
  return false;
}

/** Sum of positive rate_mod amounts (same units added to the flow grid). */
export function spaceObjectDrawnAmount(def, opts = {}) {
  const scale = Number(opts.rateScale ?? 1);
  let n = 0;
  for (const e of def?.effects || []) {
    if (e.effect !== "rate_mod") continue;
    n += Math.max(0, Number(e.args?.amount) || 0) * scale;
  }
  return n;
}

/**
 * Product of this system's combat modifiers for `factionId`.
 * Owner vs challenger. Unowned systems return 1.
 */
export function spaceObjectCombatModifier(system, content, factionId) {
  if (!system?.ownerFactionId) return 1;
  const isOwner = system.ownerFactionId === factionId;
  let mult = 1;
  for (const entry of system.spaceObjects || []) {
    const typeId = spaceObjectTypeId(entry);
    const def = spaceObjectDef(content, typeId);
    if (!def?.combat || isSpaceObjectExhausted(system, typeId, def, entry)) {
      continue;
    }
    const c = def.combat;
    if (c.bothPowerMult != null) mult *= Number(c.bothPowerMult);
    if (isOwner && c.ownerPowerMult != null) mult *= Number(c.ownerPowerMult);
    if (!isOwner && c.challengerPowerMult != null) {
      mult *= Number(c.challengerPowerMult);
    }
  }
  return mult;
}

/**
 * Subtract `amountExtracted` from a depleting type. Non-depleting: no-op.
 * Hits zero → `removed: true` (caller drops the tag).
 */
export function depleteSpaceObject(system, typeId, amountExtracted, def, entry) {
  if (!def?.depletes) {
    return { remaining: remainingOf(system, typeId, def, entry), removed: false };
  }
  const cur = remainingOf(system, typeId, def, entry);
  const next = Math.max(0, cur - Math.max(0, Number(amountExtracted) || 0));
  return { remaining: next, removed: next <= 0 };
}

/**
 * After a turn's extraction: debit every depleting object in an *owned*
 * system by the rate it added to the flow grid. Unowned systems unchanged.
 */
export function depleteSystemSpaceObjects(system, content) {
  const objects = system.spaceObjects || [];
  if (!system.ownerFactionId) {
    return {
      spaceObjects: objects,
      remaining: { ...(system.spaceObjectRemaining || {}) },
      removed: [],
      changed: false,
    };
  }
  const remaining = { ...(system.spaceObjectRemaining || {}) };
  const kept = [];
  const removed = [];
  let changed = false;
  for (const entry of objects) {
    const typeId = spaceObjectTypeId(entry);
    const def = spaceObjectDef(content, typeId);
    if (!def?.depletes) {
      kept.push(entry);
      continue;
    }
    const drawn = spaceObjectDrawnAmount(def);
    const result = depleteSpaceObject(system, typeId, drawn, def, entry);
    changed = true;
    if (result.removed) {
      removed.push(typeId);
      delete remaining[typeId];
    } else {
      remaining[typeId] = result.remaining;
      kept.push(entry);
    }
  }
  return { spaceObjects: kept, remaining, removed, changed };
}

/**
 * Mutate world systems in place. Planet deposits are not touched.
 */
export function depleteWorldSpaceObjects(world, content) {
  let changed = false;
  for (const sys of world?.systems || []) {
    const next = depleteSystemSpaceObjects(sys, content);
    if (!next.changed) continue;
    sys.spaceObjects = next.spaceObjects;
    sys.spaceObjectRemaining = next.remaining;
    changed = true;
  }
  return changed;
}
