import { Assets, Texture } from "pixi.js";
import { RESOURCE_ICON_SLUGS } from "../state/resourcePool.generated";

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
  | "sanctuary"
  | (string & {});

const ICON_PATHS: Record<string, string> = {
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

/** Unique per-resource glyphs (generated). Registered into ICON_PATHS below. */
const RESOURCE_ICON_PATHS: Record<string, string> = {};
for (const slug of Object.values(RESOURCE_ICON_SLUGS)) {
  const id = `res-${slug}`;
  RESOURCE_ICON_PATHS[id] = `/icons/game/resources/${slug}.svg`;
  ICON_PATHS[id] = RESOURCE_ICON_PATHS[id];
}

/** Resource name (RU) → dedicated icon id. */
export const RESOURCE_ICON: Record<string, MapIconId> = Object.fromEntries(
  Object.entries(RESOURCE_ICON_SLUGS).map(([name, slug]) => [
    name,
    `res-${slug}` as MapIconId,
  ]),
);

/** Soft white tint — color is baked into each resource SVG. */
export const RESOURCE_TINT: Record<string, number> = Object.fromEntries(
  Object.keys(RESOURCE_ICON_SLUGS).map((name) => [name, 0xffffff]),
);

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
  // WebView2/Tauri can hang on Assets.load — don't block the map forever.
  await Promise.race([
    loadPromise,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 6000);
    }),
  ]);
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

/** Public URL for DOM/SVG (same assets as the galaxy map). */
export function mapIconUrl(id: MapIconId | string | null | undefined): string | null {
  if (!id) return null;
  return ICON_PATHS[id] ?? null;
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
  const mapped = RESOURCE_ICON[resource];
  if (mapped) return mapped;
  // Fallback for legacy / uncatalogued names: still try slug path if registered
  const slug = RESOURCE_ICON_SLUGS[resource];
  if (slug) return `res-${slug}` as MapIconId;
  return "ore";
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
    case "refugees":
      return "cargo";
    case "quarantine":
      return "radar-sweep";
    case "depot":
      return "watchtower";
    case "propaganda":
      return "lighthouse";
    case "frontline":
      return "crossed-swords";
    case "forge":
      return "wrench";
    case "mining_platform":
      return "ore";
    case "abandoned_station":
      return "ruin";
    case "science_arch":
      return "crystal-ball";
    case "agronomy":
      return "sprout";
    case "biocupola":
      return "sanctuary";
    case "hydro_lab":
      return "water-drop";
    case "security_post":
      return "sentry-gun";
    case "grav_field":
      return "vortex";
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
