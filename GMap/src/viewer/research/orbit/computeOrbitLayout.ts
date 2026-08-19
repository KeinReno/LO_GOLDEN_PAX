/**
 * Pure layout math for the science-screen orbit (§1b of
 * agent-tasks/SCIENCE_ORBIT_REDESIGN_SPEC.md). No rendering, no React, no
 * content-catalog coupling — callers resolve each tech's direction
 * (state/techDirections.ts's resolveTechDirection) and pass stable content
 * order; this only computes where every node sits.
 *
 * CONSTELLATION MODEL (owner-requested redesign, superseding the original
 * spec's single shared-radius wheel — see agent-tasks/STATUS.md
 * 2026-08-19). The original design gave each direction a wedge whose ANGLE
 * was proportional to its real tech count, but every wedge shared one
 * global radius (driven by the richest direction). On real content
 * (industry 355 vs governance 1), that meant governance's wedge painted a
 * tiny sliver near the hub and then... nothing — the rest of its angular
 * slice, out to industry's shared edge, was just empty stage background.
 * No CSS or number-tuning fixes that: it's a structural mismatch between
 * "one shared coordinate scale" and "wildly uneven content per direction".
 *
 * This model drops the shared radius entirely. Every direction gets an
 * EQUAL, FIXED angular slot (clusterArcDeg) at its own anchor point
 * (apexX/apexY), offset a fixed distance (hubGapPx) from the hub — six
 * evenly-spaced compass points, like petals around a flower. Each
 * direction's own ring-packing then grows outward from ITS OWN apex,
 * sized purely by its own tech count. A 1-tech direction is just a small
 * dot near its apex; a 355-tech direction is a full cluster further out —
 * neither one owes anything to the other's scale, so there's no shared
 * canvas edge for a sparse direction to fall short of.
 */

export type OrbitLayoutTech = {
  id: string;
  /** Already-resolved direction id (e.g. "industry"). */
  direction: string;
};

export type OrbitNode = {
  id: string;
  direction: string;
  /** 0-based ring index within its direction's cluster (0 = innermost, nearest the apex). */
  ring: number;
  /** 0-based stable rank within its direction, in input order. */
  rank: number;
  /** Radians, world space, 0 = +x axis, increasing clockwise (screen convention). */
  angle: number;
  /** Distance from this node to its OWN direction's apex (not the hub). */
  radius: number;
  /** Absolute position — apex + polar(angle, radius). What renderers should use directly. */
  x: number;
  y: number;
};

export type SectorBoundary = {
  direction: string;
  /** Real (non-fallback) tech count driving this cluster's radius. */
  count: number;
  /** World-space angles the cluster's arc spans (world = anchor ± clusterArcRad/2). */
  startAngle: number;
  endAngle: number;
  /** The direction's anchor angle — the compass point its apex sits on. */
  midAngle: number;
  ringCount: number;
  /** This cluster's own radius, measured from ITS apex — never from the hub. */
  outerRadius: number;
  /** This direction's apex position — every node/ring in this cluster is offset from here, not from (0,0). */
  apexX: number;
  apexY: number;
};

export type OrbitLayout = {
  nodes: OrbitNode[];
  sectors: SectorBoundary[];
};

export type OrbitLayoutOptions = {
  /** Angular width of every direction's own cluster — fixed and equal, so no direction can starve another's angle budget the way proportional sharing used to. */
  clusterArcDeg?: number;
  /** Distance from the hub to every direction's apex — same for all six, so clusters sit on one shared "compass ring" regardless of how much content they hold; only each cluster's OWN radius (from its apex) reflects its size. */
  hubGapPx?: number;
  /** Arc-length budget per node when packing a ring — bigger = fewer nodes per ring, chunkier cluster. */
  nodePitchPx?: number;
  /** Radius of a cluster's innermost possible ring (from its own apex). */
  minRingRadiusPx?: number;
  /** Minimum radial distance between successive rings, even for a near-empty ring. */
  ringGapPx?: number;
  /** Rotates the whole compass; radians, screen convention (0 = +x axis, clockwise). Default points direction 0 straight up. */
  startAngle?: number;
};

const DEFAULTS: Required<OrbitLayoutOptions> = {
  clusterArcDeg: 110,
  hubGapPx: 70,
  nodePitchPx: 30,
  minRingRadiusPx: 20,
  ringGapPx: 22,
  startAngle: -Math.PI / 2,
};

/** One direction fills the stage like a planet ring — not six petals. */
export const FOCUSED_ORBIT_DEFAULTS: OrbitLayoutOptions = {
  clusterArcDeg: 360,
  hubGapPx: 0,
  nodePitchPx: 28,
  minRingRadiusPx: 52,
  ringGapPx: 26,
};

