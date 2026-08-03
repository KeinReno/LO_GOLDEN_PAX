import type { Graphics } from "pixi.js";
import { toIso } from "./iso";
import type { AnimClock } from "./drawMapIcons";
import type { Caravan, Quest, StarSystem, SystemLink, WorldState } from "../state/types";
import {
  buildSupplySpokes,
  caravanWorldPos,
  DEFAULT_JUMP_RANGE,
  trafficThreads,
} from "../state/mapFeatures";

export function drawJumpRange(
  g: Graphics,
  system: StarSystem,
  range = DEFAULT_JUMP_RANGE,
  anim: AnimClock,
): void {
  const p = toIso(system.x, system.y);
  const pulse = 0.22 + Math.sin(anim.t * 2.2) * 0.04;
  const steps = 48;
  g.moveTo(p.x + range, p.y);
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    /* iso squash */
    g.lineTo(p.x + Math.cos(a) * range, p.y + Math.sin(a) * range * 0.55);
  }
  g.closePath();
  g.stroke({ width: 1.4, color: 0x7bdff2, alpha: pulse + 0.25 });
  g.fill({ color: 0x4cc9f0, alpha: pulse * 0.35 });
}

export function drawDeadZone(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const r = 28 + Math.sin(anim.t * 3 + s.x * 0.01) * 3;
  g.circle(p.x, p.y, r);
  g.fill({ color: 0x1a2030, alpha: 0.35 });
  g.circle(p.x, p.y, r);
  g.stroke({ width: 1.2, color: 0x6a7a90, alpha: 0.55 });
  /* noise ticks */
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + anim.t;
    g.moveTo(p.x + Math.cos(a) * (r - 6), p.y + Math.sin(a) * (r - 6) * 0.55);
    g.lineTo(p.x + Math.cos(a) * (r + 2), p.y + Math.sin(a) * (r + 2) * 0.55);
    g.stroke({ width: 1, color: 0x9aa8bc, alpha: 0.35 });
  }
}

export function drawBlockadeRing(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const r = 22 + Math.sin(anim.t * 4) * 1.5;
  g.circle(p.x, p.y, r);
  g.stroke({ width: 2.2, color: 0xe85d4c, alpha: 0.85 });
  g.circle(p.x, p.y, r + 4);
  g.stroke({ width: 1, color: 0xe85d4c, alpha: 0.35 });
}

export function drawCondominiumAura(
  _g: Graphics,
  _s: StarSystem,
  _world: WorldState,
): void {
  // Deprecated: shared ownership is drawn as a pie-split token + aura.
}

/** Dashed dispute ring — contested claim without requiring co-owner. */
export function drawContestedClaim(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  if (!s.contested) return;
  const p = toIso(s.x, s.y);
  const r = 18 + anim.pulse * 1.2;
  const dashes = 14;
  for (let i = 0; i < dashes; i++) {
    if (i % 2 === 1) continue;
    const a0 = (i / dashes) * Math.PI * 2 + anim.t * 0.4;
    const a1 = ((i + 0.55) / dashes) * Math.PI * 2 + anim.t * 0.4;
    g.moveTo(p.x + Math.cos(a0) * r, p.y + Math.sin(a0) * r);
    g.lineTo(p.x + Math.cos(a1) * r, p.y + Math.sin(a1) * r);
  }
  g.stroke({ width: 2, color: 0xe8a54c, alpha: 0.75 + anim.pulse * 0.1 });
}

export function drawSupplyChains(
  g: Graphics,
  world: WorldState,
  factionId: string | null,
  anim: AnimClock,
): void {
  if (!factionId) return;
  const byId = new Map(world.systems.map((s) => [s.id, s]));
  const owned = world.systems.filter((s) => s.ownerFactionId === factionId);
  const hasLogistics = owned.some((s) => s.logistics != null);

  if (hasLogistics) {
    for (const sys of owned) {
      const L = sys.logistics;
      if (!L) continue;
      const parent = L.parentId ? byId.get(L.parentId) : null;
      const from = parent ?? owned.find((s) => s.isCapital) ?? null;
      if (!from || from.id === sys.id) continue;
      const a = toIso(from.x, from.y);
      const b = toIso(sys.x, sys.y);
      const connected = L.connectedToCapital;
      const color = !connected
        ? 0xe85d4c
        : L.bottlenecked
          ? 0xe8c547
          : 0x5cdb95;
      const width = 1 + Math.max(0.4, (L.supplyLevel || 0) * 2.4);
      const alpha = connected
        ? 0.4 + Math.sin(anim.t * 2) * 0.08
        : 0.45 + Math.sin(anim.t * 3) * 0.1;
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke({ width: width + 1.6, color: 0x0a0e14, alpha: 0.35 });
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke({ width, color, alpha });
    }
    return;
  }

  const spokes = buildSupplySpokes(world, factionId);
  for (const { from, to } of spokes) {
    const a = toIso(from.x, from.y);
    const b = toIso(to.x, to.y);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 3.2, color: 0x0a0e14, alpha: 0.35 });
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({
      width: 1.3,
      color: 0x5cdb95,
      alpha: 0.35 + Math.sin(anim.t * 2) * 0.08,
    });
  }
}

