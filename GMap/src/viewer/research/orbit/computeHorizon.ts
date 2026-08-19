import type { DirectionProgress } from "./computeDirectionProgress";

/**
 * Horizon clipping (§1c of agent-tasks/SCIENCE_ORBIT_REDESIGN_SPEC.md) — which
 * nodes actually render, given a direction's phase (§1d). Pure, no React.
 *
 * Phases 1-3 (awakening/growing/mastered) are NOT three different rendering
 * modes — they all run the same horizon rule below; "mastered" only *looks*
 * different because by then there are few enough locked techs left to show
 * directly instead of collapsing into a badge. Only phase 0 (dormant, one
 * door node) and phase 4 (complete, silhouette trophy, see computeOrbitLayout
 * callers + silhouetteShapes.ts) are special-cased.
 */

export type HorizonNodeState = "done" | "frontier" | "dim";

export type HorizonNode = {
  id: string;
  state: HorizonNodeState;
};

export type SectorHorizon = {
  direction: string;
  mode: "door" | "horizon" | "trophy";
  /** Nodes to actually render for this sector; empty for "trophy". */
  visible: HorizonNode[];
  /** Count hidden behind a single "+N" cluster badge; 0 if nothing is hidden. */
  badgeCount: number;
};

export type HorizonTech = {
  id: string;
  /** Direct prerequisite tech ids; empty/undefined for a no-prerequisite entry tech. */
  prerequisites?: string[];
};

export type ComputeHorizonOptions = {
  /** Max individually-shown not-yet-unlocked frontier nodes. Spec §1c: 8. */
  frontierCap?: number;
  /** Above this many leftover locked techs, collapse to a badge instead of showing them dim. Spec §1c: 14. */
  directShowCap?: number;
};

const DEFAULTS: Required<ComputeHorizonOptions> = {
  frontierCap: 8,
  directShowCap: 14,
};

function findDoorTech(techs: HorizonTech[]): HorizonTech | null {
  return techs.find((t) => !t.prerequisites || t.prerequisites.length === 0) ?? null;
}

/**
 * @param techsByDirection direction id -> that direction's real tech list, in
 *   the same stable rank order computeOrbitLayout was called with (frontier
 *   ties break in this order — first-in-rank wins the cap, not "most
 *   affordable"; a rendering layer may re-sort by affordability before
 *   calling this if that's wanted, since cost isn't this function's concern).
 * @param unlockedIds the faction's unlocked-tech id set.
 * @param progress computeDirectionProgress's output, for phase lookup.
 */
export function computeHorizon(
  techsByDirection: Map<string, HorizonTech[]> | Record<string, HorizonTech[]>,
  unlockedIds: Set<string> | string[],
  progress: DirectionProgress[],
  options: ComputeHorizonOptions = {},
): SectorHorizon[] {
  const opts = { ...DEFAULTS, ...options };
  const unlocked = unlockedIds instanceof Set ? unlockedIds : new Set(unlockedIds);
  const entries =
    techsByDirection instanceof Map
      ? [...techsByDirection.entries()]
      : Object.entries(techsByDirection);
  const phaseByDirection = new Map(progress.map((p) => [p.direction, p.phase]));

  return entries.map(([direction, techs]) => {
    const phase = phaseByDirection.get(direction) ?? "dormant";

    if (phase === "complete") {
      return { direction, mode: "trophy", visible: [], badgeCount: 0 };
    }

    if (phase === "dormant") {
      const door = findDoorTech(techs);
      return {
        direction,
        mode: "door",
        visible: door ? [{ id: door.id, state: "frontier" }] : [],
        badgeCount: 0,
      };
    }

    const done: HorizonNode[] = [];
    const frontierCandidates: HorizonTech[] = [];
    const rest: HorizonTech[] = [];
    for (const t of techs) {
      if (unlocked.has(t.id)) {
        done.push({ id: t.id, state: "done" });
        continue;
      }
      const prereqsMet = (t.prerequisites ?? []).every((p) => unlocked.has(p));
      if (prereqsMet) frontierCandidates.push(t);
      else rest.push(t);
    }

    const frontier = frontierCandidates.slice(0, opts.frontierCap);
    const overflowFrontier = frontierCandidates.slice(opts.frontierCap);
    const remaining = [...overflowFrontier, ...rest];

    const visible: HorizonNode[] = [
      ...done,
      ...frontier.map((t): HorizonNode => ({ id: t.id, state: "frontier" })),
    ];

    let badgeCount = 0;
    if (remaining.length > 0) {
      if (remaining.length <= opts.directShowCap) {
        visible.push(...remaining.map((t): HorizonNode => ({ id: t.id, state: "dim" })));
      } else {
        badgeCount = remaining.length;
      }
    }

    return { direction, mode: "horizon", visible, badgeCount };
  });
}
