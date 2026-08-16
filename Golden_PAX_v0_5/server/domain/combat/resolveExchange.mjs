import { rolePower, totalPower, applyStatChannelsToGroups } from "./roleMatchups.mjs";
import { adaptGroupsForRolePower } from "./groundStats.mjs";
import { meanPropertyMultVsSample } from "./propertyMatchup.mjs";
import { stanceMult } from "./stance.mjs";
import { applyCasualties, removeDestroyedGroups } from "./casualties.mjs";
import { awardVeterancyXp } from "./veterancy.mjs";
import { buildModifierStack } from "../economy/modifierStack.mjs";
import { collectTechModifierEffects } from "../tech/techModifierEffects.mjs";
import { logisticsCombatDefMult } from "../systems/logistics.mjs";

/**
 * Resolve one exchange of fire between two sides' unit-stack groups.
 * This is GMap's real combat math (see roleMatchups.mjs/propertyMatchup.mjs/
 * casualties.mjs for the individually parity-tested pieces this composes,
 * and GMap/server/combatResolve.mjs's resolveEngagementFight for the
 * original) — with the parts that need the unported world/planet model
 * removed, same scoping as domain/economy and domain/tech:
 *
 * - no stationary defense units (gatherDefenseUnits needs planet buildings)
 * - no power-path mind-strike multiplier (collectPowerMindStrikeMult)
 * - no loyalty-driven garrison defection (needs system/planet loyalty)
 * - single exchange only — no theater/assault-phase state machine
 *   (bombard → landing → ground → occupation), no engagement persistence
 *
 * What's real: role-matchup power, property multipliers, stance effects,
 * the retreat check, casualty absorption, veterancy XP, and the win/draw
 * outcome thresholds (58%/42% power share, or total wipeout).
 *
 * Callers MUST drop destroyed stacks between engagements (filter to
 * `(g.count || 0) > 0`, or call casualties.mjs's removeDestroyedGroups on
 * the previous call's returned groups) rather than re-passing a zero-count
 * entry — see removeDestroyedGroups's header for why a defeated-but-still-
 * present side breaks the power calculation for the *other* side too, not
 * just its own. This function itself always returns pruned groups.
 *
 * @param {object[]} groupsA
 * @param {object[]} groupsB
 * @param {{ stanceA?: string, stanceB?: string, factionIdA?: string, factionIdB?: string, powerMultA?: number, powerMultB?: number, techAccountA?: object, techAccountB?: object, courtEffectsA?: object[], courtEffectsB?: object[], forceIdA?: string, forceIdB?: string, system?: object }} opts
 * @param {object} content  loaded via server/contentLoader.mjs
 */