export function computeFocusedOrbitLayout(
  direction: string,
  techs: OrbitLayoutTech[],
  options: OrbitLayoutOptions = {},
): OrbitLayout {
  const scoped = techs.filter((t) => t.direction === direction);
  return computeOrbitLayout([direction], scoped, {
    ...FOCUSED_ORBIT_DEFAULTS,
    ...options,
  });
}

type PackedRing = { radius: number; count: number };

/**
 * Fills rings outward for one direction's cluster. Ring capacity is the
 * number of nodes that fit at nodePitchPx spacing along that ring's arc
 * (clusterArcRad × radius); radius grows by at least ringGapPx per ring so
 * a sparse trailing ring never collapses back toward the apex. Because
 * capacity only depends on the previous ring's committed radius and this
 * direction's own (fixed) arc width, appending techs to this direction only
 * ever extends or adds trailing rings — it never reshuffles earlier ones.
 */
function packRings(
  count: number,
  clusterArcRad: number,
  opts: Required<OrbitLayoutOptions>,
): PackedRing[] {
  const rings: PackedRing[] = [];
  let remaining = count;
  let prevRadius = 0;
  while (remaining > 0) {
    const candidateRadius = Math.max(opts.minRingRadiusPx, prevRadius + opts.ringGapPx);
    const capacity = Math.max(
      1,
      Math.floor((clusterArcRad * candidateRadius) / opts.nodePitchPx),
    );
    const placeCount = Math.min(capacity, remaining);
    const radius = Math.max(
      candidateRadius,
      (placeCount * opts.nodePitchPx) / clusterArcRad,
    );
    rings.push({ radius, count: placeCount });
    remaining -= placeCount;
    prevRadius = radius;
  }
  return rings;
}

export function computeOrbitLayout(
  directionIds: string[],
  techs: OrbitLayoutTech[],
  options: OrbitLayoutOptions = {},
): OrbitLayout {
  const opts = { ...DEFAULTS, ...options };

  const byDirection = new Map<string, OrbitLayoutTech[]>();
  for (const id of directionIds) byDirection.set(id, []);
  for (const tech of techs) {
    if (!byDirection.has(tech.direction)) byDirection.set(tech.direction, []);
    byDirection.get(tech.direction)!.push(tech);
  }
  const orderedDirections = [...byDirection.keys()];

  const clusterArcRad = (opts.clusterArcDeg * Math.PI) / 180;
  const anchorStep = orderedDirections.length > 0 ? (2 * Math.PI) / orderedDirections.length : 0;

  const nodes: OrbitNode[] = [];
  const sectors: SectorBoundary[] = [];

  orderedDirections.forEach((direction, index) => {
    const directionTechs = byDirection.get(direction)!;
    const anchorAngle = opts.startAngle + index * anchorStep;
    const apexX = Math.cos(anchorAngle) * opts.hubGapPx;
    const apexY = Math.sin(anchorAngle) * opts.hubGapPx;

    if (directionTechs.length === 0) {
      sectors.push({
        direction,
        count: 0,
        startAngle: anchorAngle,
        endAngle: anchorAngle,
        midAngle: anchorAngle,
        ringCount: 0,
        outerRadius: opts.minRingRadiusPx,
        apexX,
        apexY,
      });
      return;
    }

    const rings = packRings(directionTechs.length, clusterArcRad, opts);
    let rank = 0;
    let outerRadius = opts.minRingRadiusPx;
    rings.forEach((ring, ringIndex) => {
      const angleStep = clusterArcRad / ring.count;
      for (let i = 0; i < ring.count; i++) {
        const tech = directionTechs[rank];
        const localAngle = -clusterArcRad / 2 + (i + 0.5) * angleStep;
        const globalAngle = anchorAngle + localAngle;
        nodes.push({
          id: tech.id,
          direction,
          ring: ringIndex,
          rank,
          angle: globalAngle,
          radius: ring.radius,
          x: apexX + Math.cos(globalAngle) * ring.radius,
          y: apexY + Math.sin(globalAngle) * ring.radius,
        });
        rank++;
      }
      outerRadius = ring.radius;
    });

    sectors.push({
      direction,
      count: directionTechs.length,
      startAngle: anchorAngle - clusterArcRad / 2,
      endAngle: anchorAngle + clusterArcRad / 2,
      midAngle: anchorAngle,
      ringCount: rings.length,
      outerRadius,
      apexX,
      apexY,
    });
  });

  return { nodes, sectors };
}
