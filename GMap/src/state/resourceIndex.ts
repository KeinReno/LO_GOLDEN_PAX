/**
 * Client-side resource index + slot matcher (mirror of server/slotResolver.mjs).
 * Built from cached PublicContent.map_resources.
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
};

export type ResourceIndex = {
  all: IndexedResource[];
  byCategory: Record<string, IndexedResource[]>;
  byTier: Record<number, IndexedResource[]>;
};

export function buildResourceIndex(
  mapResources: Record<string, MapResourceDef> | undefined,
): ResourceIndex {
  const all: IndexedResource[] = [];
  const byCategory: Record<string, IndexedResource[]> = {};
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
    };
    all.push(entry);
    (byCategory[def.category] = byCategory[def.category] || []).push(entry);
    const t = def.tier;
    (byTier[t] = byTier[t] || []).push(entry);
  }
  return { all, byCategory, byTier };
}

function isCraftedModule(resource: IndexedResource): boolean {
  return resource.kind === "module" || String(resource.id || "").startsWith("module.");
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
