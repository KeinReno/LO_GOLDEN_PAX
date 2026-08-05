import { getCachedContent } from "./contentCatalog";
import { COMBAT_ROLE_LABELS } from "../viewer/forces/constants";
import type { BattleCard, CardBattleState } from "./types";

const HEAVY = new Set(["capital", "carrier", "armor", "bombard"]);

/** Mirrors server ROLE_KEYWORDS. */
export const ROLE_KEYWORDS: Record<string, string> = {
  screen: "escort",
  capital: "overwhelm",
  bombard: "siege",
  carrier: "support",
  armor: "brace",
};

export const KEYWORD_LABELS: Record<string, string> = {
  escort: "Эскорт",
  overwhelm: "Прорыв",
  siege: "Осада",
  support: "Поддержка",
  brace: "Упор",
};

export function cardEnergyCost(role: string): number {
  return HEAVY.has(role) ? 2 : 1;
}

export function roleLabel(role: string): string {
  return COMBAT_ROLE_LABELS[role] ?? role;
}

export function keywordForRole(role: string): string | null {
  return ROLE_KEYWORDS[role] || null;
}

export function keywordsForCard(card: {
  role: string;
  bonusKeywords?: string[];
}): string[] {
  const out: string[] = [];
  const base = keywordForRole(card.role);
  if (base) out.push(base);
  for (const k of card.bonusKeywords || []) {
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}

export function keywordLabel(kw: string): string {
  return KEYWORD_LABELS[kw] || kw;
}

export function matchupHints(role: string): {
  strongVs: string[];
  weakVs: string[];
} {
  const row = getCachedContent()?.combat_matchups?.[role] || {};
  const entries = Object.entries(row);
  if (!entries.length) return { strongVs: [], weakVs: [] };
  const sorted = entries.slice().sort((a, b) => b[1] - a[1]);
  return {
    strongVs: sorted.filter(([, v]) => v >= 1.15).slice(0, 2).map(([r]) => r),
    weakVs: sorted
      .filter(([, v]) => v <= 0.85)
      .slice(-2)
      .map(([r]) => r),
  };
}

export function matchupMult(atkRole: string, defRole: string): number {
  const row = getCachedContent()?.combat_matchups?.[atkRole] || {};
  return row[defRole] ?? 1;
}

export function hintTone(
  atkRole: string,
  defRole: string,
): "good" | "bad" | "neutral" {
  const m = matchupMult(atkRole, defRole);
  if (m >= 1.15) return "good";
  if (m <= 0.85) return "bad";
  return "neutral";
}

/** Client-side damage preview (parity with server estimateStrikeDamage). */
export function estimateStrikePreview(
  attacker: BattleCard,
  defender: BattleCard | null,
  opts: {
    atkBuff?: { damageMult?: number; flankBase?: boolean; bombard?: boolean };
    outgoingMult?: number;
    incomingMult?: number;
    defBuff?: { defenseMult?: number };
  } = {},
): number {
  const atkBuff = opts.atkBuff || {};
  const outgoing = opts.outgoingMult ?? 1;
  const dmgMult = (atkBuff.damageMult ?? 1) * outgoing;
  const hpRatio = Math.max(0.35, attacker.hp / Math.max(1, attacker.maxHp));
  let raw =
    attacker.damage *
    dmgMult *
    (0.55 + attacker.accuracy / 220) *
    (1 + (attacker.shields || 0) / 250) *
    Math.max(1, attacker.count) *
    hpRatio;
  if (defender) {
    raw *= matchupMult(attacker.role, defender.role);
    const incoming = opts.incomingMult ?? 1;
    const defMit =
      1 +
      Math.min(
        0.35,
        ((defender.defense || 0) * 0.004 + (defender.shields || 0) * 0.002) *
          (opts.defBuff?.defenseMult ?? 1),
      );
    return Math.max(1, Math.round((raw * 0.65 * incoming) / defMit));
  }
  let mult = 0.5;
  if (atkBuff.flankBase) mult = 0.6;
  if (atkBuff.bombard || keywordForRole(attacker.role) === "siege") mult = 0.75;
  if (keywordForRole(attacker.role) === "siege") raw *= 1.5;
  return Math.max(1, Math.round(raw * mult));
}

export function frontStrikeCost(
  state: CardBattleState | null | undefined,
  sideId: string,
  cardId: string,
): number {
  const struck = state?.struckThisRound?.[sideId] || [];
  return struck.includes(cardId) ? 1 : 0;
}

export function intentLabel(
  intent: NonNullable<CardBattleState["intents"]>[string],
): string {
  if (!intent) return "";
  if (intent.label) return intent.label;
  if (intent.kind === "deploy") return "выставит карту";
  if (intent.kind === "strike") return "готовит удар";
  if (intent.kind === "order") return "приказ";
  if (intent.kind === "pass") return "готов";
  return String(intent.kind);
}
