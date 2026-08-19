import type { Fleet, FleetKind, Legion } from "../state/types";
import { toIso } from "./iso.ts";

/** Minimal clock — bob only. Compatible with AnimClock. */
type OrbitAnim = { t: number };

export interface FleetSlot {
  fleet: Fleet;
  x: number;
  y: number;
  /** How many fleets of this faction are stacked on this glyph. */
  stackCount: number;
  fleetIds: string[];
}

export interface LegionSlot {
  legion: Legion;
  x: number;
  y: number;
  stackCount: number;
  legionIds: string[];
}

/** Compact ring just outside the star hit (SYSTEM_HIT_R 20 + icon ~18). */
const FLEET_BASE_R = 40;
const FLEET_R_PER_FACTION = 4;
const FLEET_FAN_DA = 0.36;
const FLEET_FAN_RING = 0.26;
const LEGION_SOUTH_Y = 36;
const LEGION_FACTION_GAP = 28;
const LEGION_FAN_GAP = 20;
const LEGION_FAN_ROW = 15;

const KIND_RANK: Record<FleetKind, number> = {
  combat: 0,
  carrier: 1,
  patrol: 2,
  support: 3,
  transport: 4,
  trade: 5,
};

const LEGION_STATUS_RANK: Record<string, number> = {
  assault: 0,
  blockade: 1,
  fortify: 2,
  garrison: 3,
  move: 4,
  recovering: 5,
  idle: 6,
};

function groupByFaction<T extends { factionId: string }>(items: T[]): T[][] {
  const map = new Map<string, T[]>();
  const order: string[] = [];
  for (const item of items) {
    let list = map.get(item.factionId);
    if (!list) {
      list = [];
      map.set(item.factionId, list);
      order.push(item.factionId);
    }
    list.push(item);
  }
  return order.map((id) => map.get(id)!);
}

function groupsWithSelectedFirst<T extends { id: string }>(
  groups: T[][],
  selectedId?: string | null,
): T[][] {
  if (!selectedId) return groups;
  const idx = groups.findIndex((g) => g.some((x) => x.id === selectedId));
  if (idx <= 0) return groups;
  const next = groups.slice();
  const [g] = next.splice(idx, 1);
  next.unshift(g!);
  return next;
}

function leadFleet(group: Fleet[], selectedId?: string | null): Fleet {
  const selected = selectedId
    ? group.find((f) => f.id === selectedId)
    : undefined;
  if (selected) return selected;
  return [...group].sort((a, b) => {
    const dr = (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9);
    if (dr !== 0) return dr;
    return a.id.localeCompare(b.id);
  })[0]!;
}

function leadLegion(group: Legion[], selectedId?: string | null): Legion {
  const selected = selectedId
    ? group.find((l) => l.id === selectedId)
    : undefined;
  if (selected) return selected;
  return [...group].sort((a, b) => {
    const dr =
      (LEGION_STATUS_RANK[a.status] ?? 9) - (LEGION_STATUS_RANK[b.status] ?? 9);
    if (dr !== 0) return dr;
    const ds = (b.strength ?? 0) - (a.strength ?? 0);
    if (ds !== 0) return ds;
    return a.id.localeCompare(b.id);
  })[0]!;
}

/** 0, +1, -1, +2, -2… so the selected glyph stays on the faction anchor. */
function fanSide(k: number): number {
  if (k === 0) return 0;
  const mag = Math.ceil(k / 2);
  return k % 2 === 1 ? mag : -mag;
}

function fanMembers<T extends { id: string }>(
  group: T[],
  selectedId?: string | null,
): T[] {
  const lead = selectedId
    ? (group.find((x) => x.id === selectedId) ?? group[0]!)
    : group[0]!;
  const rest = group.filter((x) => x.id !== lead.id);
  return [lead, ...rest];
}

/**
 * One glyph per faction by default (×N badge). Selected faction fans out
 * in a tight east arc so many fleets no longer orbit a star-width away.
 */