export function drawCaravans(
  g: Graphics,
  world: WorldState,
  caravans: Caravan[],
  anim: AnimClock,
): void {
  for (const c of caravans) {
    const from = world.systems.find((s) => s.id === c.fromSystemId);
    const to = world.systems.find((s) => s.id === c.toSystemId);
    if (!from || !to) continue;
    const a = toIso(from.x, from.y);
    const b = toIso(to.x, to.y);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({ width: 1.1, color: 0xc9a227, alpha: 0.28 });
    const pos = caravanWorldPos(world, c);
    if (!pos) continue;
    const p = toIso(pos.x, pos.y);
    const bob = Math.sin(anim.t * 5 + c.progress * 10) * 1.5;
    g.moveTo(p.x - 5, p.y + bob);
    g.lineTo(p.x + 5, p.y + bob);
    g.lineTo(p.x, p.y - 5 + bob);
    g.closePath();
    g.fill({ color: 0xe8c547, alpha: 0.9 });
    g.stroke({ width: 1, color: 0x0a1018, alpha: 0.8 });
  }
}

export function drawTrafficDensity(
  g: Graphics,
  world: WorldState,
  anim: AnimClock,
): void {
  const threads = trafficThreads(world);
  for (const t of threads) {
    const a = toIso(t.ax, t.ay);
    const b = toIso(t.bx, t.by);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke({
      width: 0.8,
      color: 0x9bb4cc,
      alpha: 0.08 + Math.sin(anim.t + t.ax * 0.01) * 0.03,
    });
    const u = (anim.t * 0.15 + t.ax * 0.001) % 1;
    const sx = a.x + (b.x - a.x) * u;
    const sy = a.y + (b.y - a.y) * u;
    g.circle(sx, sy, 1.2);
    g.fill({ color: 0xc5d4e4, alpha: 0.35 });
  }
}

export function drawDamylLink(
  g: Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  kind: "damyl_space" | "damyl_planet",
  anim: AnimClock,
  selected = false,
): void {
  const a = toIso(ax, ay);
  const b = toIso(bx, by);
  const color = kind === "damyl_space" ? 0x6ec6ff : 0xc084fc;
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({ width: selected ? 5 : 3.6, color: 0x0a0e14, alpha: 0.5 });
  /* dashed feel via mid accent */
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke({
    width: selected ? 2.4 : 1.8,
    color,
    alpha: selected ? 0.95 : 0.65,
  });
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;
  const pulse = 3 + Math.sin(anim.t * 3) * 0.8;
  g.circle(midX, midY, pulse);
  g.fill({ color, alpha: 0.85 });
  if (kind === "damyl_planet") {
    g.circle(midX, midY, pulse + 3);
    g.stroke({ width: 1, color, alpha: 0.5 });
  }
}

