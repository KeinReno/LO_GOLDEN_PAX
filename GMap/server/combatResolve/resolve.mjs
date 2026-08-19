/**
 * Engagement resolution entry points: full non-phased fight, and phased
 * assault (bombard → landing → ground → occupation).
 * Extracted from ../combatResolve.mjs.
 */
import { getContent } from "../contentLoader.mjs";
import { collectPowerMindStrikeMult } from "../powerPaths.mjs";
import { randomInt } from "node:crypto";
import { meanPropertyMultVsSample } from "./properties.mjs";
import { awardVeterancyXp } from "./veterancy.mjs";
import { buildDefenseLayers, degradeDefenseLayers } from "./defenseLayers.mjs";
import {
  groupsForFight,
  gatherGroups,
  rolePower,
  totalPower,
  factionCombatRoleChannels,
  applySpaceObjectPower,
  applyCasualties,
  persistStationaryCasualties,
  pruneDestroyedGroups,
  cleanupEmptyComposition,
  stanceMult,
  filterGroupsByRoles,
} from "./fightMath.mjs";

export const ASSAULT_PHASES = ["bombard", "landing", "ground", "occupation"];

/**
 * Resolve one engagement side vs side (full fight, non-phased).
 */
export function resolveEngagementFight(world, engagement) {
  const content = getContent();
  const matchups = content.combat_matchups || {};
  const theater = engagement.theater || "space";
  const sideA = engagement.sides[0];
  const sideB = engagement.sides[1];
  if (!sideA || !sideB) {
    return { ok: false, error: "need two sides" };
  }

  const groupsA = groupsForFight(world, sideA, theater, content, engagement);
  const groupsB = groupsForFight(world, sideB, theater, content, engagement);
  if (groupsA.length === 0 && groupsB.length === 0) {
    return { ok: false, error: "no forces" };
  }

  const stA = stanceMult(content, sideA.stance || "hold");
  const stB = stanceMult(content, sideB.stance || "hold");

  const chA = factionCombatRoleChannels(world, sideA.factionId, content);
  const chB = factionCombatRoleChannels(world, sideB.factionId, content);
  const fightSys = (world.systems ?? []).find(
    (s) => s.id === engagement.systemId,
  );

  const rolesA = rolePower(groupsA);
  const rolesB = rolePower(groupsB);
  let powerA = totalPower(rolesA, matchups, rolesB, chA) * (stA.powerMult ?? 1);
  let powerB = totalPower(rolesB, matchups, rolesA, chB) * (stB.powerMult ?? 1);

  powerA *= meanPropertyMultVsSample(groupsA, groupsB[0], content);
  powerB *= meanPropertyMultVsSample(groupsB, groupsA[0], content);

  powerA *= collectPowerMindStrikeMult(world, sideA.factionId, content);
  powerB *= collectPowerMindStrikeMult(world, sideB.factionId, content);

  ({ powerA, powerB } = applySpaceObjectPower(
    powerA,
    powerB,
    fightSys,
    content,
    sideA,
    sideB,
  ));

  // Logistics combatDefMult is applied once in gatherDefenseUnits (stationary stats).

  // Loyalty defense penalty / garrison defection (ground & assault)
  const loyaltyNotes = [];
  if ((theater === "ground" || theater === "assault") && fightSys) {
    const inhabited = (fightSys.planets || []).filter(
      (p) => (p.population ?? 0) > 0,
    );
    if (inhabited.length) {
      const avg =
        inhabited.reduce((s, p) => s + (p.loyalty ?? 50), 0) /
        inhabited.length;
      const ownerId = fightSys.ownerFactionId;
      let defMult = 1;
      if (avg < 20) {
        if (randomInt(100) < 25) {
          loyaltyNotes.push({
            type: "garrison_defect",
            loyalty: Math.round(avg),
          });
          defMult = 0.35;
        } else {
          defMult = 0.8;
        }
      } else if (avg < 40) {
        defMult = 0.8;
      }
      if (defMult !== 1 && ownerId) {
        if (sideA.factionId === ownerId) powerA *= defMult;
        if (sideB.factionId === ownerId) powerB *= defMult;
      }
    }
  }

  if ((sideA.stance || "hold") === "retreat" && powerA < powerB * 0.8) {
    return {
      ok: true,
      outcome: "retreat_a",
      powerA,
      powerB,
      lossesA: [],
      lossesB: [],
      retreated: sideA.factionId,
      phase: engagement.phase || null,
    };
  }
  if ((sideB.stance || "hold") === "retreat" && powerB < powerA * 0.8) {
    return {
      ok: true,
      outcome: "retreat_b",
      powerA,
      powerB,
      lossesA: [],
      lossesB: [],
      retreated: sideB.factionId,
      phase: engagement.phase || null,
    };
  }

  const shareA = powerA / Math.max(1, powerA + powerB);
  const rawDmgToB = powerA * 0.55 * (stB.casualtyTakenMult ?? 1);
  const rawDmgToA = powerB * 0.55 * (stA.casualtyTakenMult ?? 1);

  const lossesB = applyCasualties(
    groupsB,
    rawDmgToB,
    groupsA[0]?.targeting || "line_first",
  );
  const lossesA = applyCasualties(
    groupsA,
    rawDmgToA,
    groupsB[0]?.targeting || "line_first",
  );
  persistStationaryCasualties(world, engagement, [...lossesA, ...lossesB]);
  pruneDestroyedGroups(groupsA);
  pruneDestroyedGroups(groupsB);
  cleanupEmptyComposition(world);
  awardVeterancyXp(groupsA, content);
  awardVeterancyXp(groupsB, content);

  let outcome = "draw";
  if (shareA > 0.58) outcome = "win_a";
  else if (shareA < 0.42) outcome = "win_b";

  const aliveA = groupsA.some((g) => (g.count || 0) > 0);
  const aliveB = groupsB.some((g) => (g.count || 0) > 0);
  if (aliveA && !aliveB) outcome = "win_a";
  if (!aliveA && aliveB) outcome = "win_b";
  if (!aliveA && !aliveB) outcome = "draw";

  return {
    ok: true,
    outcome,
    powerA,
    powerB,
    lossesA,
    lossesB,
    loyaltyNotes,
    phase: engagement.phase || null,
  };
}

