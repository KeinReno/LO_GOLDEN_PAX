import { getCachedContent } from "./contentCatalog";
import { produceForceCostClient } from "./forceEconomy";
import { factionContentTag } from "./buildingAccess";
import { factionHasProperty, type TechEcoSlice } from "./techGate";
import {
  playerAuthHeaders,
  playerJsonBody,
  rememberPlayerTokenFromPayload,
} from "./playerAuth";
import type { ViewerPayload } from "./types";

export type ForceRecruitSession = {
  world?: ViewerPayload["world"];
  economy?: ViewerPayload["economy"];
  intel?: ViewerPayload["intel"];
  visibleSystemIds?: string[];
};

export type RaiseKind = "unit" | "ship";

export type RaiseDef = {
  id: string;
  name: string;
  kind: RaiseKind;
  tier?: number;
  faction?: string;
  raisableWithoutBuilding?: boolean;
  requireProperties?: string[];
  cost?: Record<string, number>;
};

export function factionMayRaiseDef(
  def: { faction?: string },
  factionId: string,
): boolean {
  const tag = factionContentTag(factionId);
  const fac = def.faction;
  return !fac || fac === "generic" || fac === tag || fac === factionId;
}

export function raisePropertyGate(
  def: { requireProperties?: string[] },
  eco?: TechEcoSlice,
): { ok: boolean; error?: string } {
  for (const prop of def.requireProperties || []) {
    if (!factionHasProperty(eco, prop)) {
      return { ok: false, error: `Нужно свойство: ${prop}` };
    }
  }
  return { ok: true };
}

type JsonErr = { error?: string };

function forcesBal(): {
  mobilizationRate?: number;
  crewPerTier?: number;
} {
  const raw = getCachedContent()?.economy_balance as
    | { forces?: { mobilizationRate?: number; crewPerTier?: number } }
    | undefined;
  return raw?.forces ?? {};
}

export function mobilizationCeiling(population: number): number {
  const rate = Number(forcesBal().mobilizationRate ?? 0.3);
  const clamped = Math.max(0, Math.min(1, rate || 0));
  return Math.floor((Number(population) || 0) * clamped);
}

/** Pop spent on a raise (units = count; ships add crew). No overrideCeiling. */
export function raisePopulationCost(
  kind: RaiseKind,
  def: { tier?: number },
  count: number,
): number {
  const n = Math.max(1, Math.floor(Number(count) || 0));
  if (kind !== "ship") return n;
  const tier = Math.max(1, Number(def?.tier) || 1);
  const per = Math.max(0, Number(forcesBal().crewPerTier) || 0);
  return n + n * tier * per;
}

export function listRaiseDefs(
  factionId: string,
  gates: { barracks: boolean; shipyard: boolean },
): RaiseDef[] {
  const c = getCachedContent();
  const out: RaiseDef[] = [];
  for (const u of Object.values(c?.units ?? {})) {
    if (!factionMayRaiseDef(u, factionId)) continue;
    if (u.raisableWithoutBuilding || gates.barracks) {
      out.push({ ...u, kind: "unit" });
    }
  }
  if (gates.shipyard) {
    for (const s of Object.values(c?.ships ?? {})) {
      if (!factionMayRaiseDef(s, factionId)) continue;
      out.push({ ...s, kind: "ship" });
    }
  }
  out.sort((a, b) => {
    const aw = a.raisableWithoutBuilding ? 0 : 1;
    const bw = b.raisableWithoutBuilding ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return (a.tier ?? 1) - (b.tier ?? 1) || a.name.localeCompare(b.name, "ru");
  });
  return out;
}

export function raiseCurrencyCost(
  def: RaiseDef,
  count: number,
): Record<string, number> {
  return produceForceCostClient(def.kind, def, count);
}

/** Minimal force shape for stacking a raise onto an existing home stack. */
export type HomeForceCandidate = {
  id: string;
  factionId: string;
  systemId: string;
  homePlanetId?: string;
  composition?: Array<{ defId?: string; type?: string; id?: string }>;
};

function groupHasDef(
  groups: HomeForceCandidate["composition"],
  defId: string,
): boolean {
  return (groups ?? []).some(
    (g) => g.defId === defId || g.type === defId || g.id === defId,
  );
}

/**
 * Id of the in-system home stack to grow, or undefined so the server creates.
 * Units → legion with this `homePlanetId`; ships → fleet with this `homePlanetId`.
 * Several homes: prefer the stack that already has `defId`, else the first.
 */
export function pickHomeForceId(opts: {
  kind: RaiseKind;
  defId: string;
  factionId: string;
  systemId: string;
  planetId: string;
  fleets?: HomeForceCandidate[];
  legions?: HomeForceCandidate[];
}): string | undefined {
  const list = opts.kind === "ship" ? opts.fleets : opts.legions;
  const homes = (list ?? []).filter(
    (f) =>
      f.factionId === opts.factionId &&
      f.systemId === opts.systemId &&
      f.homePlanetId === opts.planetId,
  );
  if (homes.length === 0) return undefined;
  if (homes.length === 1) return homes[0].id;
  const withDef = homes.find((f) => groupHasDef(f.composition, opts.defId));
  return withDef?.id ?? homes[0].id;
}

async function postJson<T>(
  url: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: playerAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(playerJsonBody(body)),
    });
    const data = (await res.json()) as T & JsonErr;
    rememberPlayerTokenFromPayload(data as { playerToken?: string | null });
    if (!res.ok) {
      return { ok: false, error: data.error || res.statusText };
    }
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function postForceRaise(body: {
  factionId: string;
  password: string;
  systemId: string;
  planetId: string;
  kind: RaiseKind;
  defId: string;
  count: number;
  forceId?: string;
  name?: string;
}) {
  return postJson<ForceRecruitSession & { popCost?: number; cost?: Record<string, number> }>(
    "/api/forces/raise",
    body,
  );
}

export function postForceDisbandRaised(body: {
  factionId: string;
  password: string;
  kind: "legion" | "fleet";
  id: string;
  count: number;
  defId?: string;
}) {
  return postJson<ForceRecruitSession & { disbandedCount?: number }>(
    "/api/forces/disband-raised",
    body,
  );
}