export function drawQuestMarker(
  g: Graphics,
  s: StarSystem,
  quests: Quest[],
  anim: AnimClock,
): void {
  const active = quests.filter((q) => q.status === "active");
  if (active.length === 0 && s.poiType !== "quest" && !s.questId) return;
  const p = toIso(s.x, s.y);
  const bob = Math.sin(anim.t * 3) * 2;
  const y = p.y - 28 + bob;
  // Soft pin-light halo (flat 3D-pin read, no perspective)
  g.ellipse(p.x, y + 2, 14 + anim.pulse * 1.8, 7 + anim.pulse * 0.7);
  g.fill({ color: 0xe8c547, alpha: 0.05 + anim.pulse * 0.03 });
  g.ellipse(p.x, y + 2, 11 + anim.pulse * 1.5, 5.5 + anim.pulse * 0.6);
  g.stroke({ width: 1, color: 0xe8c547, alpha: 0.22 + anim.pulse * 0.1 });
  g.ellipse(p.x, y + 2, 7.5, 3.8);
  g.fill({ color: 0xe8c547, alpha: 0.1 + anim.pulse2 * 0.06 });
  // Stem
  g.moveTo(p.x, y + 6);
  g.lineTo(p.x, p.y - 8);
  g.stroke({ width: 1.4, color: 0xe8c547, alpha: 0.55 });
  // Pin head diamond
  g.moveTo(p.x, y - 10);
  g.lineTo(p.x + 8, y);
  g.lineTo(p.x, y + 4);
  g.lineTo(p.x - 8, y);
  g.closePath();
  g.fill({ color: 0xe8c547, alpha: 0.95 });
  g.stroke({ width: 1.2, color: 0x0a1018, alpha: 0.9 });
  // Specular edge on pin head
  g.moveTo(p.x - 3, y - 6);
  g.lineTo(p.x, y - 9);
  g.lineTo(p.x + 3, y - 6);
  g.stroke({ width: 1, color: 0xfff4d0, alpha: 0.55 });
  g.circle(p.x, y - 2, 2);
  g.fill({ color: 0x0a1018, alpha: 0.9 });
}

export function drawAnomalyField(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  if (s.poiType !== "anomaly" && !s.anomalyMotion) return;
  const p = toIso(s.x, s.y);
  const r = s.anomalyMotion?.radius ?? 36;
  const spin = anim.t * 1.5;
  for (let i = 0; i < 3; i++) {
    const rr = r * (0.5 + i * 0.25);
    g.ellipse(p.x, p.y, rr, rr * 0.55);
    g.stroke({
      width: 1,
      color: 0xb388ff,
      alpha: 0.25 + Math.sin(spin + i) * 0.1,
    });
  }
}

/** GM-only: small badge when a narrative timer is scheduled on the system. */
export function drawTimerBadge(
  g: Graphics,
  s: StarSystem,
  currentTurn: number,
  anim: AnimClock,
): void {
  if (!s.timers?.length) return;
  const p = toIso(s.x, s.y);
  const cx = p.x + 20;
  const cy = p.y - 28 + Math.sin(anim.t * 2.5) * 1;
  g.circle(cx, cy, 5);
  g.fill({ color: 0xe8a54c, alpha: 0.92 });
  g.stroke({ width: 1, color: 0x0a1018, alpha: 0.85 });
  const urgent = s.timers.some((t) => (t.expiresTurn ?? 0) <= currentTurn + 1);
  if (urgent) {
    g.circle(cx, cy, 8 + anim.pulse * 1.5);
    g.stroke({ width: 1, color: 0xe8a54c, alpha: 0.35 + anim.pulse * 0.2 });
  }
}

/** Viewer: small badge when system contributes to a severe economy bottleneck. */
export function drawEconomyBottleneckBadge(
  g: Graphics,
  s: StarSystem,
  anim: AnimClock,
): void {
  const p = toIso(s.x, s.y);
  const cx = p.x + 18;
  const cy = p.y - 18 + Math.sin(anim.t * 2.8 + s.x * 0.01) * 1;
  g.circle(cx, cy, 4.5);
  g.fill({ color: 0xe85d5d, alpha: 0.95 });
  g.stroke({ width: 1, color: 0x0a1018, alpha: 0.85 });
  g.circle(cx, cy, 7 + anim.pulse * 1.2);
  g.stroke({ width: 1, color: 0xe85d5d, alpha: 0.25 + anim.pulse * 0.15 });
}

/** Hit-test quest diamond above system (iso space). */
export function questMarkerHit(
  worldX: number,
  worldY: number,
  s: StarSystem,
  hitR = 14,
): boolean {
  const tip = toIso(worldX, worldY);
  const p = toIso(s.x, s.y);
  const qx = p.x;
  const qy = p.y - 26;
  const dx = tip.x - qx;
  const dy = tip.y - qy;
  return dx * dx + dy * dy <= hitR * hitR;
}

export function drawSpecialLink(
  g: Graphics,
  link: SystemLink,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  anim: AnimClock,
  selected: boolean,
): boolean {
  if (link.type === "damyl_space" || link.type === "damyl_planet") {
    drawDamylLink(g, ax, ay, bx, by, link.type, anim, selected);
    return true;
  }
  return false;
}
