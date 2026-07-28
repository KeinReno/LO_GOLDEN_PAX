/** Client catalog from GET /api/content (P1). Falls back to local defaults. */
import {
  RESOURCE_POOL as FALLBACK_RESOURCES,
  SHIP_TYPES as FALLBACK_SHIPS,
  SYSTEM_POI_LABELS as FALLBACK_POI,
} from "./defaults";

export type PublicContent = {
  ships?: Record<string, { id: string; name: string }>;
  map_resources?: Record<string, { id: string; name: string }>;
  pois?: Record<string, { label?: string; name?: string }>;
  rules?: { apPerTurn?: number };
  intents?: Record<string, { ap?: number }>;
  buildings?: Record<
    string,
    {
      id: string;
      kind: string;
      zone: "surface" | "orbital";
      name: string;
      ap?: number;
      cost?: Record<string, number>;
      maxPerPlanet?: number;
    }
  >;
  colonies?: Record<
    string,
    {
      id: string;
      colonyType: string;
      name: string;
      colonizeAp?: number;
      colonizeCost?: Record<string, number>;
      setTypeAp?: number;
      setTypeCost?: Record<string, number>;
    }
  >;
  loadedAt?: string;
};

let cached: PublicContent | null = null;
let loading: Promise<PublicContent | null> | null = null;

export async function fetchContent(force = false): Promise<PublicContent | null> {
  if (cached && !force) return cached;
  if (loading && !force) return loading;
  loading = (async () => {
    try {
      const res = await fetch("/api/content");
      if (!res.ok) return null;
      cached = (await res.json()) as PublicContent;
      return cached;
    } catch {
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function getCachedContent(): PublicContent | null {
  return cached;
}

export function shipTypeNames(): string[] {
  const ships = cached?.ships;
  if (ships && Object.keys(ships).length > 0) {
    return Object.values(ships).map((s) => s.name);
  }
  return [...FALLBACK_SHIPS];
}

export function resourcePoolNames(): string[] {
  const m = cached?.map_resources;
  if (m && Object.keys(m).length > 0) {
    return Object.values(m).map((r) => r.name);
  }
  return [...FALLBACK_RESOURCES];
}

export function poiLabels(): Record<string, string> {
  const pois = cached?.pois;
  if (pois && Object.keys(pois).length > 0) {
    const out: Record<string, string> = { none: "Обычная" };
    for (const [k, v] of Object.entries(pois)) {
      out[k] = v.label || v.name || k;
    }
    return out;
  }
  return { ...FALLBACK_POI };
}

export function apPerTurn(): number {
  return cached?.rules?.apPerTurn ?? 3;
}
