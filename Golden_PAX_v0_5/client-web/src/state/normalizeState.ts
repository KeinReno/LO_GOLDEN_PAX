import type {
  CampaignStatePayload,
  ForceView,
  LinkView,
  OtherFactionView,
  SelfView,
  SystemView,
  ViewPayload,
} from "./viewTypes";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseSystems(raw: unknown[]): SystemView[] {
  return raw.map((row) => {
    const sys = row as Record<string, unknown>;
    const knowledge = num(sys.knowledge, 0) === 1 ? (1 as const) : (0 as const);
    const base = {
      id: str(sys.id),
      name: str(sys.name, str(sys.id)),
      x: num(sys.x),
      y: num(sys.y),
      kind: (sys.kind as string | null) ?? null,
      ownerFactionId: (sys.ownerFactionId as string | null) ?? null,
      isCapital: Boolean(sys.isCapital),
    };
    if (knowledge === 1) {
      return { ...base, knowledge: 1 as const };
    }
    const planets = Array.isArray(sys.planets)
      ? sys.planets.map((p) => {
          const planet = p as Record<string, unknown>;
          return {
            id: str(planet.id),
            name: str(planet.name, str(planet.id)),
            ownerFactionId: planet.ownerFactionId as string | null | undefined,
            buildings: Array.isArray(planet.buildings) ? planet.buildings : undefined,
          };
        })
      : undefined;
    return { ...base, knowledge: 0 as const, planets };
  });
}

function parseLinks(raw: unknown[] | undefined): LinkView[] {
  return (raw ?? []).map((row) => {
    const l = row as Record<string, unknown>;
    return {
      id: str(l.id) || undefined,
      fromId: str(l.fromId),
      toId: str(l.toId),
      type: str(l.type) || undefined,
    };
  });
}

function parseSelf(selfRaw: Record<string, unknown> | undefined): SelfView {
  const factionRaw = (selfRaw?.faction ?? {}) as Record<string, unknown>;
  const ecoRaw = (selfRaw?.economy ?? {}) as Record<string, unknown>;
  return {
    faction: {
      id: str(factionRaw.id),
      name: str(factionRaw.name, str(factionRaw.id)),
      colorHex: str(factionRaw.colorHex) || undefined,
      raceId: str(factionRaw.raceId) || undefined,
      pegResourceId:
        factionRaw.pegResourceId === null || factionRaw.pegResourceId === undefined
          ? null
          : str(factionRaw.pegResourceId) || null,
      pegChangedTurn:
        factionRaw.pegChangedTurn != null ? num(factionRaw.pegChangedTurn) : null,
    },
    economy: {
      stocks: (ecoRaw.stocks as Record<string, number>) ?? {},
      taxes: ecoRaw.taxes as Record<string, unknown> | undefined,
      pressure: ecoRaw.pressure != null ? num(ecoRaw.pressure) : undefined,
      deficit: ecoRaw.deficit != null ? num(ecoRaw.deficit) : undefined,
    },
    tech: selfRaw?.tech as SelfView["tech"],
    court: selfRaw?.court as SelfView["court"],
    stability: selfRaw?.stability != null ? num(selfRaw.stability) : undefined,
    revolts: Array.isArray(selfRaw?.revolts) ? (selfRaw!.revolts as unknown[]) : undefined,
    flow: selfRaw?.flow,
  };
}

/** Parse GET /view JSON into ViewPayload. */
export function parseViewPayload(raw: Record<string, unknown>): ViewPayload {
  const viewerRaw = (raw.viewer ?? {}) as Record<string, unknown>;
  const others = ((raw.others ?? []) as Record<string, unknown>[]).map(
    (o): OtherFactionView => ({
      id: str(o.id),
      name: str(o.name, str(o.id)),
      colorHex: str(o.colorHex, "#6b7280"),
      isNpc: Boolean(o.isNpc),
    }),
  );

  return {
    campaign: raw.campaign as { id: string; name: string },
    currentTurn: num(raw.currentTurn),
    tableRevision: num(raw.tableRevision),
    viewer: { role: "player", factionId: str(viewerRaw.factionId) },
    self: parseSelf(raw.self as Record<string, unknown>),
    others,
    visibleSystemIds: Array.isArray(raw.visibleSystemIds)
      ? raw.visibleSystemIds.map((id) => str(id))
      : [],
    systems: parseSystems((raw.systems ?? []) as unknown[]),
    links: parseLinks(raw.links as unknown[]),
    forces: ((raw.forces ?? []) as Record<string, unknown>[]).map(parseForceRow),
    relations: (raw.relations as Record<string, string>) ?? {},
    briefing: raw.briefing,
    fx: raw.fx,
  };
}

export function normalizeGmState(state: CampaignStatePayload): ViewPayload {
  const others: OtherFactionView[] = state.factions.map((row) => {
    const f = row.faction;
    return {
      id: str(f.id),
      name: str(f.name, str(f.id)),
      colorHex: str(f.colorHex, "#6b7280"),
      isNpc: Boolean(f.isNpc),
    };
  });

  const systems = parseSystems(state.systems as unknown[]);
  const links = parseLinks(state.links as unknown[]);
  const forces = ((state.forces ?? []) as Record<string, unknown>[]).map(parseForceRow);

  const self: SelfView = {
    faction: { id: "gm", name: "Game Master" },
    economy: { stocks: {} },
    stability: 100,
  };

  return {
    campaign: { id: state.campaign.id, name: state.campaign.name },
    currentTurn: state.currentTurn,
    tableRevision: state.tableRevision ?? state.currentTurn,
    viewer: { role: "gm" },
    self,
    others,
    visibleSystemIds: systems.map((s) => s.id),
    systems,
    links,
    forces,
    relations: state.relations ?? {},
    fx: state.fx,
  };
}

export function parseForceRow(raw: Record<string, unknown>): ForceView {
  const spotted = raw.knowledge === "spotted";
  return {
    id: str(raw.id),
    factionId: str(raw.factionId),
    kind: raw.kind === "legion" ? "legion" : "fleet",
    name: str(raw.name) || undefined,
    systemId: raw.systemId ? str(raw.systemId) : null,
    movementPoints: num(raw.movementPoints, 0),
    composition: spotted
      ? undefined
      : Array.isArray(raw.composition)
        ? raw.composition
        : undefined,
    knowledge: spotted ? "spotted" : undefined,
    approxCount: spotted && raw.approxCount != null ? num(raw.approxCount) : undefined,
    spotted,
  };
}
