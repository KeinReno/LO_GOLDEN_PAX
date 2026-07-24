import JSZip from "jszip";
import type { WorldState } from "../state/types";
import { SCHEMA_VERSION, createEmptyWorld } from "../state/defaults";
import { resolvePolityKind } from "../state/territory";

/**
 * Campaign is a multi-file ZIP (logical folder layout).
 * Paths are stable so AI/tools can edit individual JSON files later via Tauri.
 */
export async function exportCampaignZip(world: WorldState): Promise<Blob> {
  const zip = new JSZip();
  const root = zip.folder("campaign");
  if (!root) throw new Error("Не удалось создать архив");

  const payload = serializeCampaign(world);
  for (const [path, data] of Object.entries(payload)) {
    root.file(path, JSON.stringify(data, null, 2));
  }

  return zip.generateAsync({ type: "blob" });
}

export function serializeCampaign(world: WorldState): Record<string, unknown> {
  return {
    "meta.json": {
      ...world.meta,
      schemaVersion: SCHEMA_VERSION,
    },
    "map/systems.json": world.systems,
    "map/links.json": world.links,
    "map/sectors.json": world.sectors,
    "state/fleets.json": world.fleets,
    "state/legions.json": world.legions,
    "state/diplomacy.json": world.diplomacy,
    "state/orders.json": world.orders,
    "state/caravans.json": world.caravans ?? [],
    "state/quests.json": world.quests ?? [],
    "state/turn-history.json": world.turnHistory ?? [],
    "lexicon/factions.json": world.factions,
    "lexicon/races.json": world.races,
  };
}

function emptyMeta() {
  return createEmptyWorld().meta;
}

export function assembleWorld(parts: {
  meta?: WorldState["meta"];
  systems?: WorldState["systems"];
  links?: WorldState["links"];
  sectors?: WorldState["sectors"];
  fleets?: WorldState["fleets"];
  legions?: WorldState["legions"];
  diplomacy?: WorldState["diplomacy"];
  orders?: WorldState["orders"];
  turnHistory?: WorldState["turnHistory"];
  factions?: WorldState["factions"];
  races?: WorldState["races"];
  caravans?: WorldState["caravans"];
  quests?: WorldState["quests"];
}): WorldState {
  const base = createEmptyWorld(parts.meta?.name);
  return {
    ...base,
    meta: { ...base.meta, ...parts.meta },
    systems: (parts.systems ?? []).map((s) => ({
      ...s,
      kind: s.kind ?? ((s.stars?.length ?? 0) > 0 ? "stellar" : "corridor"),
      visibleToFactionIds: s.visibleToFactionIds ?? [],
      stars: s.stars ?? [],
      planets: (s.planets ?? []).map((p) => ({
        ...p,
        raceComposition: p.raceComposition ?? [],
        resources: p.resources ?? [],
        ownerFactionId: p.ownerFactionId ?? null,
        coOwnerFactionIds: p.coOwnerFactionIds ?? [],
        contested: p.contested ?? false,
      })),
      stations: s.stations ?? [],
      resources: s.resources ?? [],
      activity: s.activity ?? "none",
      tradeWithSystemId: s.tradeWithSystemId ?? null,
      sectorId: s.sectorId ?? null,
      notes: s.notes ?? "",
      isCapital: s.isCapital ?? false,
      poiType: s.poiType ?? "none",
      contested: s.contested ?? false,
      coOwnerFactionIds: s.coOwnerFactionIds ?? [],
    })),
    links: parts.links ?? [],
    sectors: parts.sectors ?? [],
    fleets: (parts.fleets ?? []).map((f) => ({
      ...f,
      kind: f.kind ?? "combat",
      route: f.route ?? [],
    })),
    legions: parts.legions ?? [],
    diplomacy: parts.diplomacy ?? [],
    orders: parts.orders ?? [],
    turnHistory: parts.turnHistory ?? [],
    factions: (parts.factions ?? base.factions).map((f) => ({
      ...f,
      kind: resolvePolityKind(f),
      neutralReputation: f.neutralReputation ?? 0,
    })),
    races: parts.races ?? base.races,
    caravans: parts.caravans ?? [],
    quests: parts.quests ?? [],
  };
}

export async function importCampaignZip(file: File): Promise<WorldState> {
  const zip = await JSZip.loadAsync(file);
  const read = async <T>(path: string, fallback: T): Promise<T> => {
    const candidates = [
      path,
      `campaign/${path}`,
      ...Object.keys(zip.files).filter((k) => k.endsWith(path)),
    ];
    for (const key of candidates) {
      const entry = zip.file(key);
      if (entry) {
        const text = await entry.async("string");
        return JSON.parse(text) as T;
      }
    }
    return fallback;
  };

  return assembleWorld({
    meta: await read("meta.json", emptyMeta()),
    systems: await read("map/systems.json", []),
    links: await read("map/links.json", []),
    sectors: await read("map/sectors.json", []),
    fleets: await read("state/fleets.json", []),
    legions: await read("state/legions.json", []),
    diplomacy: await read("state/diplomacy.json", []),
    orders: await read("state/orders.json", []),
    caravans: await read("state/caravans.json", []),
    quests: await read("state/quests.json", []),
    turnHistory: await read("state/turn-history.json", []),
    factions: await read("lexicon/factions.json", undefined),
    races: await read("lexicon/races.json", undefined),
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Path-keyed JSON (portable multi-file layout in one blob). */
export function exportCampaignJson(world: WorldState): Blob {
  return new Blob([JSON.stringify(serializeCampaign(world), null, 2)], {
    type: "application/json",
  });
}

/** Flat WorldState JSON — same format as lore / publish / localStorage draft. */
export function exportWorldStateJson(world: WorldState): Blob {
  return new Blob([JSON.stringify(world, null, 2)], {
    type: "application/json",
  });
}

export function parseWorldJson(data: unknown): WorldState {
  const obj = data as Record<string, unknown>;
  if (obj && obj.systems && obj.meta) {
    return assembleWorld(obj as unknown as WorldState);
  }
  if (obj && typeof obj === "object") {
    const get = <T>(path: string, fallback: T): T => {
      if (path in obj) return obj[path] as T;
      return fallback;
    };
    return assembleWorld({
      meta: get("meta.json", emptyMeta()),
      systems: get("map/systems.json", []),
      links: get("map/links.json", []),
      sectors: get("map/sectors.json", []),
      fleets: get("state/fleets.json", []),
      legions: get("state/legions.json", []),
      diplomacy: get("state/diplomacy.json", []),
      orders: get("state/orders.json", []),
      caravans: get("state/caravans.json", []),
      quests: get("state/quests.json", []),
      turnHistory: get("state/turn-history.json", []),
      factions: get("lexicon/factions.json", undefined),
      races: get("lexicon/races.json", undefined),
    });
  }
  throw new Error("Неизвестный формат JSON кампании");
}

export async function importCampaignJson(file: File): Promise<WorldState> {
  const text = await file.text();
  return parseWorldJson(JSON.parse(text));
}
