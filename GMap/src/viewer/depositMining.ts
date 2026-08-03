import type { OrbitalStation, StarSystem } from "../state/types";

/**
 * Honest mining model: deposits are system-belt resources.
 * Any mining station in the system extracts from the belt as a whole —
 * we do NOT pretend each deposit has its own miner link.
 */
export type SystemMineStatus = "none" | "own" | "other";

export type SystemMineInfo = {
  status: SystemMineStatus;
  ownMiners: OrbitalStation[];
  otherMiners: OrbitalStation[];
};

export function systemMineInfo(
  system: StarSystem,
  factionId?: string | null,
): SystemMineInfo {
  const miners = (system.stations ?? []).filter((s) => s.kind === "mining");
  const ownMiners = factionId
    ? miners.filter((s) => s.factionId === factionId)
    : [];
  const otherMiners = factionId
    ? miners.filter((s) => s.factionId !== factionId)
    : miners;
  if (ownMiners.length > 0) {
    return { status: "own", ownMiners, otherMiners };
  }
  if (otherMiners.length > 0) {
    return { status: "other", ownMiners, otherMiners };
  }
  return { status: "none", ownMiners, otherMiners };
}

export function systemMineLabel(status: SystemMineStatus): string {
  switch (status) {
    case "own":
      return "Пояс добывается вашей mining-станцией";
    case "other":
      return "Пояс добывается чужой mining-станцией";
    default:
      return "Пояс не добывается — нужна mining-станция";
  }
}

/** @deprecated use systemMineInfo — kept for call-site migration */
export function depositMineInfo(
  system: StarSystem,
  _resourceId: string,
  factionId?: string | null,
) {
  const info = systemMineInfo(system, factionId);
  const station =
    info.ownMiners[0] ?? info.otherMiners[0] ?? null;
  const status =
    info.status === "own"
      ? ("mining_own" as const)
      : info.status === "other"
        ? ("mining_other" as const)
        : ("idle" as const);
  return { status, station, miners: [...info.ownMiners, ...info.otherMiners] };
}

export function mineStatusLabel(
  status: "idle" | "mining_own" | "mining_other",
): string {
  switch (status) {
    case "mining_own":
      return systemMineLabel("own");
    case "mining_other":
      return systemMineLabel("other");
    default:
      return systemMineLabel("none");
  }
}
