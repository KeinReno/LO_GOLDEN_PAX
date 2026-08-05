import type { MapUnitDropPayload } from "../renderers/MapCanvas";
import type { Fleet, Legion, WorldState } from "./types";

export type ContactBattleSideUnit = {
  id: string;
  name: string;
  kind: "fleet" | "legion";
  power?: number;
  classId?: string;
  stance?: string;
};

export type ContactBattlePreview = {
  systemId: string;
  systemName: string;
  theater: "space" | "ground";
  attackerFactionId: string;
  defenderFactionId: string;
  attackerLabel: string;
  defenderLabel: string;
  attackerUnits: ContactBattleSideUnit[];
  defenderUnits: ContactBattleSideUnit[];
  drop: MapUnitDropPayload;
};

function factionLabel(world: WorldState, id: string): string {
  return world.factions.find((f) => f.id === id)?.name ?? id;
}

function systemLabel(world: WorldState, id: string): string {
  return world.systems.find((s) => s.id === id)?.name ?? id;
}

function unitRow(
  u: Fleet | Legion,
  kind: "fleet" | "legion",
): ContactBattleSideUnit {
  if (kind === "fleet") {
    const f = u as Fleet;
    const power = f.composition?.reduce((s, g) => s + (g.count ?? 0), 0);
    return {
      id: f.id,
      name: f.name ?? "Флот",
      kind,
      power: power || undefined,
      stance: f.stance,
    };
  }
  const l = u as Legion;
  return {
    id: l.id,
    name: l.name ?? "Легион",
    kind,
    power: l.strength,
    stance: l.status,
  };
}

export function buildContactBattlePreview(
  world: WorldState,
  playerFactionId: string,
  drop: MapUnitDropPayload,
): ContactBattlePreview | null {
  if (drop.intent !== "attack" || !drop.targetUnitId || !drop.targetUnitKind) {
    return null;
  }
  const attacker =
    drop.kind === "fleet"
      ? world.fleets.find((f) => f.id === drop.unitId)
      : world.legions.find((l) => l.id === drop.unitId);
  const defender =
    drop.targetUnitKind === "fleet"
      ? world.fleets.find((f) => f.id === drop.targetUnitId)
      : world.legions.find((l) => l.id === drop.targetUnitId);
  if (!attacker || !defender) return null;

  const defenderFactionId =
    drop.targetFactionId ?? defender.factionId ?? "";
  const theater =
    drop.kind === "legion" && drop.targetUnitKind === "legion"
      ? "ground"
      : "space";

  return {
    systemId: drop.toSystemId,
    systemName: systemLabel(world, drop.toSystemId),
    theater,
    attackerFactionId: playerFactionId,
    defenderFactionId,
    attackerLabel: factionLabel(world, playerFactionId),
    defenderLabel: factionLabel(world, defenderFactionId),
    attackerUnits: [unitRow(attacker, drop.kind)],
    defenderUnits: [unitRow(defender, drop.targetUnitKind)],
    drop,
  };
}

export function formatContactLosses(
  losses?: { defId: string; lost: number }[],
): string {
  if (!losses?.length) return "без потерь";
  const parts = losses
    .filter((l) => l.lost > 0)
    .map((l) => `${l.defId.replace(/^(ship|unit)\./, "")} −${l.lost}`);
  return parts.length ? parts.join(", ") : "без потерь";
}
