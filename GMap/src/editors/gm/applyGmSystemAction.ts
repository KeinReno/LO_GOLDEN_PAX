import type { StarSystem, StationKind } from "../../state/types.ts";
import type { SystemActionRequest } from "../../viewer/SystemCommandPanel.tsx";

const STATION_KIND_LABELS: Record<string, string> = {
  science: "Научная станция",
  mining: "Добывающая",
  military: "Военная база",
  trade: "Торговый хаб",
  relay: "Релей / маяк",
};

export function applyGmSystemAction(
  system: StarSystem,
  req: SystemActionRequest,
  opts: { factionId: string; nextId: () => string },
): Partial<StarSystem> | null {
  if (req.action === "rename_system" && req.name) {
    return { name: req.name };
  }
  if (req.action === "demolish_station" && req.stationId) {
    return {
      stations: (system.stations ?? []).filter((s) => s.id !== req.stationId),
    };
  }
  if (req.action === "build_station" && req.stationKind) {
    const kind = req.stationKind as StationKind;
    return {
      stations: [
        ...(system.stations ?? []),
        {
          id: opts.nextId(),
          name: STATION_KIND_LABELS[kind] ?? kind,
          kind,
          factionId: opts.factionId || system.ownerFactionId,
          beltAngle: req.beltAngle ?? undefined,
        },
      ],
    };
  }
  return null;
}
