import type { TechDirectionId } from "../../../state/techDirections";

/**
 * Point coordinates for each direction's minor-node silhouette (§1e of
 * SCIENCE_ORBIT_REDESIGN_SPEC.md — PoE-style cluster shapes). Origin (0,0) is
 * the cluster's outward tip (where the flagship node sits); +y points back
 * toward the hub, +x is lateral. Coordinates are unitless — callers scale and
 * rotate them to the cluster's actual on-screen size and sector angle.
 *
 * Traced by hand from OrbitSilhouette.dc.html (a design-canvas artboard, not
 * checked into this repo — see agent-tasks/SCIENCE_ORBIT_REDESIGN_SPEC.md §1e
 * for the reference). genProgression.mjs, which the spec names as the
 * canonical source for this data, does not exist anywhere on disk or in the
 * canvas; this file is the reusable form the spec asked for.
 */
export type SilhouettePoint = { x: number; y: number };

export type SilhouetteShape = {
  /** Minor (unlabeled) node positions tracing the shape outline. */
  points: SilhouettePoint[];
  /** The flagship/breakthrough node position, at the shape's outward tip. */
  flagship: SilhouettePoint;
};

export const SILHOUETTE_SHAPES: Partial<Record<TechDirectionId, SilhouetteShape>> = {
  industry: {
    points: [
      { x: 45, y: -70 },
      { x: 32, y: -102 },
      { x: 0, y: -115 },
      { x: -32, y: -102 },
      { x: -45, y: -70 },
      { x: -32, y: -38 },
      { x: 0, y: -25 },
      { x: 32, y: -38 },
      { x: 60, y: -70 },
      { x: -60, y: -70 },
      { x: 0, y: -10 },
    ],
    flagship: { x: 0, y: -130 },
  },
  military: {
    points: [
      { x: -15, y: -100 },
      { x: 15, y: -100 },
      { x: -20, y: -60 },
      { x: 20, y: -60 },
      { x: -45, y: -40 },
      { x: 0, y: -40 },
      { x: 45, y: -40 },
      { x: 0, y: -15 },
    ],
    flagship: { x: 0, y: -150 },
  },
  culture: {
    points: [
      { x: -15, y: -15 },
      { x: 15, y: -15 },
      { x: -25, y: -50 },
      { x: 25, y: -50 },
      { x: -20, y: -80 },
      { x: 20, y: -80 },
      { x: -10, y: -110 },
      { x: 10, y: -110 },
      { x: 5, y: -140 },
    ],
    flagship: { x: -2, y: -155 },
  },
  commerce: {
    points: [
      { x: -35, y: -45 },
      { x: 35, y: -45 },
      { x: -55, y: -80 },
      { x: 55, y: -80 },
      { x: -35, y: -115 },
      { x: 35, y: -115 },
      { x: 0, y: -145 },
    ],
    flagship: { x: 0, y: -15 },
  },
  diplomacy: {
    points: [
      { x: 7, y: -70 },
      { x: -9, y: -98 },
      { x: -41, y: -98 },
      { x: -57, y: -70 },
      { x: -41, y: -42 },
      { x: -9, y: -42 },
      { x: 57, y: -70 },
      { x: 41, y: -98 },
      { x: 9, y: -108 },
      { x: 41, y: -42 },
      { x: 9, y: -32 },
    ],
    flagship: { x: 0, y: -130 },
  },
  governance: {
    points: [
      { x: -50, y: -30 },
      { x: 50, y: -30 },
      { x: 0, y: -25 },
      { x: -30, y: -50 },
      { x: 0, y: -45 },
      { x: 30, y: -50 },
      { x: -45, y: -110 },
      { x: 45, y: -110 },
    ],
    flagship: { x: 0, y: -132 },
  },
};
