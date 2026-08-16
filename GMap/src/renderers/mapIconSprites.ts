import { Container, Graphics, Sprite, Text } from "pixi.js";
import type { Fleet, Legion, StarSystem } from "../state/types";
import { systemSpaceObjects } from "../state/spaceObjects";
import type { AnimClock, MapLod } from "./drawMapIcons";
import type { IconPlateStyle } from "./styles/mapTheme";
import { ACTIVITY_COLOR } from "./drawMapIcons";
import { toIso } from "./iso";
import {
  activityIconId,
  fleetKindIconId,
  getMapIconTexture,
  legionIconId,
  mapIconsReady,
  poiIconId,
  type MapIconId,
} from "./mapIconAssets";

/** Per-system flags for prioritized signal badge collection. */
export interface SystemSignalFlags {
  blockaded?: boolean;
  hasQuest?: boolean;
  economyBottleneck?: boolean;
}

type SignalEntry = { icon: MapIconId; tint: number; tag: string };

const POI_TINT: Record<string, number> = {
  anomaly: 0xc9a0ff,
  asteroid: 0xc4a882,
  nebula: 0x7fd4b0,
  debris: 0xb0b8c4,
  pirate: 0xe85d4c,
  hub: 0xe8c547,
  ruin: 0x9ca3af,
  minefield: 0xe8a54c,
  storm: 0x7b6cff,
  wormhole: 0xb388ff,
  black_hole: 0x6a7080,
  comet: 0x9ad0e8,
  pulsar: 0xffe08a,
  shipyard: 0x6ec8d9,
  outpost: 0xa8c0e0,
  fortress: 0xd4a574,
  beacon: 0xf0c14a,
  sanctuary: 0x5cdb95,
};

const ACTIVITY_TINT: Record<string, number> = {
  battle: ACTIVITY_COLOR.battle,
  trade: ACTIVITY_COLOR.trade,
  repair: ACTIVITY_COLOR.repair,
  garrison: ACTIVITY_COLOR.garrison,
  transit: ACTIVITY_COLOR.transit,
};

function drawIconPlate(
  plates: Graphics,
  bx: number,
  by: number,
  radius: number,
  plateStyle: IconPlateStyle,
  dimA: number,
): void {
  if (plateStyle === "holo-outline") {
    for (let i = 0; i <= 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const x = bx + Math.cos(a) * radius;
      const y = by + Math.sin(a) * radius;
      if (i === 0) plates.moveTo(x, y);
      else plates.lineTo(x, y);
    }
    plates.closePath();
    plates.fill({ color: 0x05070c, alpha: 0.04 * dimA });
    plates.stroke({
      color: 0x5fe3d0,
      width: 1,
      alpha: 0.72 * dimA,
    });
    return;
  }

  plates.circle(bx, by, radius);
  plates.fill({ color: 0x05070c, alpha: 0.22 * dimA });
  if (plateStyle === "imperial-rim") {
    plates.circle(bx, by, radius);
    plates.stroke({
      color: 0xc9a227,
      width: 0.8,
      alpha: 0.5 * dimA,
    });
  }
}

/** Priority: blockade > quest > economy > poi > activity (battle is separate marker). */
export function collectSystemSignals(
  s: StarSystem,
  flags: SystemSignalFlags,
  opts?: { skipQuest?: boolean },
): SignalEntry[] {
  const out: SignalEntry[] = [];

  if (flags.blockaded) {
    out.push({ icon: "sentry-gun", tint: 0xe8a54c, tag: "blockade" });
  }
  // Quest uses map pin by default — skip duplicate crystal badge
  if (flags.hasQuest && !opts?.skipQuest) {
    out.push({ icon: "crystal-ball", tint: 0xe8c547, tag: "quest" });
  }
  if (flags.economyBottleneck) {
    out.push({ icon: "coins", tint: 0xe85d5d, tag: "economy" });
  }

  for (const tag of systemSpaceObjects(s)) {
    if (tag === "quest") continue;
    const icon = poiIconId(tag);
    if (!icon) continue;
    out.push({
      icon,
      tint: POI_TINT[tag] ?? 0xa8c0e0,
      tag: `poi:${tag}`,
    });
  }

  if (s.activity && s.activity !== "none" && s.activity !== "battle") {
    const icon = activityIconId(s.activity);
    if (icon) {
      out.push({
        icon,
        tint: ACTIVITY_TINT[s.activity] ?? 0xa8b4c8,
        tag: `act:${s.activity}`,
      });
    }
  }

  return out;
}

