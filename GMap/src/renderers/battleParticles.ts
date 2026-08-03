import { Emitter, type EmitterConfigV3 } from "@spd789562/particle-emitter";
import { ParticleContainer, Texture } from "pixi.js";
import { toIso } from "./iso";

export interface BattleSite {
  id: string;
  x: number;
  y: number;
}

/** Soft ember drift on debris / ruin scars (P8.4). */
function scarConfig(texture: Texture): EmitterConfigV3 {
  return {
    lifetime: { min: 0.8, max: 1.6 },
    frequency: 0.22,
    spawnChance: 0.45,
    particlesPerWave: 1,
    maxParticles: 14,
    pos: { x: 0, y: 0 },
    addAtBack: true,
    behaviors: [
      {
        type: "alpha",
        config: {
          alpha: {
            list: [
              { value: 0.38, time: 0 },
              { value: 0.12, time: 0.55 },
              { value: 0, time: 1 },
            ],
          },
        },
      },
      {
        type: "scale",
        config: {
          scale: {
            list: [
              { value: 0.14, time: 0 },
              { value: 0.06, time: 1 },
            ],
          },
        },
      },
      {
        type: "color",
        config: {
          color: {
            list: [
              { value: "ffb870", time: 0 },
              { value: "e85d4c", time: 0.45 },
              { value: "3a1810", time: 1 },
            ],
          },
        },
      },
      {
        type: "moveSpeed",
        config: {
          speed: {
            list: [
              { value: 10, time: 0 },
              { value: 2, time: 1 },
            ],
          },
        },
      },
      {
        type: "rotationStatic",
        config: { min: 0, max: 360 },
      },
      {
        type: "spawnShape",
        config: {
          type: "torus",
          data: {
            x: 0,
            y: 0,
            radius: 16,
            innerRadius: 6,
            affectRotation: true,
          },
        },
      },
      {
        type: "textureSingle",
        config: { texture },
      },
    ],
  };
}

/** Tiny white-dot sparks — never use comic explosion art as particle texture. */
function battleConfig(texture: Texture): EmitterConfigV3 {
  return {
    lifetime: { min: 0.35, max: 0.7 },
    frequency: 0.08,
    spawnChance: 0.7,
    particlesPerWave: 1,
    maxParticles: 28,
    pos: { x: 0, y: 0 },
    addAtBack: false,
    behaviors: [
      {
        type: "alpha",
        config: {
          alpha: {
            list: [
              { value: 0.55, time: 0 },
              { value: 0.05, time: 1 },
            ],
          },
        },
      },
      {
        type: "scale",
        config: {
          scale: {
            list: [
              { value: 0.08, time: 0 },
              { value: 0.02, time: 1 },
            ],
          },
        },
      },
      {
        type: "color",
        config: {
          color: {
            list: [
              { value: "ffe8b0", time: 0 },
              { value: "e85d4c", time: 0.55 },
              { value: "4a1812", time: 1 },
            ],
          },
        },
      },
      {
        type: "moveSpeed",
        config: {
          speed: {
            list: [
              { value: 28, time: 0 },
              { value: 6, time: 1 },
            ],
          },
        },
      },
      {
        type: "rotationStatic",
        config: { min: 0, max: 360 },
      },
      {
        type: "spawnShape",
        config: {
          type: "torus",
          data: {
            x: 0,
            y: 0,
            radius: 10,
            innerRadius: 3,
            affectRotation: true,
          },
        },
      },
      {
        type: "textureSingle",
        config: { texture },
      },
    ],
  };
}

/**
 * Subtle ember field around contested / battle systems.
 */
export class BattleParticleField {
  readonly container: ParticleContainer;
  private readonly emitters = new Map<string, Emitter>();
  private readonly texture: Texture;
  private enabled = true;

  constructor(texture?: Texture) {
    this.texture = texture ?? Texture.WHITE;
    this.container = new ParticleContainer({
      dynamicProperties: {
        position: true,
        rotation: true,
        scale: true,
        color: true,
      },
    });
    this.container.eventMode = "none";
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.container.visible = on;
    if (!on) {
      for (const em of this.emitters.values()) {
        em.emit = false;
        em.cleanup();
      }
    }
  }

  sync(sites: BattleSite[], dt: number): void {
    if (!this.enabled) return;

    const alive = new Set(sites.map((s) => s.id));
    for (const [id, em] of this.emitters) {
      if (!alive.has(id)) {
        em.destroy();
        this.emitters.delete(id);
      }
    }

    for (const site of sites) {
      const iso = toIso(site.x, site.y);
      let em = this.emitters.get(site.id);
      if (!em) {
        const cfg = site.id.startsWith("scar:")
          ? scarConfig(this.texture)
          : battleConfig(this.texture);
        em = new Emitter(this.container, cfg);
        em.emit = true;
        this.emitters.set(site.id, em);
      }
      em.updateOwnerPos(iso.x, iso.y - 2);
      em.update(dt);
    }
  }

  destroy(): void {
    for (const em of this.emitters.values()) em.destroy();
    this.emitters.clear();
    this.container.destroy({ children: true });
  }
}
