import type { ShipGroup } from "../../state/types";
import { getCachedContent } from "../../state/contentCatalog";
import type { UnitCardModel } from "./UnitCard";

const DEFAULT_XP_THRESHOLDS = [0, 100, 250, 500, 900, 1500];

function cloneGroup(g: UnitCardModel): ShipGroup {
  return {
    type: g.type,
    count: g.count,
    defId: g.defId,
    hp: g.hp,
    filledSlots: g.filledSlots ? { ...g.filledSlots } : undefined,
    xp: g.xp,
    level: g.level,
  };
}

function sameClass(a: UnitCardModel, b: UnitCardModel): boolean {
  const aKey = a.defId || a.type;
  const bKey = b.defId || b.type;
  return Boolean(aKey) && aKey === bKey;
}

export function reorderComposition(
  composition: UnitCardModel[],
  from: number,
  to: number,
): ShipGroup[] {
  if (
    from < 0 ||
    to < 0 ||
    from >= composition.length ||
    to >= composition.length ||
    from === to
  ) {
    return composition.map(cloneGroup);
  }
  const next = composition.map(cloneGroup);
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function mergeComposition(
  composition: UnitCardModel[],
  fromIdx: number,
  toIdx: number,
): { ok: true; next: ShipGroup[] } | { ok: false; reason: string } {
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= composition.length ||
    toIdx >= composition.length ||
    fromIdx === toIdx
  ) {
    return { ok: false, reason: "Некорректные индексы" };
  }
  const from = composition[fromIdx];
  const to = composition[toIdx];
  if (!sameClass(from, to)) {
    return { ok: false, reason: "Нельзя объединить разные классы" };
  }
  const aFills = from.filledSlots ?? {};
  const bFills = to.filledSlots ?? {};
  for (const role of Object.keys(aFills)) {
    if (bFills[role] && bFills[role] !== aFills[role]) {
      return {
        ok: false,
        reason: "Разное оснащение — снимите слоты или объедините одинаковые",
      };
    }
  }
  const next = composition.map(cloneGroup);
  const a = next[fromIdx];
  const b = next[toIdx];
  const total = a.count + b.count;
  const avgHp =
    a.hp != null || b.hp != null
      ? Math.round(
          ((a.hp ?? 100) * a.count + (b.hp ?? 100) * b.count) / total,
        )
      : undefined;
  b.count = total;
  if (avgHp != null) b.hp = avgHp;
  b.level = Math.max(a.level ?? 0, b.level ?? 0);
  b.xp = (a.xp ?? 0) + (b.xp ?? 0);
  // Union compatible loadouts (conflicts rejected above)
  b.filledSlots = {
    ...aFills,
    ...bFills,
  };
  if (Object.keys(b.filledSlots).length === 0) b.filledSlots = undefined;
  next.splice(fromIdx, 1);
  return { ok: true, next };
}

export function disbandAt(
  composition: UnitCardModel[],
  index: number,
): { next: ShipGroup[]; removed: UnitCardModel | null } {
  if (index < 0 || index >= composition.length) {
    return { next: composition.map(cloneGroup), removed: null };
  }
  const next = composition.map(cloneGroup);
  const cur = next[index];
  const wasLast = cur.count <= 1;
  // Modules are stack-shared: only the last unit of a stack takes fills (and refunds).
  const removed: UnitCardModel = {
    type: cur.type,
    count: 1,
    defId: cur.defId,
    hp: cur.hp,
    filledSlots:
      wasLast && cur.filledSlots ? { ...cur.filledSlots } : undefined,
    xp: cur.xp,
    level: cur.level,
  };
  if (cur.count > 1) {
    cur.count -= 1;
  } else {
    next.splice(index, 1);
  }
  return { next, removed };
}

