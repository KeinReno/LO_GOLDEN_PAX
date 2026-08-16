/**
 * Client-side readiness / combat-profile helpers for the Forces section.
 * Mirrors combat + economy concepts without calling the battle engine.
 */
import { getCachedContent } from "./contentCatalog";
import {
  cardEnergyCost,
  keywordForRole,
  keywordLabel,
  matchupHints,
  roleLabel,
} from "./cardBattleHints";
import type { Fleet, Legion, ShipGroup, ViewerPayload } from "./types";

export type RoleMixEntry = {
  role: string;
  label: string;
  count: number;
  keyword: string | null;
  keywordLabel: string | null;
  energyCost: number;
};

export type ForceUpkeep = {
  metal: number;
  d: number;
  e: number;
};

export type DeckBattlePreview = {
  /** Estimated cards after stack-split (count>5 → chunks). */
  cardCount: number;
  heavyCards: number;
  energyIfAllDeployed: number;
  roles: RoleMixEntry[];
};

export type ForceEngagementHit = {
  id: string;
  systemId: string;
  theater: string;
  status: string;
  mode?: string;
  cardBattleOffer?: boolean;
  requiresPlayerInput?: boolean;
};

type EngSide = {
  factionId: string;
  fleetIds?: string[];
  legionIds?: string[];
};

type EngLike = {
  id: string;
  systemId: string;
  theater: string;
  status: string;
  mode?: string;
  cardBattleOffer?: boolean;
  requiresPlayerInput?: boolean;
  sides: EngSide[];
};

const OPEN = new Set(["active", "commit", "contact", "awaiting_stance"]);

function bal() {
  return (getCachedContent() as { economy_balance?: any } | null)
    ?.economy_balance;
}

function shipDef(defId?: string, type?: string) {
  const c = getCachedContent();
  const key = defId || type;
  if (!key || !c) return null;
  return (
    (c.ships as Record<string, any>)?.[key] ||
    (c.units as Record<string, any>)?.[key] ||
    Object.values((c.ships as Record<string, any>) || {}).find(
      (s: any) => s?.name === type,
    ) ||
    Object.values((c.units as Record<string, any>) || {}).find(
      (u: any) => u?.name === type,
    ) ||
    null
  );
}

/** Mirror of server splitStackCounts for preview parity. */
export function splitStackCounts(count: number): number[] {
  const n = Math.max(1, Math.floor(count) || 1);
  if (n <= 5) return [n];
  const chunks: number[] = [];
  let rem = n;
  while (rem > 0) {
    const size = rem > 5 ? Math.min(5, Math.max(3, Math.ceil(rem / 2))) : rem;
    chunks.push(size);
    rem -= size;
  }
  return chunks;
}

export function forceUpkeepRatesClient(
  kind: "ship" | "unit",
  tier: number,
  count: number,
): ForceUpkeep {
  const forces = bal()?.forces || {};
  const t = Math.max(1, Number(tier) || 1);
  const n = Math.max(0, Number(count) || 0);
  if (kind === "ship") {
    const metalPer =
      Number(forces.shipUpkeepMetalBase ?? 0.2) +
      Number(forces.shipUpkeepMetalPerTier ?? 0.12) * t;
    return {
      metal: n * metalPer,
      d: n * Number(forces.shipUpkeepDPerCount ?? 0.25),
      e: n * Number(forces.shipUpkeepEPerCount ?? 0.15),
    };
  }
  return {
    metal: 0,
    d: 0,
    e: n * Number(forces.legionUpkeepEPerCount ?? 0.35),
  };
}

export function compositionUpkeep(
  composition: ShipGroup[] | undefined,
  kind: "fleet" | "legion",
): ForceUpkeep {
  const out: ForceUpkeep = { metal: 0, d: 0, e: 0 };
  for (const g of composition || []) {
    const def = shipDef(g.defId, g.type);
    const tier = Number(def?.tier ?? 1) || 1;
    const rates = forceUpkeepRatesClient(
      kind === "fleet" ? "ship" : "unit",
      tier,
      g.count || 0,
    );
    out.metal += rates.metal;
    out.d += rates.d;
    out.e += rates.e;
  }
  return out;
}

