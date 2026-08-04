/** Client catalog from GET /api/content (P1). Falls back to local defaults. */
import {
  RESOURCE_POOL as FALLBACK_RESOURCES,
  SHIP_TYPES as FALLBACK_SHIPS,
  SYSTEM_POI_LABELS as FALLBACK_POI,
} from "./defaults";

export type EconomyCategory = "A" | "B" | "C" | "D" | "E" | "F";

export type EconomySchema = {
  meta?: { version?: number; description?: string };
  categories?: Record<string, { id: string; name: string; role: string; currencyId: string; color?: string }>;
  tiers?: Record<string, { id: number; label: string; description: string }>;
  properties?: Record<string, { id: string; label: string; description: string }>;
  flow_key_format?: string;
  rps_edges?: Array<{ edge: string; from: string; to: string; input1: string; input2: string; output: string; description: string }>;
  rps_combat?: { slots?: string[]; matchups?: Array<{ attacker: string; defender: string; rule: string }> };
  legacy_bridge?: { description?: string; mapping?: Record<string, string> };
  market?: {
    description?: string;
    status?: string;
    mode?: string;
    placeholder_rates?: Array<{
      pair: string;
      buy?: number;
      sell?: number;
      note?: string;
    }>;
  };
};

export type MapResourceDef = {
  id: string;
  name: string;
  category?: EconomyCategory;
  tier?: number;
  properties?: string[];
  biome_tags?: string[];
  spread?: { self_spreading?: boolean };
  toxic?: boolean;
  yield?: Record<string, number>;
};

export type EffectInstance = {
  effect: string;
  args: Record<string, unknown>;
};

export type TechUpgrade = {
  id: string;
  name: string;
  cost: Record<string, number>;
  effects: EffectInstance[];
  prerequisites?: string[];
  balanceBudget?: number;
};

export type TechnologyDef = {
  id: string;
  name: string;
  category: EconomyCategory;
  era: number;
  cost?: Record<string, number>;
  effects?: EffectInstance[];
  prerequisites?: string[];
  upgrades?: TechUpgrade[];
  /** Icon key → content/core/tech_icons.json */
  iconTag?: string;
  /** Short lore blurb (≤200). */
  flavor?: string;
  /** Availability tags: general | race_* | faction_*_unique | trait.* */
  tags?: string[];
  /** Only researchable when faction pop share of this race ≥ 30%. */
  raceLock?: string;
  /** Requires matching Faction.traits id. */
  factionTraitLock?: string;
  /** Requires unlockedProperties on faction eco. */
  requireProperties?: string[];
  /** Era-5+ breakthrough tech (distinct radial styling). */
  isBreakthrough?: boolean;
  balanceBudget?: number;
};

export type PublicContent = {
  ships?: Record<
    string,
    {
      id: string;
      name: string;
      tier?: number;
      faction?: string;
      roles?: string[];
      stats?: Record<string, number>;
      slots?: Array<{ role: string; count?: number; require?: unknown }>;
    }
  >;
  units?: Record<
    string,
    {
      id: string;
      name: string;
      tier?: number;
      faction?: string;
      roles?: string[];
      stats?: Record<string, number>;
      slots?: Array<{ role: string; count?: number; require?: unknown }>;
    }
  >;
  map_resources?: Record<string, MapResourceDef>;
  faction_currencies?: Record<
    string,
    {
      id: string;
      name: string;
      short?: string;
      peg?: string | null;
      pegLabel?: string;
      strength?: string;
      blurb?: string;
      lastUc?: number;
    }
  >;
  market_quote_seed?: {
    meta?: {
      turnStart?: number;
      turns?: number;
      turnEnd?: number;
      quote?: string;
      narrative?: string;
    };
    resources?: Record<
      string,
      {
        id: string;
        name: string;
        category?: string | null;
        tier?: number | null;
        series?: number[];
      }
    >;
    currencies?: Record<
      string,
      {
        id: string;
        name: string;
        series?: number[];
      }
    >;
  };
  economy_schema?: EconomySchema;
  technologies?: Record<string, TechnologyDef>;
  tech_icons?: Record<string, { glyph: string; label: string }>;
  pois?: Record<string, { label?: string; name?: string }>;
  rules?: {
    apPerTurn?: number;
    tax?: {
      pressureThresholds?: Array<{
        min: number;
        effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
      }>;
    };
  };
  intents?: Record<string, { ap?: number }>;
  buildings?: Record<
    string,
    {
      id: string;
      kind: string;
      zone: "surface" | "orbital" | "subsurface" | "deep";
      name: string;
      ap?: number;
      cost?: Record<string, number>;
      maxPerPlanet?: number;
      category?: EconomyCategory;
      tier?: number;
      faction?: string;
      signature?: string;
      tradeoff?: string;
      biome_restrictions?: string[];
      slots?: Array<{
        role: string;
        require: { category?: string; tier?: string; properties?: string[] };
        count: number;
      }>;
      upkeep_slots?: Array<{
        require: { category?: string; tier?: string; properties?: string[] };
        count: number;
        per?: string;
      }>;
      effects?: Array<{
        effect: string;
        args: Record<string, unknown>;
      }>;
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
  space_objects?: {
    objects?: Record<
      string,
      {
        id: string;
        name: string;
        kind: string;
        description?: string;
        effects?: Array<{
          effect: string;
          args: Record<string, unknown>;
        }>;
      }
    >;
  };
  faction_traits?: {
    meta?: {
      version?: number;
      description?: string;
      maxSelected?: number;
      budgetRange?: [number, number];
    };
    traits?: Record<
      string,
      {
        id: string;
        name: string;
        ideology?: string;
        balanceBudget: number;
        effects?: EffectInstance[];
        conditions?: { minEra?: number; tag?: string };
      }
    >;
  };
  races?: Record<
    string,
    {
      id: string;
      name: string;
      kind?: string;
      origin?: string;
      parent?: string;
      base?: string;
      tags?: string[];
      traits?: Array<{
        id: string;
        effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
        balanceBudget?: number;
      }>;
      habitability?: Record<string, number>;
      growth?: { baseRate?: number; crowdPenalty?: number };
      xenorelations?: Record<string, number>;
    }
  >;
  loyalty_tiers?: {
    loyalty_tiers?: Array<{
      min?: number;
      max?: number;
      effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
    }>;
  };
  yearly_quests?: Record<
    string,
    {
      id: string;
      name: string;
      summary?: string;
      detail?: string;
      filterBy?: string[];
      choices?: Array<{
        id: string;
        label: string;
        description?: string;
        diceRequired?: Array<{ count: number; sides: number; label: string; threshold?: number }>;
        effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
        onSuccess?: Array<{ effect: string; args?: Record<string, unknown> }>;
        onFail?: Array<{ effect: string; args?: Record<string, unknown> }>;
      }>;
    }
  >;
  diplomacy_stances?: Record<
    string,
    {
      id: string;
      label?: string;
      effects?: Array<{ effect: string; args?: Record<string, unknown> }>;
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

export function intentApCost(defId: string): number {
  return cached?.intents?.[defId]?.ap ?? 0;
}
