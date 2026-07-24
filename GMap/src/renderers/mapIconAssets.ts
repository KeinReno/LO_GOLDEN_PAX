import { Assets, Texture } from "pixi.js";

/** Game-icons.net (CC-BY) — local copies under public/icons/game. */
export type MapIconId =
  | "crossed-swords"
  | "rocket"
  | "spaceship"
  | "coins"
  | "shield"
  | "wrench"
  | "explosion-rays"
  | "flying-flag"
  | "radar-sweep"
  | "missile-swarm"
  | "planet-core"
  | "cargo"
  | "star-flare"
  | "ore"
  | "metal-bar"
  | "crystal-growth"
  | "water-drop"
  | "atom"
  | "fog"
  | "minerals"
  | "alien-egg"
  | "asteroid"
  | "vortex"
  | "ruin"
  | "sprout"
  | "gas-mask"
  | "ember-shot"
  |   "crystal-ball"
  | "helmet"
  | "banner"
  | "fighter"
  | "troop"
  | "spear"
  | "skull-crossed-bones"
  | "cruiser"
  | "starfighter"
  | "sentry-gun"
  | "interceptor"
  | "space-shuttle"
  | "cargo-ship"
  | "space-fighter"
  | "scout-ship"
  | "satellite"
  | "rocket-thruster"
  | "black-hole"
  | "comet"
  | "pulsar-star"
  | "portal"
  | "castle"
  | "watchtower"
  | "lighthouse"
  | "sanctuary";

const ICON_PATHS: Record<MapIconId, string> = {
  "crossed-swords": "/icons/game/crossed-swords.svg",
  rocket: "/icons/game/rocket.svg",
  spaceship: "/icons/game/spaceship.svg",
  coins: "/icons/game/coins.svg",
  shield: "/icons/game/shield.svg",
  wrench: "/icons/game/wrench.svg",
  "explosion-rays": "/icons/game/explosion-rays.svg",
  "flying-flag": "/icons/game/flying-flag.svg",
  "radar-sweep": "/icons/game/radar-sweep.svg",
  "missile-swarm": "/icons/game/missile-swarm.svg",
  "planet-core": "/icons/game/planet-core.svg",
  cargo: "/icons/game/cargo.svg",
  "star-flare": "/icons/game/star-flare.svg",
  ore: "/icons/game/ore.svg",
  "metal-bar": "/icons/game/metal-bar.svg",
  "crystal-growth": "/icons/game/crystal-growth.svg",
  "water-drop": "/icons/game/water-drop.svg",
  atom: "/icons/game/atom.svg",
  fog: "/icons/game/fog.svg",
  minerals: "/icons/game/minerals.svg",
  "alien-egg": "/icons/game/alien-egg.svg",
  asteroid: "/icons/game/asteroid.svg",
  vortex: "/icons/game/vortex.svg",
  ruin: "/icons/game/ruin.svg",
  sprout: "/icons/game/sprout.svg",
  "gas-mask": "/icons/game/gas-mask.svg",
  "ember-shot": "/icons/game/ember-shot.svg",
  "crystal-ball": "/icons/game/crystal-ball.svg",
  helmet: "/icons/game/helmet.svg",
  banner: "/icons/game/banner.svg",
  fighter: "/icons/game/fighter.svg",
  troop: "/icons/game/troop.svg",
  spear: "/icons/game/spear.svg",
  "skull-crossed-bones": "/icons/game/skull-crossed-bones.svg",
  cruiser: "/icons/game/cruiser.svg",
  starfighter: "/icons/game/starfighter.svg",
  "sentry-gun": "/icons/game/sentry-gun.svg",
  interceptor: "/icons/game/interceptor.svg",
  "space-shuttle": "/icons/game/space-shuttle.svg",
  "cargo-ship": "/icons/game/cargo-ship.svg",
  "space-fighter": "/icons/game/space-fighter.svg",
  "scout-ship": "/icons/game/scout-ship.svg",
  satellite: "/icons/game/satellite.svg",
  "rocket-thruster": "/icons/game/rocket-thruster.svg",
  "black-hole": "/icons/game/black-hole.svg",
  comet: "/icons/game/comet.svg",
  "pulsar-star": "/icons/game/pulsar-star.svg",
  portal: "/icons/game/portal.svg",
  castle: "/icons/game/castle.svg",
  watchtower: "/icons/game/watchtower.svg",
  lighthouse: "/icons/game/lighthouse.svg",
  sanctuary: "/icons/game/sanctuary.svg",
};