type SpriteTag = Sprite & { __key?: string };

export interface UnitSpriteSlot {
  key: string;
  x: number;
  y: number;
  icon: MapIconId;
  tint: number;
  size: number;
  selected?: boolean;
  stackCount?: number;
}

/**
 * Overlay game-icons (CC BY) — resources, POI, fleets, legions.
 * Soft translucent plates only; glyphs stay transparent SVGs.
 */
type BobBase = { x: number; y: number; size: number; kind: "unit" | "battle" };

type CountTag = Text & { __key?: string };

export class MapIconOverlay {
  readonly root = new Container();
  private readonly plates = new Graphics();
  private readonly pool = new Map<string, SpriteTag>();
  private readonly countPool = new Map<string, CountTag>();
  /** Base positions for per-frame bob (no Graphics.clear). */
  private readonly bobBases = new Map<string, BobBase>();

  constructor() {
    this.root.eventMode = "none";
    this.root.addChild(this.plates);
  }

  private ensureCount(key: string): CountTag {
    let t = this.countPool.get(key);
    if (!t) {
      const dpr =
        typeof window !== "undefined"
          ? Math.min(2.5, window.devicePixelRatio || 1)
          : 2;
      t = new Text({
        text: "",
        resolution: dpr,
        roundPixels: true,
        style: {
          fontSize: 12,
          fill: 0xfff3c4,
          fontFamily: "ui-monospace, Consolas, 'Cascadia Mono', monospace",
          fontWeight: "800",
          letterSpacing: 0.4,
          stroke: { color: 0x06080e, width: 4, join: "round" },
          dropShadow: {
            color: 0x000000,
            alpha: 0.85,
            blur: 0,
            distance: 1,
            angle: Math.PI / 2,
          },
        },
      }) as CountTag;
      t.anchor.set(0.5, 0.5);
      t.__key = key;
      this.countPool.set(key, t);
      this.root.addChild(t);
    }
    return t;
  }

  private placeSignalBadge(
    key: string,
    icon: MapIconId,
    bx: number,
    by: number,
    tint: number,
    size: number,
    seen: Set<string>,
    dimA = 1,
    plateStyle: IconPlateStyle = "classic",
  ): void {
    seen.add(key);
    const sp = this.ensure(key, icon);
    if (!sp) return;
    const plateR = plateStyle === "holo-outline" ? size * 0.62 : size * 0.55;
    drawIconPlate(this.plates, bx, by, plateR, plateStyle, dimA);
    sp.visible = true;
    sp.tint = tint;
    sp.alpha = 0.85 * dimA;
    sp.width = size;
    sp.height = size;
    sp.position.set(bx, by);
    sp.rotation = 0;
  }

  /**
   * Cheap idle motion: nudge pooled unit/battle sprites only.
   * Call every ticker frame; geometry stays from last sync().
   */
  tickBob(anim: AnimClock): void {
    const t = anim.t;
    const pulse = anim.pulse;
    for (const [key, base] of this.bobBases) {
      const sp = this.pool.get(key);
      if (!sp?.visible) continue;
      if (base.kind === "battle") {
        const pulseScale = 1 + pulse * 0.04;
        sp.width = 15 * pulseScale;
        sp.height = 15 * pulseScale;
        sp.alpha = 0.82 + pulse * 0.08;
        sp.position.set(base.x, base.y - pulse * 0.6);
      } else {
        const bob = Math.sin(t * 2.4 + base.x * 0.01) * 1.15;
        sp.position.set(base.x, base.y + bob);
        sp.alpha = 0.9 + pulse * 0.06;
      }
    }
  }

  /**
   * Override screen position for units mid-transit (smooth move between
   * systems). Call every ticker frame, after tickBob, so it wins for any
   * key present. Geometry/tint/size stay from the last sync().
   */
  overridePositions(overrides: Map<string, { x: number; y: number }>): void {
    for (const [key, pos] of overrides) {
      const sp = this.pool.get(key);
      if (!sp?.visible) continue;
      sp.position.set(pos.x, pos.y);
    }
  }