/**
 * Resolve a single assault phase. Returns fight result + whether engagement continues.
 */
export function resolveAssaultPhase(world, engagement) {
  const content = getContent();
  const matchups = content.combat_matchups || {};
  const phase = engagement.phase || "bombard";
  const sideA = engagement.sides[0];
  const sideB = engagement.sides[1];
  if (!sideA || !sideB) {
    return { ok: false, error: "need two sides" };
  }

  if (!engagement.defenseLayers) {
    engagement.defenseLayers = buildDefenseLayers(world, engagement);
  }
  const layers = engagement.defenseLayers;

  const theater = phase === "bombard" ? "space" : "assault";
  let groupsA = groupsForFight(world, sideA, theater, content, engagement);
  let groupsB = groupsForFight(
    world,
    sideB,
    theater === "space" ? "assault" : theater,
    content,
    engagement,
  );

  const stA = stanceMult(content, sideA.stance || "assault");
  const stB = stanceMult(content, sideB.stance || "hold");
  const chA = factionCombatRoleChannels(world, sideA.factionId, content);
  const chB = factionCombatRoleChannels(world, sideB.factionId, content);
  const fightSys = (world.systems ?? []).find(
    (s) => s.id === engagement.systemId,
  );

  let powerA = 0;
  let powerB = 0;
  let lossesA = [];
  let lossesB = [];
  let phaseNote = null;
  let continueEngagement = true;
  let outcome = "phase_continue";

  if (phase === "bombard") {
    const bombA = filterGroupsByRoles(groupsA, ["bombard", "capital"]);
    let bombPower =
      bombA.reduce(
        (s, g) => s + (g.damage || 0) * (g.count || 0) * (0.5 + (g.accuracy || 0) / 200),
        0,
      ) * (stA.powerMult ?? 1);
    let returnFire =
      (layers.orbital.guns + layers.orbital.shields) * 8 * (stB.powerMult ?? 1);
    ({ powerA: bombPower, powerB: returnFire } = applySpaceObjectPower(
      bombPower,
      returnFire,
      fightSys,
      content,
      sideA,
      sideB,
    ));
    powerA = bombPower;
    const hits = degradeDefenseLayers(layers, bombPower, "bombard");
    phaseNote = `orbital −${hits.orbitalHit}, surface −${hits.surfaceHit}`;

    // Orbital guns return fire on bombarding ships only
    powerB = returnFire;
    lossesA = applyCasualties(bombA, returnFire * 0.4, "capital_first");
    lossesB = [];
    engagement.orbitalControl =
      layers.orbital.guns + layers.orbital.shields <= 0
        ? "attacker"
        : layers.orbital.guns === 0
          ? "contested"
          : "defender";
  } else if (phase === "landing") {
    let assaultA = filterGroupsByRoles(groupsA, ["assault", "infantry"]);
    if (assaultA.length === 0) assaultA = groupsA.filter((g) => g.kind === "unit");
    const defB = filterGroupsByRoles(groupsB, [
      "garrison",
      "infantry",
      "assault",
    ]);
    const shieldPenalty =
      (layers.orbital?.shields || 0) > 0 ? 0.65 : 1;
    const fortBonus = 1 + (layers.garrison?.fortBonus || 0) / 100;

    const rolesA = rolePower(assaultA);
    const rolesB = rolePower(defB);
    powerA =
      totalPower(rolesA, matchups, rolesB, chA) *
      (stA.powerMult ?? 1) *
      shieldPenalty;
    powerB =
      totalPower(rolesB, matchups, rolesA, chB) * (stB.powerMult ?? 1) * fortBonus;
    ({ powerA, powerB } = applySpaceObjectPower(
      powerA,
      powerB,
      fightSys,
      content,
      sideA,
      sideB,
    ));

    lossesB = applyCasualties(
      defB,
      powerA * 0.5 * (stB.casualtyTakenMult ?? 1),
      "garrison_first",
    );
    lossesA = applyCasualties(
      assaultA,
      powerB * 0.55 * (stA.casualtyTakenMult ?? 1),
      "assault_first",
    );
    phaseNote =
      (layers.orbital?.shields || 0) > 0
        ? "landing under shields"
        : "landing clear";
  } else if (phase === "ground") {
    const groundA = groupsA.filter((g) => g.kind === "unit" || g.stationary);
    const groundB = groupsB.filter((g) => g.kind === "unit" || g.stationary);
    const fortBonus = 1 + (layers.garrison?.fortBonus || 0) / 80;
    const rolesA = rolePower(groundA);
    const rolesB = rolePower(groundB);
    powerA = totalPower(rolesA, matchups, rolesB, chA) * (stA.powerMult ?? 1);
    powerB =
      totalPower(rolesB, matchups, rolesA, chB) * (stB.powerMult ?? 1) * fortBonus;
    ({ powerA, powerB } = applySpaceObjectPower(
      powerA,
      powerB,
      fightSys,
      content,
      sideA,
      sideB,
    ));

    lossesB = applyCasualties(
      groundB,
      powerA * 0.55 * (stB.casualtyTakenMult ?? 1),
      groundA[0]?.targeting || "infantry_first",
    );
    lossesA = applyCasualties(
      groundA,
      powerB * 0.55 * (stA.casualtyTakenMult ?? 1),
      groundB[0]?.targeting || "assault_first",
    );
    persistStationaryCasualties(world, engagement, [...lossesA, ...lossesB]);

    const aliveA = groundA.some((g) => (g.count || 0) > 0);
    const aliveB = groundB.some((g) => (g.count || 0) > 0);
    if (aliveA && !aliveB) outcome = "win_a";
    else if (!aliveA && aliveB) outcome = "win_b";
    else if (!aliveA && !aliveB) outcome = "draw";
    else {
      const share = powerA / Math.max(1, powerA + powerB);
      if (share > 0.58) outcome = "win_a";
      else if (share < 0.42) outcome = "win_b";
      else outcome = "draw";
    }
  } else if (phase === "occupation") {
    // Occupation: claim if attackers still have ground presence and defenders wiped.
    // Stationary wiped in ground phase stay gone (persistStationaryCasualties).
    groupsA = gatherGroups(world, sideA, "assault", content, engagement);
    groupsB = gatherGroups(world, sideB, "assault", content, engagement);
    const aliveA = groupsA.some((g) => (g.count || 0) > 0 && !g.stationary);
    // Wiped stationary stay count 0 / buildings disabled — only remaining forces block.
    const aliveB = groupsB.some((g) => (g.count || 0) > 0);
    powerA = aliveA ? 1 : 0;
    powerB = aliveB ? 1 : 0;
    if (aliveA && !aliveB) outcome = "win_a";
    else if (!aliveA) outcome = "win_b";
    else outcome = "draw";
    continueEngagement = false;
    phaseNote = "occupation";
  }

  cleanupEmptyComposition(world);
  awardVeterancyXp(groupsA, content);
  awardVeterancyXp(groupsB, content);

  const phaseIdx = ASSAULT_PHASES.indexOf(phase);
  const nextPhase =
    phaseIdx >= 0 && phaseIdx < ASSAULT_PHASES.length - 1
      ? ASSAULT_PHASES[phaseIdx + 1]
      : null;

  // Decisive early end
  if (phase === "ground" && (outcome === "win_a" || outcome === "win_b")) {
    // Still run occupation for win_a claim; skip occupation for win_b
    if (outcome === "win_b") {
      continueEngagement = false;
    } else if (nextPhase === "occupation") {
      continueEngagement = true;
    }
  }
  if (phase === "bombard" || phase === "landing") {
    continueEngagement = true;
    outcome = "phase_continue";
  }
  if (!nextPhase) continueEngagement = false;

  return {
    ok: true,
    outcome,
    powerA,
    powerB,
    lossesA,
    lossesB,
    phase,
    nextPhase: continueEngagement ? nextPhase : null,
    continueEngagement,
    phaseNote,
    defenseLayers: layers,
  };
}
