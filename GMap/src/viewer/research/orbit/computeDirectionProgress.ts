/**
 * Per-direction phase derivation (§1d of
 * agent-tasks/SCIENCE_ORBIT_REDESIGN_SPEC.md). Pure, no React, no
 * content-catalog coupling — callers pass each direction's already-resolved
 * tech list and the faction's unlocked-tech set.
 *
 * Phase is a function of (researched / total) for THAT direction alone —
 * never a global game-progress flag. A direction with 1 real tech and a
 * direction with 300 both use the same thresholds; the phase system is what
 * keeps a 1-tech direction from ever needing a "cluster badge" (it simply
 * never leaves Dormant/Awakening, which render at most one node).
 */

export type DirectionPhase =
  | "dormant"
  | "awakening"
  | "growing"
  | "mastered"
  | "complete";

export type DirectionProgress = {
  direction: string;
  /** Real (non-catalog-stub) tech count in this direction. */
  total: number;
  researched: number;
  /** researched / total; 0 when total is 0 (no content authored yet). */
  ratio: number;
  phase: DirectionPhase;
};

export const PHASE_THRESHOLDS = {
  /** ratio < this stays "awakening"; spec §1d says "< ~15%". */
  growing: 0.15,
  /** ratio < this stays "growing"; spec §1d says "~15-70%". */
  mastered: 0.7,
} as const;

function phaseFor(researched: number, total: number): DirectionPhase {
  if (total <= 0 || researched <= 0) return "dormant";
  if (researched >= total) return "complete";
  const ratio = researched / total;
  if (ratio < PHASE_THRESHOLDS.growing) return "awakening";
  if (ratio < PHASE_THRESHOLDS.mastered) return "growing";
  return "mastered";
}

/**
 * @param byDirection direction id -> that direction's real tech list (already
 *   filtered to exclude catalog-stub/placeholder entries by the caller, same
 *   as ResearchPanel.tsx's existing `byDir`).
 * @param unlockedIds the faction's unlocked-tech id set (`eco.unlockedTechs`).
 */
export function computeDirectionProgress(
  byDirection: Map<string, { id: string }[]> | Record<string, { id: string }[]>,
  unlockedIds: Set<string> | string[],
): DirectionProgress[] {
  const unlocked = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds);
  const entries =
    byDirection instanceof Map
      ? [...byDirection.entries()]
      : Object.entries(byDirection);

  return entries.map(([direction, techs]) => {
    const total = techs.length;
    const researched = techs.reduce((n, t) => n + (unlocked.has(t.id) ? 1 : 0), 0);
    return {
      direction,
      total,
      researched,
      ratio: total > 0 ? researched / total : 0,
      phase: phaseFor(researched, total),
    };
  });
}