export function formatUpkeepShort(u: ForceUpkeep): string {
  const parts: string[] = [];
  if (u.metal >= 0.05) parts.push(`M${u.metal.toFixed(1)}`);
  if (u.d >= 0.05) parts.push(`D${u.d.toFixed(1)}`);
  if (u.e >= 0.05) parts.push(`E${u.e.toFixed(1)}`);
  return parts.length ? parts.join(" · ") + "/ход" : "—";
}

export function roleMixFromComposition(
  composition: ShipGroup[] | undefined,
): RoleMixEntry[] {
  const bag = new Map<string, number>();
  for (const g of composition || []) {
    const def = shipDef(g.defId, g.type);
    const role = (def?.roles?.[0] as string) || "line";
    bag.set(role, (bag.get(role) || 0) + (g.count || 0));
  }
  return [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([role, count]) => {
      const kw = keywordForRole(role);
      return {
        role,
        label: roleLabel(role),
        count,
        keyword: kw,
        keywordLabel: kw ? keywordLabel(kw) : null,
        energyCost: cardEnergyCost(role),
      };
    });
}

export function deckBattlePreview(
  composition: ShipGroup[] | undefined,
): DeckBattlePreview {
  const roles = roleMixFromComposition(composition);
  let cardCount = 0;
  let heavyCards = 0;
  let energyIfAllDeployed = 0;
  for (const g of composition || []) {
    const def = shipDef(g.defId, g.type);
    const role = (def?.roles?.[0] as string) || "line";
    const cost = cardEnergyCost(role);
    const chunks = splitStackCounts(g.count || 1);
    cardCount += chunks.length;
    for (const _c of chunks) {
      energyIfAllDeployed += cost;
      if (cost >= 2) heavyCards += 1;
    }
  }
  return { cardCount, heavyCards, energyIfAllDeployed, roles };
}

export function isOpenEngagementStatus(status: string): boolean {
  return OPEN.has(status) || status === "active";
}

export function engagementsForForce(
  engagements: EngLike[] | undefined,
  opts: {
    forceId: string;
    kind: "fleet" | "legion";
    systemId: string;
    factionId: string;
  },
): ForceEngagementHit[] {
  const list = engagements || [];
  const hits: ForceEngagementHit[] = [];
  for (const e of list) {
    if (!isOpenEngagementStatus(e.status)) continue;
    const my = e.sides?.find((s) => s.factionId === opts.factionId);
    if (!my) continue;
    const ids =
      opts.kind === "fleet" ? my.fleetIds || [] : my.legionIds || [];
    const byId = ids.includes(opts.forceId);
    const bySys = !ids.length && e.systemId === opts.systemId;
    if (!byId && !bySys) continue;
    hits.push({
      id: e.id,
      systemId: e.systemId,
      theater: e.theater,
      status: e.status,
      mode: e.mode,
      cardBattleOffer: e.cardBattleOffer,
      requiresPlayerInput: e.requiresPlayerInput,
    });
  }
  return hits;
}

export function fleetReadiness(fleet: Fleet, factionId: string, engagements?: EngLike[]) {
  const composition = fleet.composition || [];
  return {
    upkeep: compositionUpkeep(composition, "fleet"),
    preview: deckBattlePreview(composition),
    engagements: engagementsForForce(engagements, {
      forceId: fleet.id,
      kind: "fleet",
      systemId: fleet.systemId,
      factionId,
    }),
  };
}

/** Legion deck, or a generic-line stack sized from `strength` when composition is empty. */
export function resolveLegionComposition(legion: {
  composition?: Legion["composition"];
  strength?: number;
}): ShipGroup[] {
  if (Array.isArray(legion.composition) && legion.composition.length) {
    return legion.composition as ShipGroup[];
  }
  return [
    {
      type: "unit.generic_line",
      defId: "unit.generic_line",
      count: Math.max(1, Math.round(legion.strength || 1)),
    },
  ];
}

export function legionReadiness(
  legion: Legion,
  factionId: string,
  engagements?: EngLike[],
) {
  const composition = resolveLegionComposition(legion);
  return {
    upkeep: compositionUpkeep(composition, "legion"),
    preview: deckBattlePreview(composition),
    engagements: engagementsForForce(engagements, {
      forceId: legion.id,
      kind: "legion",
      systemId: legion.systemId,
      factionId,
    }),
  };
}