export function resolveExchange(groupsA, groupsB, opts, content) {
  if (groupsA.length === 0 && groupsB.length === 0) {
    return { ok: false, error: "no forces" };
  }
  // One side already has nothing to fight — a clean win, not a 0-power exchange.
  if (groupsA.length === 0) {
    return { ok: true, outcome: "win_b", powerA: 0, powerB: 1, lossesA: [], lossesB: [], groupsA: [], groupsB };
  }
  if (groupsB.length === 0) {
    return { ok: true, outcome: "win_a", powerA: 1, powerB: 0, lossesA: [], lossesB: [], groupsA, groupsB: [] };
  }

  const matchups = content.combat_matchups || {};
  const stanceA = opts?.stanceA || "hold";
  const stanceB = opts?.stanceB || "hold";
  const stA = stanceMult(content, stanceA);
  const stB = stanceMult(content, stanceB);

  const channelsA = combatModifierChannels(opts, "A", content);
  const channelsB = combatModifierChannels(opts, "B", content);
  const scaledA = applyStatChannelsToGroups(adaptGroupsForRolePower(groupsA), channelsA);
  const scaledB = applyStatChannelsToGroups(adaptGroupsForRolePower(groupsB), channelsB);
  const rolesA = rolePower(scaledA);
  const rolesB = rolePower(scaledB);
  let powerA = totalPower(rolesA, matchups, rolesB, channelsA) * (stA.powerMult ?? 1);
  let powerB = totalPower(rolesB, matchups, rolesA, channelsB) * (stB.powerMult ?? 1);

  powerA *= meanPropertyMultVsSample(scaledA, scaledB[0], content);
  powerB *= meanPropertyMultVsSample(scaledB, scaledA[0], content);

  powerA *= Number(opts?.powerMultA ?? 1);
  powerB *= Number(opts?.powerMultB ?? 1);

  // Defender-side logistics: GMap combatResolve applies logisticsCombatDefMult
  // to the system owner's defense. Same pattern as spaceObjectCombatModifier
  // (caller may also pre-bake it into powerMult*; this path is for when
  // opts.system is passed with logistics already computed).
  if (opts?.system) {
    const defMult = logisticsCombatDefMult(opts.system, content);
    if (opts.factionIdA === opts.system.ownerFactionId) powerA *= defMult;
    if (opts.factionIdB === opts.system.ownerFactionId) powerB *= defMult;
  }

  if (stanceA === "retreat" && powerA < powerB * 0.8) {
    return { ok: true, outcome: "retreat_a", powerA, powerB, lossesA: [], lossesB: [], retreated: opts?.factionIdA ?? null, groupsA, groupsB };
  }
  if (stanceB === "retreat" && powerB < powerA * 0.8) {
    return { ok: true, outcome: "retreat_b", powerA, powerB, lossesA: [], lossesB: [], retreated: opts?.factionIdB ?? null, groupsA, groupsB };
  }

  const shareA = powerA / Math.max(1, powerA + powerB);
  const rawDmgToB = powerA * 0.55 * (stB.casualtyTakenMult ?? 1);
  const rawDmgToA = powerB * 0.55 * (stA.casualtyTakenMult ?? 1);

  const { groups: groupsBAfter, log: lossesB } = applyCasualties(groupsB, rawDmgToB, groupsA[0]?.targeting || "line_first");
  const { groups: groupsAAfter, log: lossesA } = applyCasualties(groupsA, rawDmgToA, groupsB[0]?.targeting || "line_first");

  const finalGroupsA = removeDestroyedGroups(awardVeterancyXp(groupsAAfter, content));
  const finalGroupsB = removeDestroyedGroups(awardVeterancyXp(groupsBAfter, content));

  let outcome = "draw";
  if (shareA > 0.58) outcome = "win_a";
  else if (shareA < 0.42) outcome = "win_b";

  const aliveA = finalGroupsA.length > 0; // already pruned to count > 0 above
  const aliveB = finalGroupsB.length > 0;
  if (aliveA && !aliveB) outcome = "win_a";
  if (!aliveA && aliveB) outcome = "win_b";
  if (!aliveA && !aliveB) outcome = "draw";

  return { ok: true, outcome, powerA, powerB, lossesA, lossesB, groupsA: finalGroupsA, groupsB: finalGroupsB };
}

/** One persisted engage is a fight, not a single volley. Stop on wipe/retreat. */
export const MAX_EXCHANGE_ROUNDS = 12;

export function resolveUntilDecisive(groupsA, groupsB, opts, content, { maxRounds = MAX_EXCHANGE_ROUNDS } = {}) {
  let a = groupsA;
  let b = groupsB;
  let last = null;
  const lossesA = [];
  const lossesB = [];
  for (let i = 0; i < maxRounds; i++) {
    last = resolveExchange(a, b, opts, content);
    if (!last.ok) return last;
    lossesA.push(...(last.lossesA || []));
    lossesB.push(...(last.lossesB || []));
    if (last.outcome === "retreat_a" || last.outcome === "retreat_b") {
      return { ...last, lossesA, lossesB, rounds: i + 1 };
    }
    a = last.groupsA;
    b = last.groupsB;
    if (!a.length || !b.length) return { ...last, lossesA, lossesB, rounds: i + 1 };
  }
  return last ? { ...last, lossesA, lossesB, rounds: maxRounds } : { ok: false, error: "no forces" };
}

function combatModifierChannels(opts, side, content) {
  const techAccount = opts?.[`techAccount${side}`];
  const courtEffects = opts?.[`courtEffects${side}`];
  const forceId = opts?.[`forceId${side}`];
  const tech = collectTechModifierEffects(techAccount, content);
  const court = (courtEffects || []).filter((e) => {
    const scope = e.scope || "faction";
    if (scope === "faction") return true;
    if ((scope === "legion" || scope === "fleet") && forceId && e.targetId === forceId) return true;
    return false;
  });
  if (!tech.length && !court.length) return undefined;
  const stack = buildModifierStack([...tech, ...court]);
  return stack.channels;
}