export function layoutFleetsAroundSystem(
  system: { x: number; y: number },
  fleets: Fleet[],
  anim?: OrbitAnim,
  selectedFleetId?: string | null,
): FleetSlot[] {
  if (fleets.length === 0) return [];
  const p = toIso(system.x, system.y);
  const groups = groupsWithSelectedFirst(
    groupByFaction(fleets),
    selectedFleetId,
  );
  const n = groups.length;
  const rx = FLEET_BASE_R + Math.min(Math.max(n - 1, 0), 5) * FLEET_R_PER_FACTION;
  const ry = rx * 0.48;
  const a0 = -0.72;
  const a1 = 1.02;

  const slots: FleetSlot[] = [];
  groups.forEach((group, gi) => {
    const t = n === 1 ? 0.32 : gi / Math.max(n - 1, 1);
    const aFaction = a0 + (a1 - a0) * t;
    const expand =
      group.length === 1 ||
      (!!selectedFleetId && group.some((f) => f.id === selectedFleetId));
    const members = expand ? fanMembers(group, selectedFleetId) : [leadFleet(group, selectedFleetId)];
    const ids = group.map((f) => f.id);

    members.forEach((fleet, k) => {
      const side = expand ? fanSide(k) : 0;
      const ring = Math.abs(side) >= 3 ? 1 : 0;
      const a = aFaction + side * FLEET_FAN_DA;
      const rScale = (expand && fleet.id === selectedFleetId ? 0.92 : 1) + ring * FLEET_FAN_RING;
      const bob = anim ? Math.sin(anim.t * 2.2 + gi + k) * 0.4 : 0;
      slots.push({
        fleet,
        x: p.x + Math.cos(a) * rx * rScale,
        y: p.y + Math.sin(a) * ry * rScale + bob,
        stackCount: expand ? 1 : group.length,
        fleetIds: expand ? [fleet.id] : ids,
      });
    });
  });
  return slots;
}

/**
 * South of the star, one glyph per faction. Selected faction fans along
 * the row so stacked armies stay readable without a wide parking lot.
 */
export function layoutLegionsAroundSystem(
  system: { x: number; y: number },
  legions: Legion[],
  anim?: OrbitAnim,
  selectedLegionId?: string | null,
): LegionSlot[] {
  if (legions.length === 0) return [];
  const p = toIso(system.x, system.y);
  const groups = groupsWithSelectedFirst(
    groupByFaction(legions),
    selectedLegionId,
  );
  const n = groups.length;
  const gap = n > 4 ? 24 : LEGION_FACTION_GAP;

  const slots: LegionSlot[] = [];
  groups.forEach((group, gi) => {
    const anchorX = p.x + (gi - (n - 1) / 2) * gap;
    const expand =
      group.length === 1 ||
      (!!selectedLegionId && group.some((l) => l.id === selectedLegionId));
    const members = expand
      ? fanMembers(group, selectedLegionId)
      : [leadLegion(group, selectedLegionId)];
    const ids = group.map((l) => l.id);

    members.forEach((legion, k) => {
      const side = expand ? fanSide(k) : 0;
      const row = Math.abs(side) >= 3 ? 1 : 0;
      const bob = anim ? Math.sin(anim.t * 2 + gi + k) * 0.35 : 0;
      slots.push({
        legion,
        x: anchorX + side * LEGION_FAN_GAP,
        y: p.y + LEGION_SOUTH_Y + row * LEGION_FAN_ROW + bob,
        stackCount: expand ? 1 : group.length,
        legionIds: expand ? [legion.id] : ids,
      });
    });
  });
  return slots;
}

/**
 * Click a stack glyph: first pick selects, same glyph again cycles the
 * faction's units in that system, stack of one toggles off.
 * Clicking a different member of an expanded fan selects that member.
 */
export function cycleStackSelection(
  units: { id: string; factionId: string; systemId: string }[],
  clickedId: string,
  selectedId: string | null,
): string | null {
  const clicked = units.find((u) => u.id === clickedId);
  if (!clicked) return clickedId;
  if (selectedId !== clickedId) return clickedId;
  const stack = units.filter(
    (u) => u.systemId === clicked.systemId && u.factionId === clicked.factionId,
  );
  if (stack.length <= 1) return selectedId === clickedId ? null : clickedId;
  const idx = stack.findIndex((u) => u.id === clickedId);
  const at = idx < 0 ? 0 : idx;
  return stack[(at + 1) % stack.length]!.id;
}