export function matchupLineForRole(role: string): string {
  const { strongVs, weakVs } = matchupHints(role);
  const s = strongVs.map(roleLabel).join(", ");
  const w = weakVs.map(roleLabel).join(", ");
  if (!s && !w) return "";
  const parts: string[] = [];
  if (s) parts.push(`силён vs ${s}`);
  if (w) parts.push(`слаб vs ${w}`);
  return parts.join(" · ");
}

/** Max HP from catalog + veterancy (client mirror). */
export function groupMaxHp(
  group: ShipGroup,
  level = group.level ?? 0,
): number {
  const def = shipDef(group.defId, group.type);
  const base = Number(def?.stats?.hp ?? 100) || 100;
  const rules = getCachedContent()?.rules as
    | { veterancy?: { bonuses?: Array<{ stat_mult?: { hp?: number } }> } }
    | undefined;
  const sm = rules?.veterancy?.bonuses?.[Math.min(5, level)]?.stat_mult;
  const mult = Number(sm?.hp ?? 1) || 1;
  return Math.round(base * mult);
}

export function groupNeedsRepair(group: ShipGroup): boolean {
  const max = groupMaxHp(group);
  const hp = group.hp;
  if (hp == null) return false;
  return hp < max - 0.5;
}

export function systemHasShipyardForFaction(
  system: ViewerPayload["world"]["systems"][number],
  factionId: string,
): boolean {
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of [
      ...(p.orbitalBuildings ?? []),
      ...(p.surfaceBuildings ?? []),
    ]) {
      if (b.kind === "shipyard" || b.kind === "spaceport") return true;
    }
  }
  return (system.stations ?? []).some(
    (s) => s.kind === "military" && s.factionId === factionId,
  );
}

export function systemHasBarracksForFaction(
  system: ViewerPayload["world"]["systems"][number],
  factionId: string,
): boolean {
  for (const p of system.planets ?? []) {
    const owner = p.ownerFactionId || system.ownerFactionId;
    if (owner !== factionId) continue;
    for (const b of p.surfaceBuildings ?? []) {
      if (b.kind === "barracks") return true;
    }
  }
  return false;
}

/** Resolve display name / defId to canonical content id (client-side). */
export function resolveUnitDefId(
  group: { defId?: string; type?: string },
): string {
  const raw = String(group.defId || group.type || "").trim();
  if (!raw) return "";
  if (group.defId) return raw;
  const c = getCachedContent();
  const pools = [c?.ships, c?.units];
  for (const pool of pools) {
    if (!pool) continue;
    if (pool[raw]) return raw;
    for (const def of Object.values(pool)) {
      const d = def as { id?: string; name?: string } | undefined;
      if (!d) continue;
      if (d.id === raw || d.name === raw) return String(d.id || raw);
    }
  }
  return raw;
}

export function findProductionHubs(
  world: ViewerPayload["world"],
  factionId: string,
): { shipyardSystemId: string | null; barracksSystemId: string | null } {
  let shipyardSystemId: string | null = null;
  let barracksSystemId: string | null = null;
  for (const sys of world.systems ?? []) {
    if (sys.ownerFactionId !== factionId) continue;
    const hasYard = systemHasShipyardForFaction(sys, factionId);
    const hasBarracks = systemHasBarracksForFaction(sys, factionId);
    if (!shipyardSystemId && hasYard) shipyardSystemId = sys.id;
    if (!barracksSystemId && hasBarracks) barracksSystemId = sys.id;
    if (shipyardSystemId && barracksSystemId) break;
  }
  return { shipyardSystemId, barracksSystemId };
}

export function empireForceTotals(payload: ViewerPayload) {
  const fid = payload.factionId;
  const fleets = (payload.world.fleets ?? []).filter((f) => f.factionId === fid);
  const legions = (payload.world.legions ?? []).filter(
    (l) => l.factionId === fid,
  );
  const upkeep: ForceUpkeep = { metal: 0, d: 0, e: 0 };
  for (const f of fleets) {
    const u = compositionUpkeep(f.composition, "fleet");
    upkeep.metal += u.metal;
    upkeep.d += u.d;
    upkeep.e += u.e;
  }
  for (const l of legions) {
    const u = compositionUpkeep(
      (l.composition as ShipGroup[] | undefined) || [],
      "legion",
    );
    upkeep.metal += u.metal;
    upkeep.d += u.d;
    upkeep.e += u.e;
  }
  return { fleets: fleets.length, legions: legions.length, upkeep };
}
