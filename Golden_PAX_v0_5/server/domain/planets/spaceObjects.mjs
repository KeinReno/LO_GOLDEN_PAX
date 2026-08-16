/**
 * Space objects: economy + combat effects, with usage-based depletion.
 *
 * Economic-effect application (`applySpaceObjectEffects`) is a byte-parity
 * port of GMap/server/flowEngine.mjs's exported function — same
 * capacity_add / rate_mod / demand_mod shape, see spaceObjects.parity.test.mjs.
 *
 * Everything else is NOT a port — new design from
 * notes/2026-08-13-galaxy-migration-grill.md (Q4/4a/4b/4c/4d):
 *   - Control follows system.ownerFactionId 1:1. No presence/claim mechanic.
 *     Unowned systems grant no effects (Q4a).
 *   - Combat modifiers are new (Q4b). Loyalty/diplomacy effect types are
 *     reserved in content but not implemented.
 *   - Depletion is designed from scratch (Q4d). Planet deposits
 *     (`flowContribution.mjs` addExtraction) currently never deplete —
 *     they stay infinite and untouched. Do not treat this as reuse.
 */

export function spaceObjectDef(content, typeId) {
  return content?.space_objects?.objects?.[typeId] || null;
}

/**
 * Ported from GMap/server/flowEngine.mjs `applySpaceObjectEffects`
 * (exported+pure there). Mutates `flows`. unlock_property / flow_convert
 * on object defs are ignored here, same as GMap's function.
 */
export function applySpaceObjectEffects(flows, objDef, opts = {}) {
  const scale = Number(opts.rateScale ?? 1);
  for (const e of objDef.effects || []) {
    const cc = e.args?.category;
    const tt = Number(e.args?.tier);
    const amt = Number(e.args?.amount) || 0;
    if (!cc || !tt) continue;
    if (!flows[cc] || !flows[cc][tt]) continue;
    if (e.effect === "capacity_add") {
      flows[cc][tt].capacity += amt;
    } else if (e.effect === "rate_mod") {
      flows[cc][tt].rate += amt * scale;
    } else if (e.effect === "demand_mod") {
      flows[cc][tt].demand += amt * scale;
    }
  }
}

function remainingOf(instance, def) {
  if (instance.remainingAmount != null) return Number(instance.remainingAmount);
  if (def?.startingRemaining != null) return Number(def.startingRemaining);
  return 0;
}

function isExhausted(instance, def) {
  if (!def?.depletes) return false;
  return remainingOf(instance, def) <= 0;
}

/**
 * Positive rate_mod amounts this object would add to the flow grid at
 * rateScale 1 — the depletion debit, using the same units added to the grid.
 */
export function spaceObjectDrawnAmount(def, opts = {}) {
  const scale = Number(opts.rateScale ?? 1);
  let n = 0;
  for (const e of def?.effects || []) {
    if (e.effect !== "rate_mod") continue;
    n += Math.max(0, Number(e.args?.amount) || 0) * scale;
  }
  return n;
}

export function instantiateSpaceObject(typeId, content, opts = {}) {
  const def = spaceObjectDef(content, typeId);
  if (!def) return { ok: false, error: `unknown_space_object:${typeId}` };
  const remainingAmount = def.depletes
    ? (opts.remainingAmount != null ? Number(opts.remainingAmount) : Number(def.startingRemaining ?? 80))
    : null;
  return {
    ok: true,
    instance: {
      id: opts.id,
      typeId,
      remainingAmount,
    },
  };
}

/**
 * Pass-1 feeder: apply owned-system object effects into the shared flows
 * grid. Must run with extraction + ambient baselines, before converters
 * (same GMap economyTick per-system loop order). No-op when the system
 * has no owner or the owner isn't `factionId`.
 */
export function addSystemSpaceObjectEffects(flows, system, factionId, content, opts = {}) {
  if (!system?.ownerFactionId || system.ownerFactionId !== factionId) return;
  const rateScale = Number(opts.rateScale ?? 1);
  for (const inst of system.spaceObjects || []) {
    const def = spaceObjectDef(content, inst.typeId);
    if (!def || isExhausted(inst, def)) continue;
    applySpaceObjectEffects(flows, def, { rateScale });
  }
}

/**
 * Product of this system's combat modifiers for `factionId`.
 * Owner vs challenger (anyone fighting here who is not the owner).
 * Unowned systems return 1 (no effect — Q4a).
 */
export function spaceObjectCombatModifier(system, content, factionId) {
  if (!system?.ownerFactionId) return 1;
  const isOwner = system.ownerFactionId === factionId;
  let mult = 1;
  for (const inst of system.spaceObjects || []) {
    const def = spaceObjectDef(content, inst.typeId);
    if (!def?.combat || isExhausted(inst, def)) continue;
    const c = def.combat;
    if (c.bothPowerMult != null) mult *= Number(c.bothPowerMult);
    if (isOwner && c.ownerPowerMult != null) mult *= Number(c.ownerPowerMult);
    if (!isOwner && c.challengerPowerMult != null) mult *= Number(c.challengerPowerMult);
  }
  return mult;
}

/**
 * Subtract `amountExtracted` from a depleting instance. Non-depleting
 * types are unchanged. Hits zero → `removed: true` (caller drops it).
 */
export function depleteSpaceObject(instance, amountExtracted, def) {
  if (!def?.depletes) return { instance, removed: false };
  const next = Math.max(0, remainingOf(instance, def) - Math.max(0, Number(amountExtracted) || 0));
  const updated = { ...instance, remainingAmount: next };
  return { instance: updated, removed: next <= 0 };
}

/**
 * After a turn's extraction: debit every depleting object in an *owned*
 * system by the rate it actually added to the flow grid. Unowned systems
 * are left alone (they produced nothing). Returns `{ spaceObjects, removed, changed }`.
 */
export function depleteSystemSpaceObjects(system, content) {
  const objects = system.spaceObjects || [];
  if (!system.ownerFactionId) {
    return { spaceObjects: objects, removed: [], changed: false };
  }
  const kept = [];
  const removed = [];
  for (const inst of objects) {
    const def = spaceObjectDef(content, inst.typeId);
    if (!def?.depletes) {
      kept.push(inst);
      continue;
    }
    const drawn = spaceObjectDrawnAmount(def);
    const result = depleteSpaceObject(inst, drawn, def);
    if (result.removed) removed.push(result.instance);
    else kept.push(result.instance);
  }
  const changed = removed.length > 0 || kept.some((o, i) => o !== objects[i] && o.remainingAmount !== objects[i]?.remainingAmount);
  return { spaceObjects: kept, removed, changed };
}
