import type {
  OrbitalStation,
  Planet,
  StarSystem,
} from "../../../state/types";

export type PlanetDiveTask = "build" | "people" | "forces" | "policy";

export type StationRoleGroup = {
  kind: string;
  label: string;
  own: OrbitalStation[];
  other: OrbitalStation[];
};

const STATION_ORDER = [
  "mining",
  "military",
  "trade",
  "science",
  "relay",
] as const;

const STATION_LABEL: Record<string, string> = {
  mining: "Добывающая",
  military: "Военная база",
  trade: "Торговый хаб",
  science: "Научная станция",
  relay: "Релей / маяк",
};

export function isOwnSettledPlanet(
  planet: Planet,
  system: StarSystem,
  factionId: string,
): boolean {
  const owner = planet.ownerFactionId || system.ownerFactionId;
  if (owner !== factionId) return false;
  return (
    (planet.population ?? 0) > 0 ||
    (!!planet.colonyType && planet.colonyType !== "none")
  );
}

export function planetRaiseGates(planet: Planet): {
  army: boolean;
  fleet: boolean;
} {
  const all = [
    ...(planet.surfaceBuildings ?? []),
    ...(planet.orbitalBuildings ?? []),
  ];
  return {
    army: all.some((b) => !b.disabled && b.kind === "barracks"),
    fleet: all.some(
      (b) => !b.disabled && (b.kind === "shipyard" || b.kind === "spaceport"),
    ),
  };
}

export function planetDiveTasks(planet: Planet, owned: boolean): PlanetDiveTask[] {
  if (!owned) return ["policy"];
  const gates = planetRaiseGates(planet);
  const tasks: PlanetDiveTask[] = ["build", "people"];
  if (gates.army || gates.fleet) tasks.push("forces");
  tasks.push("policy");
  return tasks;
}

export function groupStationsByRole(
  stations: OrbitalStation[] | undefined,
  factionId: string,
): StationRoleGroup[] {
  const byKind = new Map<string, StationRoleGroup>();
  for (const kind of STATION_ORDER) {
    byKind.set(kind, {
      kind,
      label: STATION_LABEL[kind] ?? kind,
      own: [],
      other: [],
    });
  }
  for (const st of stations ?? []) {
    let g = byKind.get(st.kind);
    if (!g) {
      g = {
        kind: st.kind,
        label: STATION_LABEL[st.kind] ?? st.kind,
        own: [],
        other: [],
      };
      byKind.set(st.kind, g);
    }
    if (st.factionId === factionId) g.own.push(st);
    else g.other.push(st);
  }
  return [...byKind.values()].filter((g) => g.own.length + g.other.length > 0);
}
