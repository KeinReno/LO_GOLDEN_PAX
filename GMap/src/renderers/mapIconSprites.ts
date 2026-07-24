import { Container, Graphics, Sprite } from "pixi.js";
import type { Fleet, Legion, StarSystem } from "../state/types";
import { systemSpaceObjects } from "../state/spaceObjects";
import type { AnimClock } from "./drawMapIcons";
import { toIso } from "./iso";
import {
  activityIconId,
  fleetKindIconId,
  getMapIconTexture,
  legionIconId,
  mapIconsReady,
  poiIconId,
  resourceIconId,
  RESOURCE_TINT,
  type MapIconId,
} from "./mapIconAssets";

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
export class MapIconOverlay {
  readonly root = new Container();
  private readonly plates = new Graphics();
  private readonly pool = new Map<string, SpriteTag>();

  constructor() {
    this.root.eventMode = "none";
    this.root.addChild(this.plates);
  }

  sync(
    systems: StarSystem[],
    anim: AnimClock,
    opts: {
      battleMarkerIds: Set<string>;
      unitSlots?: UnitSpriteSlot[];
    },
  ): void {
    this.plates.clear();
    if (!mapIconsReady()) {
      for (const s of this.pool.values()) s.visible = false;
      return;
    }

    const seen = new Set<string>();

    for (const s of systems) {
      const p = toIso(s.x, s.y);

      if (opts.battleMarkerIds.has(s.id)) {
        const key = `battle:${s.id}`;
        seen.add(key);
        const sp = this.ensure(key, "crossed-swords");
        if (sp) {
          const pulse = 1 + anim.pulse * 0.04;
          sp.visible = true;
          sp.tint = 0xf2d6c8;
          sp.alpha = 0.82 + anim.pulse * 0.08;
          sp.width = 15 * pulse;
          sp.height = 15 * pulse;
          sp.position.set(p.x, p.y - 34 - anim.pulse * 0.6);
          sp.rotation = 0;
        }
      }

      if (s.activity && s.activity !== "none") {
        const icon = activityIconId(s.activity);
        if (icon) {
          const key = `act:${s.id}`;
          seen.add(key);
          const sp = this.ensure(key, icon);
          if (sp) {
            const color =
              s.activity === "battle"
                ? 0xe85d4c
                : s.activity === "trade"
                  ? 0xf0c14a
                  : s.activity === "repair"
                    ? 0x6ec8d9
                    : s.activity === "garrison"
                      ? 0x5cdb95
                      : 0xa8b4c8;
            const bx = p.x - 22;
            const by = p.y - 26;
            this.plates.circle(bx, by, 8);
            this.plates.fill({ color: 0x05070c, alpha: 0.35 });
            sp.visible = true;
            sp.tint = color;
            sp.alpha = 0.92;
            sp.width = 12;
            sp.height = 12;
            sp.position.set(bx, by);
            sp.rotation = 0;
          }
        }
      }

      const spaceTags = systemSpaceObjects(s).filter((t) => t !== "quest");
      const nTags = Math.min(spaceTags.length, 5);
      for (let i = 0; i < nTags; i++) {
        const tag = spaceTags[i]!;
        const icon = poiIconId(tag);
        if (!icon) continue;
        const key = `poi:${s.id}:${tag}`;
        seen.add(key);
        const sp = this.ensure(key, icon);
        if (!sp) continue;
        const tint =
          tag === "anomaly"
            ? 0xc9a0ff
            : tag === "asteroid"
              ? 0xc4a882
              : tag === "nebula"
                ? 0x7fd4b0
                : tag === "debris"
                  ? 0xb0b8c4
                  : tag === "pirate"
                    ? 0xe85d4c
                    : tag === "hub"
                      ? 0xe8c547
                      : tag === "ruin"
                        ? 0x9ca3af
                        : tag === "minefield"
                          ? 0xe8a54c
                          : tag === "storm"
                            ? 0x7b6cff
                            : tag === "wormhole"
                              ? 0xb388ff
                              : tag === "black_hole"
                                ? 0x6a7080
                                : tag === "comet"
                                  ? 0x9ad0e8
                                  : tag === "pulsar"
                                    ? 0xffe08a
                                    : tag === "shipyard"
                                      ? 0x6ec8d9
                                      : tag === "outpost"
                                        ? 0xa8c0e0
                                        : tag === "fortress"
                                          ? 0xd4a574
                                          : tag === "beacon"
                                            ? 0xf0c14a
                                            : tag === "sanctuary"
                                              ? 0x5cdb95
                                              : 0xa8c0e0;
        const bx = p.x + 18 + i * 13;
        const by = p.y - 22;
        this.plates.circle(bx, by, 7);
        this.plates.fill({ color: 0x05070c, alpha: 0.28 });
        sp.visible = true;
        sp.tint = tint;
        sp.alpha = 0.92;
        sp.width = 11;
        sp.height = 11;
        sp.position.set(bx, by);
        sp.rotation = 0;
      }

      const resources = s.resources ?? [];
      const n = Math.min(resources.length, 5);
      if (n > 0) {
        const icon = 12;
        const gap = 2;
        const padX = 4;
        const padY = 3;
        const w = padX * 2 + n * icon + (n - 1) * gap;
        const h = padY * 2 + icon;
        const ox = p.x - 16 - w;
        const oy = p.y + 6;
        // Soft glass plate — no gold frame
        this.plates.roundRect(ox, oy, w, h, 5);
        this.plates.fill({ color: 0x05070c, alpha: 0.38 });

        for (let i = 0; i < n; i++) {
          const res = resources[i]!;
          const key = `res:${s.id}:${i}`;
          seen.add(key);
          const sp = this.ensure(key, resourceIconId(res));
          if (sp) {
            const cx = ox + padX + icon / 2 + i * (icon + gap);
            const cy = oy + padY + icon / 2;
            sp.visible = true;
            sp.tint = RESOURCE_TINT[res] ?? 0xffe08a;
            sp.alpha = 0.95;
            sp.width = icon;
            sp.height = icon;
            sp.position.set(cx, cy);
            sp.rotation = 0;
          }
        }
      }
    }

    for (const slot of opts.unitSlots ?? []) {
      seen.add(slot.key);
      const sp = this.ensure(slot.key, slot.icon);
      if (!sp) continue;
      if (slot.selected) {
        this.plates.circle(slot.x, slot.y, slot.size * 0.72);
        this.plates.stroke({ width: 1.5, color: 0xe8c547, alpha: 0.85 });
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
    }

    for (const [key, sp] of this.pool) {
      if (!seen.has(key)) sp.visible = false;
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
    for (const sp of this.pool.values()) sp.destroy();
    this.pool.clear();
    this.plates.destroy();
    this.root.destroy({ children: true });
  }
}

export function fleetSlotIcon(kind: Fleet["kind"] | undefined): MapIconId {
  return fleetKindIconId(kind ?? "combat");
}

export function legionSlotIcon(status: Legion["status"]): MapIconId {
  return legionIconId(status);
}
