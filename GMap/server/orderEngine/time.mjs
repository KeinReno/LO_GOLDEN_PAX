/**
 * B4 — order/ETA time math: game-hour conversion, build/move duration,
 * modifier stacking. Extracted from ../orderEngine.mjs.
 */
import { hopPath } from "../pathfinding.mjs";

export const HOURS_PER_TURN = 24;

/** Intent → order category (content override or legacy instant flag). */
export function intentCategory(def) {
  if (def?.category === "instant" || def?.category === "pending" || def?.category === "eta") {
    return def.category;
  }
  if (def?.instant) return "instant";
  return "eta";
}

export function gameHourAtTurn(turn) {
  return Math.max(0, Math.floor(Number(turn) || 0)) * HOURS_PER_TURN;
}

export function turnsUntil(resolvesAt, currentTurn) {
  const now = gameHourAtTurn(currentTurn);
  const remaining = Math.max(0, (Number(resolvesAt) || 0) - now);
  return Math.ceil(remaining / HOURS_PER_TURN);
}

export function hoursRemaining(resolvesAt, currentTurn) {
  const now = gameHourAtTurn(currentTurn);
  return Math.max(0, Math.round((Number(resolvesAt) || 0) - now));
}

export function buildHoursFromTier(tier) {
  const t = Math.max(1, Math.min(10, Math.floor(Number(tier) || 1)));
  if (t <= 1) return 6;
  if (t <= 3) return 24;
  if (t <= 6) return 72;
  return 240;
}

export function resolveBuildHours(content, buildingId) {
  const def = content?.buildings?.[buildingId];
  if (!def) return 24;
  if (def.buildHours != null) return Math.max(1, Number(def.buildHours) || 24);
  return buildHoursFromTier(def.tier ?? 1);
}

export function systemDistance(world, fromId, toId) {
  const a = (world.systems ?? []).find((s) => s.id === fromId);
  const b = (world.systems ?? []).find((s) => s.id === toId);
  if (!a || !b) return 0;
  if (fromId === toId) return 0;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dy = (Number(a.y) || 0) - (Number(b.y) || 0);
  return Math.sqrt(dx * dx + dy * dy);
}

export function resolveFleetSpeed(world, fleetId, content) {
  const fleet = (world.fleets ?? []).find((f) => f.id === fleetId);
  const fallback = Number(content?.rules?.movement?.defaultFleetSpeed ?? 10);
  if (!fleet) return fallback;
  const ships = content?.ships ?? {};
  let total = 0;
  let count = 0;
  for (const g of fleet.composition ?? []) {
    const sid = g.shipId || g.defId || g.id || g.templateId;
    const def = sid ? ships[sid] : null;
    const speed =
      Number(def?.stats?.speed ?? def?.speed ?? g.speed ?? 5) || 5;
    const n = Math.max(1, Number(g.count) || 1);
    total += speed * n;
    count += n;
  }
  return count > 0 ? Math.max(1, total / count) : fallback;
}

export function resolveLegionSpeed(content) {
  return Number(content?.rules?.movement?.legionSpeed ?? 4);
}

export function applyDurationModifiers(baseHours, modifiers = []) {
  let hours = baseHours;
  for (const m of modifiers) {
    if (m.mult != null) hours *= Number(m.mult) || 1;
    if (m.flat != null) hours += Number(m.flat) || 0;
  }
  return Math.max(1, Math.round(hours));
}

export function computeFleetMoveEta(world, content, fromId, toId, fleetId, modifiers = []) {
  const dist = systemDistance(world, fromId, toId);
  const speed = resolveFleetSpeed(world, fleetId, content);
  const path = hopPath(world, fromId, toId, "fleet");
  const hopMult = path.length > 1 ? path.length - 1 : 1;
  const base = Math.max(1, (dist * hopMult) / speed);
  const baseDuration = Math.round(base);
  const totalHours = applyDurationModifiers(baseDuration, modifiers);
  return { baseDuration, totalHours, modifiers: [...modifiers] };
}

export function computeLegionMoveEta(world, content, fromId, toId, modifiers = []) {
  const dist = systemDistance(world, fromId, toId);
  const speed = resolveLegionSpeed(content);
  const path = hopPath(world, fromId, toId, "legion");
  const hopMult = path.length > 1 ? path.length - 1 : 1;
  const baseDuration = Math.max(1, Math.round((dist * hopMult) / speed));
  const totalHours = applyDurationModifiers(baseDuration, modifiers);
  return { baseDuration, totalHours, modifiers: [...modifiers] };
}

export function shouldCreateEtaOrder(def) {
  return intentCategory(def) === "eta";
}