export function upgradeAt(
  composition: UnitCardModel[],
  index: number,
): { ok: true; next: ShipGroup[] } | { ok: false; reason: string } {
  if (index < 0 || index >= composition.length) {
    return { ok: false, reason: "Карта не найдена" };
  }
  const next = composition.map(cloneGroup);
  const level = next[index].level ?? 0;
  if (level >= 5) {
    return { ok: false, reason: "Максимальный ранг" };
  }
  const nextLevel = level + 1;
  next[index].level = nextLevel;
  const thresholds =
    (
      getCachedContent()?.rules as
        | { veterancy?: { thresholds?: number[] } }
        | undefined
    )?.veterancy?.thresholds ?? DEFAULT_XP_THRESHOLDS;
  const nextThreshold =
    thresholds[nextLevel] ??
    thresholds[thresholds.length - 1] ??
    DEFAULT_XP_THRESHOLDS[nextLevel] ??
    0;
  next[index].xp = Math.max(next[index].xp ?? 0, nextThreshold);
  return { ok: true, next };
}

export function fillSlotAt(
  composition: UnitCardModel[],
  index: number,
  role: string,
  resourceId: string,
): { ok: true; next: ShipGroup[]; previousId: string | null } | { ok: false; reason: string } {
  if (index < 0 || index >= composition.length) {
    return { ok: false, reason: "Карта не найдена" };
  }
  const next = composition.map(cloneGroup);
  const fills = { ...(next[index].filledSlots ?? {}) };
  const previousId = fills[role] ?? null;
  fills[role] = resourceId;
  next[index].filledSlots = fills;
  return { ok: true, next, previousId };
}

export function clearSlotAt(
  composition: UnitCardModel[],
  index: number,
  role: string,
): { ok: true; next: ShipGroup[]; clearedId: string | null } | { ok: false; reason: string } {
  if (index < 0 || index >= composition.length) {
    return { ok: false, reason: "Карта не найдена" };
  }
  const next = composition.map(cloneGroup);
  const fills = { ...(next[index].filledSlots ?? {}) };
  const clearedId = fills[role] ?? null;
  if (!clearedId) return { ok: false, reason: "Слот уже пуст" };
  delete fills[role];
  next[index].filledSlots =
    Object.keys(fills).length > 0 ? fills : undefined;
  return { ok: true, next, clearedId };
}

/** Pull one unit into reserve; returns remaining composition + extracted card. */
export function extractOneAt(
  composition: UnitCardModel[],
  index: number,
): { next: ShipGroup[]; extracted: UnitCardModel | null } {
  const { next, removed } = disbandAt(composition, index);
  return { next, extracted: removed };
}

export function appendGroup(
  composition: UnitCardModel[],
  card: UnitCardModel,
): ShipGroup[] {
  const next = composition.map(cloneGroup);
  const key = card.defId || card.type;
  const existing = next.findIndex(
    (g) => (g.defId || g.type) === key && sameFill(g, card),
  );
  if (existing >= 0) {
    next[existing].count += card.count;
    return next;
  }
  next.push(cloneGroup(card));
  return next;
}

function sameFill(a: UnitCardModel, b: UnitCardModel): boolean {
  const ak = Object.keys(a.filledSlots ?? {}).sort().join(",");
  const bk = Object.keys(b.filledSlots ?? {}).sort().join(",");
  if (ak !== bk) return false;
  for (const k of Object.keys(a.filledSlots ?? {})) {
    if ((a.filledSlots ?? {})[k] !== (b.filledSlots ?? {})[k]) return false;
  }
  return (a.level ?? 0) === (b.level ?? 0);
}

export function slotCapacity(slots: Array<{ role: string; count?: number }> | undefined): number {
  if (!slots || slots.length === 0) return 0;
  return slots.reduce((n, s) => n + Math.max(1, s.count ?? 1), 0);
}

export function filledSlotCount(group: UnitCardModel): number {
  return Object.keys(group.filledSlots ?? {}).length;
}

export function toUnitModels(
  composition:
    | Array<{
        type?: string;
        defId?: string;
        count?: number;
        hp?: number;
        filledSlots?: Record<string, string>;
        xp?: number;
        level?: number;
      }>
    | undefined,
): UnitCardModel[] {
  return (composition ?? []).map((c) => ({
    type: c.type ?? c.defId ?? "unit",
    count: c.count ?? 1,
    defId: c.defId,
    hp: c.hp,
    filledSlots: c.filledSlots,
    xp: c.xp,
    level: c.level,
  }));
}