  sync(
    systems: StarSystem[],
    anim: AnimClock,
    opts: {
      battleMarkerIds: Set<string>;
      unitSlots?: UnitSpriteSlot[];
      lod?: MapLod;
      /** Per-system signal flags (blockade, quest, economy). */
      signalFlags?: Map<string, SystemSignalFlags>;
      /** Fan layout: up to 4 icons, no +N. Default: priority stack. */
      signalFan?: boolean;
      /** Selected or hovered system — others dim; dense badges only here. */
      emphasisId?: string | null;
      /** Quest drawn as map pin — omit quest signal badge. */
      questAsPin?: boolean;
      /** Icon badge plate style from active map theme. */
      plateStyle?: IconPlateStyle;
    },
  ): void {
    this.plates.clear();
    if (!mapIconsReady()) {
      for (const s of this.pool.values()) s.visible = false;
      for (const t of this.countPool.values()) t.visible = false;
      return;
    }

    const lod = opts.lod ?? "near";
    const fan = !!opts.signalFan;
    const emphasisId = opts.emphasisId ?? null;
    const hasFocus = !!emphasisId;
    const questAsPin = opts.questAsPin !== false;
    const plateStyle = opts.plateStyle ?? "classic";
    const signalCap = fan
      ? lod === "far"
        ? 0
        : 4
      : lod === "near"
        ? 1
        : lod === "mid"
          ? 1
          : 0;

    const seen = new Set<string>();
    const seenCounts = new Set<string>();
    this.bobBases.clear();

    for (const s of systems) {
      const p = toIso(s.x, s.y);
      const flags = opts.signalFlags?.get(s.id) ?? {};
      // Strict focus: without hover/select nobody is "emphasized"
      // (old `!hasFocus || …` made EVERY system emph → yellow counts everywhere)
      const emph = hasFocus && s.id === emphasisId;
      const dimA = !hasFocus || emph ? 1 : 0.32;
      const cap =
        emph && lod === "near" ? (fan ? signalCap : 2) : signalCap;

      if (opts.battleMarkerIds.has(s.id)) {
        const key = `battle:${s.id}`;
        seen.add(key);
        const sp = this.ensure(key, "crossed-swords");
        if (sp) {
          const pulse = 1 + anim.pulse * 0.04;
          sp.visible = true;
          sp.tint = 0xf2d6c8;
          sp.alpha = (0.82 + anim.pulse * 0.08) * dimA;
          sp.width = 15 * pulse;
          sp.height = 15 * pulse;
          const bx = p.x;
          const by = p.y - 34;
          sp.position.set(bx, by - anim.pulse * 0.6);
          sp.rotation = 0;
          this.bobBases.set(key, { x: bx, y: by, size: 15, kind: "battle" });
        }
      }

      if (cap > 0) {
        const signals = collectSystemSignals(s, flags, {
          skipQuest: questAsPin,
        });
        const visible = signals.slice(0, cap);
        const overflow = fan ? 0 : signals.length - visible.length;
        const sigSize = emph ? 10 : 9;
        const sigGap = fan ? 12 : 13;
        const baseX = p.x + 18;
        const baseY = p.y - 24;

        for (let i = 0; i < visible.length; i++) {
          const sig = visible[i]!;
          const key = `sig:${s.id}:${sig.tag}`;
          const ox = fan
            ? baseX + Math.cos((-0.9 + i * 0.45) * Math.PI) * 16
            : baseX + i * sigGap;
          const oy = fan
            ? baseY + Math.sin((-0.9 + i * 0.45) * Math.PI) * 10
            : baseY;
          this.placeSignalBadge(
            key,
            sig.icon,
            ox,
            oy,
            sig.tint,
            sigSize,
            seen,
            dimA,
            plateStyle,
          );
        }

        // +N only on focused near — keeps mid map calm
        if (overflow > 0 && emph && lod === "near") {
          const ck = `sigcnt:${s.id}`;
          seenCounts.add(ck);
          const ct = this.ensureCount(ck);
          ct.text = `+${overflow}`;
          ct.visible = true;
          ct.alpha = dimA;
          const cx = baseX + visible.length * sigGap + 6;
          const cy = baseY;
          this.plates.roundRect(cx - 7, cy - 5.5, 14, 11, 3);
          this.plates.fill({ color: 0x0a0c12, alpha: 0.72 * dimA });
          this.plates.roundRect(cx - 7, cy - 5.5, 14, 11, 3);
          this.plates.stroke({ width: 1, color: 0xa8b4c8, alpha: 0.45 * dimA });
          ct.position.set(cx, cy);
        }
      }

      // Resources: quiet ore glyph on near; count plate only on focus
      if (lod === "near" && (s.resources?.length ?? 0) > 0) {
        const n = s.resources!.length;
        const key = `res:${s.id}`;
        const bx = p.x - 20;
        const by = p.y - 16;
        const r = emph ? 7.5 : 6.5;
        if (plateStyle === "holo-outline") {
          drawIconPlate(this.plates, bx, by, r, plateStyle, dimA);
        } else {
          this.plates.circle(bx, by, r);
          this.plates.fill({ color: 0x0a0c12, alpha: (emph ? 0.55 : 0.35) * dimA });
          this.plates.circle(bx, by, r);
          this.plates.stroke({
            width: plateStyle === "imperial-rim" ? 0.8 : 1,
            color: 0xc9a227,
            alpha: (emph ? 0.7 : 0.4) * dimA,
          });
        }
        seen.add(key);
        const ore = this.ensure(key, "ore");
        if (ore) {
          ore.visible = true;
          ore.tint = 0xffe08a;
          ore.alpha = (emph ? 0.9 : 0.55) * dimA;
          ore.width = emph ? 11 : 9;
          ore.height = emph ? 11 : 9;
          ore.position.set(bx, by);
          ore.rotation = 0;
        }

        if (emph) {
          const ck = `rescnt:${s.id}`;
          seenCounts.add(ck);
          const ct = this.ensureCount(ck);
          ct.text = String(n);
          ct.visible = true;
          ct.alpha = 0.95;
          const cx = bx + 10;
          const cy = by + 6;
          const plateW = n >= 10 ? 15 : 12;
          this.plates.roundRect(cx - plateW / 2, cy - 5.5, plateW, 11, 3);
          this.plates.fill({ color: 0x0a0c12, alpha: 0.78 });
          this.plates.roundRect(cx - plateW / 2, cy - 5.5, plateW, 11, 3);
          this.plates.stroke({ width: 1, color: 0xe8c547, alpha: 0.7 });
          ct.position.set(cx, cy);
        }
      }
    }

    for (const slot of opts.unitSlots ?? []) {
      seen.add(slot.key);
      const sp = this.ensure(slot.key, slot.icon);
      if (!sp) continue;
      if (slot.selected) {
        this.plates.circle(slot.x, slot.y, slot.size * 0.72);
        this.plates.stroke({
          width: 1.5,
          color: 0xe8c547,
          alpha: 0.85,
        });
      }
      this.plates.circle(slot.x, slot.y + slot.size * 0.35, slot.size * 0.38);
      this.plates.fill({ color: 0x000000, alpha: 0.28 });
      sp.visible = true;
      sp.tint = slot.tint;
      sp.alpha = 0.95;
      sp.width = slot.size;
      sp.height = slot.size;
      sp.position.set(slot.x, slot.y);
      sp.rotation = 0;
      this.bobBases.set(slot.key, {
        x: slot.x,
        y: slot.y,
        size: slot.size,
        kind: "unit",
      });
    }

    for (const [key, sp] of this.pool) {
      if (!seen.has(key)) sp.visible = false;
    }
    for (const [key, t] of this.countPool) {
      if (!seenCounts.has(key)) t.visible = false;
    }
  }

  private ensure(key: string, icon: MapIconId): SpriteTag | null {
    let sp = this.pool.get(key);
    if (sp) {
      const tex = getMapIconTexture(icon);
      if (tex && sp.texture !== tex) sp.texture = tex;
      return sp;
    }
    const tex = getMapIconTexture(icon);
    if (!tex) return null;
    sp = new Sprite(tex) as SpriteTag;
    sp.anchor.set(0.5);
    sp.__key = key;
    this.pool.set(key, sp);
    this.root.addChild(sp);
    return sp;
  }

  destroy(): void {
    this.pool.clear();
    this.countPool.clear();
    this.bobBases.clear();
    // plates is a child of root — one destroy walks the whole tree
    if (!this.root.destroyed) {
      this.root.destroy({ children: true });
    }
  }
}

export function fleetSlotIcon(kind: Fleet["kind"] | undefined): MapIconId {
  return fleetKindIconId(kind ?? "combat");
}

export function legionSlotIcon(status: Legion["status"]): MapIconId {
  return legionIconId(status);
}
