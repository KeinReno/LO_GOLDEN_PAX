/**
 * Faction-wide stability accumulator + Stage-1 production debuff.
 *
 * NOT a GMap port. GMap's `stability` / `stability_add` / `revolt_risk`
 * appear only in modifierStack.mjs (channel categorizer) and ledger.mjs
 * (display labels). Nothing there accumulated a value or triggered a
 * revolt. Loyalty is equally unbuilt — this accumulator is independent
 * of it on purpose (STABILITY_AND_REVOLT_SPEC).
 *
 * Consumes the `stability` channel's flat total from `buildModifierStack`
 * (court seats/postings/traits produce `stability_add`; this is the
 * consumer COURT_AND_NPC_ROSTER_SPEC Part 4 left unwired). Internal-bloc
 * `threat` is not read here.
 *
 * First-pass numerics: content.economy_balance.stability (see that
 * block's `note`). Fallbacks below match that file.
 */
import { buildModifierStack } from "../economy/modifierStack.mjs";

export const STABILITY_START = 50;
export const STABILITY_MIN = 0;
export const STABILITY_MAX = 100;
export const STABILITY_NATURAL_DECAY = -1;
export const STABILITY_STAGE1_THRESHOLD = 40;
export const STABILITY_STAGE2_THRESHOLD = 25;
export const STABILITY_STAGE3_DURATION_TURNS = 3;
export const STABILITY_STAGE1_PROD_MULT = 0.85;
export const STABILITY_STAGE2_PROD_MULT = 0.75;
export const STABILITY_REBEL_POP_SHARE = 0.2;

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function stabilityCfg(content) {
  const c = content?.economy_balance?.stability || {};
  return {
    startingValue: num(c.startingValue, STABILITY_START),
    min: num(c.min, STABILITY_MIN),
    max: num(c.max, STABILITY_MAX),
    naturalDecay: num(c.naturalDecay, STABILITY_NATURAL_DECAY),
    stage1Threshold: num(c.stage1Threshold, STABILITY_STAGE1_THRESHOLD),
    stage2Threshold: num(c.stage2Threshold, STABILITY_STAGE2_THRESHOLD),
    stage3DurationTurns: num(c.stage3DurationTurns, STABILITY_STAGE3_DURATION_TURNS),
    stage1ProductionMult: num(c.stage1ProductionMult, STABILITY_STAGE1_PROD_MULT),
    stage2ProductionMult: num(c.stage2ProductionMult, STABILITY_STAGE2_PROD_MULT),
    rebelPopShare: num(c.rebelPopShare, STABILITY_REBEL_POP_SHARE),
  };
}

export function clampStability(value, content) {
  const cfg = stabilityCfg(content);
  const n = Number(value);
  const v = Number.isFinite(n) ? n : cfg.startingValue;
  return Math.min(cfg.max, Math.max(cfg.min, v));
}

/**
 * Per-turn delta: naturalDecay + `stability` channel flat (stability_add
 * stack). `faction` is unused beyond matching the spec signature — the
 * accumulator is faction-wide and the stack is already scoped.
 */
export function computeStabilityDelta(faction, courtEffects, content) {
  void faction;
  const cfg = stabilityCfg(content);
  const stack = buildModifierStack(courtEffects || []);
  const flat = Number(stack.channels?.stability?.flat || 0);
  return cfg.naturalDecay + (Number.isFinite(flat) ? flat : 0);
}

/**
 * Apply one turn of accumulation. `turn` is the tick this delta belongs
 * to (unused in the formula; kept for the spec signature / callers).
 * @returns {{ value: number, delta: number }}
 */
export function tickStability(faction, turn, courtEffects, content) {
  void turn;
  const cfg = stabilityCfg(content);
  const current = clampStability(faction?.stability ?? cfg.startingValue, content);
  const delta = computeStabilityDelta(faction, courtEffects, content);
  return { value: clampStability(current + delta, content), delta };
}

/** 0 = stable, 1 = production debuff, 2 = rebel-force band. Stage 3 is duration, not a band. */
export function stabilityBand(value, content) {
  const cfg = stabilityCfg(content);
  const v = Number(value);
  if (v < cfg.stage2Threshold) return 2;
  if (v < cfg.stage1Threshold) return 1;
  return 0;
}

/** Pass-4 production:* multiplier for the current band. Stage 2 replaces Stage 1. */
export function revoltProductionEffects(value, content) {
  const cfg = stabilityCfg(content);
  const band = stabilityBand(value, content);
  if (band <= 0) return [];
  const mult = band >= 2 ? cfg.stage2ProductionMult : cfg.stage1ProductionMult;
  return [
    {
      effect: "production_mult",
      args: { mult },
      source: { kind: "revolt", id: `stability.stage${band}`, label: `stability stage ${band}` },
      scope: "faction",
    },
  ];
}