/** Resource name (RU, as in RESOURCE_POOL) → map glyph. */
export const RESOURCE_ICON: Record<string, MapIconId> = {
  железо: "ore",
  титан: "metal-bar",
  кристаллы: "crystal-growth",
  газ: "fog",
  вода: "water-drop",
  редкоземы: "minerals",
  антиматерия: "atom",
  реликты: "alien-egg",
};

export const RESOURCE_TINT: Record<string, number> = {
  железо: 0xb0b8c4,
  титан: 0x9ad0e8,
  кристаллы: 0xc9a0ff,
  газ: 0x7fd4b0,
  вода: 0x5eb0e8,
  редкоземы: 0xe8c547,
  антиматерия: 0xff6b9d,
  реликты: 0xd4a574,
};

let loadPromise: Promise<void> | null = null;
let ready = false;

export function mapIconsReady(): boolean {
  return ready;
}

export async function ensureMapIconsLoaded(): Promise<void> {
  if (ready) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      const paths = Object.values(ICON_PATHS);
      await Assets.load(paths);
      ready = true;
    })().catch((err) => {
      loadPromise = null;
      ready = false;
      console.warn("[GMap] map icons failed to load", err);
    });
  }
  await loadPromise;
}

export function getMapIconTexture(id: MapIconId): Texture | null {
  if (!ready) return null;
  try {
    const t = Assets.get<Texture>(ICON_PATHS[id]);
    return t ?? null;
  } catch {
    return null;
  }
}

export function activityIconId(activity: string): MapIconId | null {
  switch (activity) {
    case "battle":
      return "crossed-swords";
    case "trade":
      return "coins";
    case "repair":
      return "wrench";
    case "garrison":
      return "shield";
    case "transit":
      return "rocket";
    default:
      return null;
  }
}

export function resourceIconId(resource: string): MapIconId {
  return RESOURCE_ICON[resource] ?? "ore";
}

export function poiIconId(poi: string): MapIconId | null {
  switch (poi) {
    case "anomaly":
      return "vortex";
    case "asteroid":
      return "asteroid";
    case "nebula":
      return "fog";
    case "debris":
      return "ember-shot";
    case "pirate":
      return "skull-crossed-bones";
    case "hub":
      return "cargo";
    case "ruin":
      return "ruin";
    case "dead_zone":
      return "radar-sweep";
    case "quest":
      return "crystal-ball";
    case "minefield":
      return "sentry-gun";
    case "relay":
      return "radar-sweep";
    case "storm":
      return "star-flare";
    case "wormhole":
      return "portal";
    case "black_hole":
      return "black-hole";
    case "comet":
      return "comet";
    case "pulsar":
      return "pulsar-star";
    case "shipyard":
      return "wrench";
    case "outpost":
      return "watchtower";
    case "fortress":
      return "castle";
    case "beacon":
      return "lighthouse";
    case "sanctuary":
      return "sanctuary";
    default:
      return null;
  }
}

/** Fleet kind → distinct space silhouettes (not airplane/jet glyphs). */
export function fleetKindIconId(kind: string): MapIconId {
  switch (kind) {
    case "trade":
      return "cargo-ship";
    case "patrol":
      return "scout-ship";
    case "transport":
      return "cargo-ship";
    case "carrier":
      return "space-shuttle";
    case "support":
      return "satellite";
    case "combat":
    default:
      return "space-fighter";
  }
}

export function legionIconId(status: string): MapIconId {
  switch (status) {
    case "assault":
      return "crossed-swords";
    case "garrison":
    case "idle":
      return "flying-flag";
    case "fortify":
      return "shield";
    case "blockade":
      return "spear";
    case "move":
      return "troop";
    case "recovering":
      return "helmet";
    default:
      return "flying-flag";
  }
}
