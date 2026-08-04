/**
 * Client mirror of server combatResolve veterancy bonuses.
 */
import { getCachedContent } from "../../state/contentCatalog";

const FALLBACK_BONUSES: Array<{
  stat_mult?: { damage?: number; defense?: number; armor?: number; shields?: number; hp?: number };
}> = [
  {},
  { stat_mult: { defense: 1.05 } },
  { stat_mult: { defense: 1.1, damage: 1.05 } },
  { stat_mult: { defense: 1.15, damage: 1.1 } },
  { stat_mult: { defense: 1.2, damage: 1.15 } },
  { stat_mult: { defense: 1.25, damage: 1.2 } },
];

export function veterancyBonuses() {
  const rules = getCachedContent()?.rules as
    | { veterancy?: { bonuses?: typeof FALLBACK_BONUSES } }
    | undefined;
  return rules?.veterancy?.bonuses ?? FALLBACK_BONUSES;
}

export function veterancyMult(level: number): {
  damage: number;
  defense: number;
  shields: number;
  hp: number;
} {
  const lv = Math.min(5, Math.max(0, Math.floor(level || 0)));
  const sm = veterancyBonuses()[lv]?.stat_mult ?? {};
  return {
    damage: Number(sm.damage ?? 1) || 1,
    defense: Number(sm.defense ?? sm.armor ?? 1) || 1,
    shields: Number(sm.shields ?? 1) || 1,
    hp: Number(sm.hp ?? 1) || 1,
  };
}

export function formatMultHint(mult: number): string {
  if (!Number.isFinite(mult) || mult === 1) return "";
  const pct = Math.round((mult - 1) * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

/** Effective combat stats after veterancy (matches server applyVeterancyToGroup). */
export function effectiveUnitStats(
  base: {
    damage?: number;
    armor?: number;
    defense?: number;
    shields?: number;
    hp?: number;
  } | null
    | undefined,
  level: number,
) {
  const m = veterancyMult(level);
  const damage = Number(base?.damage ?? 0);
  const armor = Number(base?.armor ?? base?.defense ?? 0);
  const shields = Number(base?.shields ?? 0);
  const hp = Number(base?.hp ?? 0);
  return {
    damage: Math.round(damage * m.damage * 10) / 10,
    armor: Math.round(armor * m.defense * 10) / 10,
    shields: Math.round(shields * m.shields * 10) / 10,
    hp: Math.round(hp * m.hp),
    mult: m,
  };
}
