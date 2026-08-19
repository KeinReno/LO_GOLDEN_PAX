/**
 * Client-side resource index + slot matcher (mirror of server/slotResolver.mjs).
 * Deposits come from PublicContent.map_resources; outfit fills also see content.modules.
 *
 * Property unlock gating: server is SoT (techActions.mjs); client preview in techGate.ts.
 */
import type { MapResourceDef } from "./contentCatalog";

export type IndexedResource = {
  id: string;
  name: string;
  category: "A" | "B" | "C" | "D" | "E" | "F" | null;
  tier: number | null;
  properties: string[];
  toxic: boolean;
  biome_tags: string[];
  kind?: string | null;
  theater?: string | null;
  notDeposit?: boolean;
  stub?: boolean;
};

export type ResourceIndex = {
  all: IndexedResource[];
  byCategory: Record<string, IndexedResource[]>;
  /** Planet deposits only — excludes crafted modules merged into map_resources. */
  byCategoryDeposits: Record<string, IndexedResource[]>;
  byTier: Record<number, IndexedResource[]>;
};

type ResourceLike = {
  id?: string;
  resourceId?: string;
  kind?: string | null;
  notDeposit?: boolean;
  stub?: boolean;
  category?: string | null;
};

export function isCraftedModule(resource: ResourceLike | null | undefined): boolean {
  if (!resource) return false;
  const id = resource.id || resource.resourceId || "";
  return resource.kind === "module" || String(id).startsWith("module.");
}

/** Outfit catalog = deposits + crafted modules (modules are a separate content bag). */
export function outfitResourceBag(
  content:
    | {
        map_resources?: Record<string, MapResourceDef>;
        modules?: Record<string, MapResourceDef>;
      }
    | null
    | undefined,
): Record<string, MapResourceDef> {
  return {
    ...(content?.map_resources || {}),
    ...(content?.modules || {}),
  };
}

export function lookupContentResource(
  content:
    | {
        map_resources?: Record<string, MapResourceDef>;
        modules?: Record<string, MapResourceDef>;
      }
    | null
    | undefined,
  id: string | null | undefined,
): MapResourceDef | undefined {
  if (!id || !content) return undefined;
  return content.map_resources?.[id] || content.modules?.[id];
}

/** Map tile / planet deposit — not a ship/ground outfit card. */
export function isMapDeposit(resource: ResourceLike | null | undefined): boolean {
  if (!resource) return false;
  if (resource.notDeposit) return false;
  if (resource.category === null) return false;
  return !isCraftedModule(resource);
}

const STUB_DEPOSIT_IDS = new Set([
  "map.energy",
  "map.buildplex",
  "map.trade_value",
  "map.alloys",
]);

/** Real mineable catalog — stubs stay in content for old tiles, but are not painted. */
export function isPaintDeposit(resource: ResourceLike | null | undefined): boolean {
  if (!isMapDeposit(resource)) return false;
  if (resource?.stub) return false;
  const id = resource?.id || resource?.resourceId || "";
  return !STUB_DEPOSIT_IDS.has(id);
}

export function buildResourceIndex(
  mapResources: Record<string, MapResourceDef> | undefined,
): ResourceIndex {
  const all: IndexedResource[] = [];
  const byCategory: Record<string, IndexedResource[]> = {};
  const byCategoryDeposits: Record<string, IndexedResource[]> = {};
  const byTier: Record<number, IndexedResource[]> = {};
  for (const def of Object.values(mapResources || {})) {
    if (def.category == null || def.tier == null) continue;
    const entry: IndexedResource = {
      id: def.id,
      name: def.name,
      category: def.category as IndexedResource["category"],
      tier: def.tier,
      properties: def.properties || [],
      toxic: !!def.toxic,
      biome_tags: def.biome_tags || [],
      kind: def.kind || null,
      theater: def.theater || null,
      notDeposit: !!def.notDeposit,
      stub: !!def.stub,
    };
    all.push(entry);
    (byCategory[def.category] = byCategory[def.category] || []).push(entry);
    if (isPaintDeposit(entry)) {
      (byCategoryDeposits[def.category] =
        byCategoryDeposits[def.category] || []).push(entry);
    }
    const t = def.tier;
    (byTier[t] = byTier[t] || []).push(entry);
  }
  return { all, byCategory, byCategoryDeposits, byTier };
}

export function resourceMatchesRequire(
  resource: IndexedResource,
  require:
    | { category?: string; tier?: string; properties?: string[]; theater?: string }
    | undefined,
): boolean {
  if (!require) return true;
  if (isCraftedModule(resource) && !require.theater) return false;
  if (require.theater && (resource.theater || "") !== require.theater) return false;
  if (require.category && resource.category !== require.category) return false;
  if (require.properties && require.properties.length > 0) {
    for (const p of require.properties) {
      if (!resource.properties.includes(p)) return false;
    }
  }
  if (require.tier != null && resource.tier != null) {
    const spec = String(require.tier);
    const m = spec.match(/^(>=|<=|>|<|=)?\s*(\d+)$/);
    if (m) {
      const op = m[1] || ">=";
      const n = Number(m[2]);
      const rt = resource.tier;
      if (op === ">=" && !(rt >= n)) return false;
      if (op === "<=" && !(rt <= n)) return false;
      if (op === ">" && !(rt > n)) return false;
      if (op === "<" && !(rt < n)) return false;
      if (op === "=" && !(rt === n)) return false;
    }
  }
  return true;
}

export function candidatesForRequire(
  require:
    | { category?: string; tier?: string; properties?: string[]; theater?: string }
    | undefined,
  index: ResourceIndex,
): IndexedResource[] {
  if (!require) return index.all.slice();
  const pool = require.category
    ? index.byCategory[require.category] || []
    : index.all;
  return pool.filter((r) => resourceMatchesRequire(r, require));
}

export const CATEGORY_META: Record<
  string,
  { name: string; role: string; color: string }
> = {
  A: { name: "Сырьё", role: "Добыча", color: "#8d6e3a" },
  B: { name: "Материалы", role: "Сплавы", color: "#7a8fa6" },
  C: { name: "Промышленность", role: "Производство", color: "#c98a3a" },
  D: { name: "Энергия", role: "Энергия", color: "#e8c44c" },
  E: { name: "Биомасса", role: "Жизнь", color: "#5cdb95" },
  F: { name: "Знание", role: "Наука", color: "#9b6bff" },
};

export const TIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
