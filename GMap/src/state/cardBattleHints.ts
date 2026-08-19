import { getCachedContent } from "./contentCatalog";
import { lookupContentResource } from "./resourceIndex";
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

/** Tooltip copy — keep in sync with server keyword effects. */
export const KEYWORD_HINTS: Record<string, string> = {
  escort:
    "Эскорт: перехватывает удар по соседней карте. Сосед получает −15% входящего. Пока жив — база закрыта.",
  overwhelm: "Прорыв: избыток урона после уничтожения цели уходит в базу.",
  siege: "Осада: усиленный удар по базе.",
  support:
    "Поддержка: при выставлении — Block и добор. Сосед получает +15% исходящего.",
  brace: "Упор: в начале раунда даёт Block.",
};

export const AURA_LABELS: Record<string, string> = {
  escort: "прикрыт",
  support: "крыло",
};

export const AURA_HINTS: Record<string, string> = {
  escort: "Сосед-эскорт: входящий урон ×0.85",
  support: "Сосед-поддержка: исходящий урон ×1.15",
};

export const PROPERTY_TAG_LABELS: Record<string, string> = {
  amp: "усил.",
  hull_break: "крушение",
  shield_pierce: "пробой щита",
  shield_absorb: "щит",
  hull_pierce: "пробой",
  hull_resist: "корпус",
};

export const PROPERTY_TAG_HINTS: Record<string, string> = {
  amp: "weapon_amp: исходящий ×1.2",
  hull_break: "matter_destroy: ×1.5 и ломает броню",
  shield_pierce: "Пробивает щит (×1.4)",
  shield_absorb: "Щит поглощает (×0.6)",
  hull_pierce: "Оружие выше корпуса: ×1.5",
  hull_resist: "Корпус не пробит: ×0.7",
};

const PIERCE_TAGS = new Set(["amp", "hull_break", "shield_pierce", "hull_pierce"]);

export const STATUS_LABELS: Record<string, string> = {
  vulnerable: "уязв.",
  weak: "слаб.",
  focus: "фокус",
};

export const STATUS_HINTS: Record<string, string> = {
  vulnerable: "Уязвим: входящий урон ×1.5",
  weak: "Ослаблен: исходящий урон ×0.75",
  focus: "Фокус: удар пробивает Block",
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

type AuraCard = {
  cardId?: string;
  role: string;
  bonusKeywords?: string[];
  count?: number;
};

export type FormationAuraMods = {
  outgoingMult: number;
  incomingMult: number;
  tags: string[];
};

/** Parity with server formationAuraMods. */
export function formationAuraMods(
  card: AuraCard | null | undefined,
  line: AuraCard[] | null | undefined,
  rules?: { formationAuras?: { escortIncomingMult?: number; supportOutgoingMult?: number } },
): FormationAuraMods {
  const cfg =
    rules?.formationAuras ||
    getCachedContent()?.rules?.cardBattle?.formationAuras ||
    {};
  const escortIn = cfg.escortIncomingMult ?? 0.85;
  const supportOut = cfg.supportOutgoingMult ?? 1.15;
  const tags: string[] = [];
  let outgoingMult = 1;
  let incomingMult = 1;
  if (!card) return { outgoingMult, incomingMult, tags };
  const idx = (line || []).findIndex((c) => c.cardId === card.cardId);
  if (idx < 0) return { outgoingMult, incomingMult, tags };
  for (const delta of [-1, 1] as const) {
    const n = line?.[idx + delta];
    if (!n || (n.count ?? 1) <= 0) continue;
    const kws = keywordsForCard(n);
    if (kws.includes("escort")) {
      incomingMult *= escortIn;
      if (!tags.includes("escort")) tags.push("escort");
    }
    if (kws.includes("support")) {
      outgoingMult *= supportOut;
      if (!tags.includes("support")) tags.push("support");
    }
  }
  return { outgoingMult, incomingMult, tags };
}

type SlotCard = { filledSlots?: Record<string, string> };

function resolveClientSlot(
  card: SlotCard | null | undefined,
  role: string,
  content: ReturnType<typeof getCachedContent>,
) {
  const id = card?.filledSlots?.[role];
  if (!id) return null;
  const res = lookupContentResource(content, id);
  if (!res) return null;
  const tier = Number(res.tier);
  return {
    properties: res.properties || [],
    effectiveTier: Number.isFinite(tier) ? tier : null,
  };
}

export type PropertyBreakdown = { mult: number; tags: string[] };

/** Parity with server propertyCombatBreakdown. */
export function propertyCombatBreakdown(
  attacker: SlotCard | null | undefined,
  defender: SlotCard | null | undefined,
  content = getCachedContent(),
): PropertyBreakdown {
  const tags: string[] = [];
  if (!content?.combat_property_matchups) return { mult: 1, tags };
  const fills = attacker?.filledSlots || {};
  if (Object.keys(fills).length === 0) return { mult: 1, tags };

  let mult = 1;
  const weapon = resolveClientSlot(attacker, "weapon", content);
  const shield = defender ? resolveClientSlot(defender, "shield", content) : null;
  const hull = defender ? resolveClientSlot(defender, "hull", content) : null;

  if (weapon) {
    if (weapon.properties.includes("weapon_amp")) {
      mult *= 1.2;
      tags.push("amp");
    }
    if (weapon.properties.includes("matter_destroy")) {
      mult *= 1.5;
      tags.push("hull_break");
    }
  }
  if (weapon && shield) {
    if (
      weapon.properties.includes("psion_suppress") ||
      weapon.properties.includes("matter_destroy")
    ) {
      mult *= 1.4;
      tags.push("shield_pierce");
    } else if (shield.properties.includes("shield")) {
      mult *= 0.6;
      tags.push("shield_absorb");
    }
  }
  if (weapon && hull) {
    const wt = weapon.effectiveTier;
    const ht = hull.effectiveTier;
    if (wt != null && ht != null) {
      if (wt > ht) {
        mult *= 1.5;
        tags.push("hull_pierce");
      } else {
        mult *= 0.7;
        tags.push("hull_resist");
      }
    }
  }
  return { mult, tags };
}

export function propertyTagLabel(tag: string): string {
  return PROPERTY_TAG_LABELS[tag] || tag;
}

export function propertyTagHint(tag: string): string {
  return PROPERTY_TAG_HINTS[tag] || propertyTagLabel(tag);
}

export function propertyTagTone(tag: string): "good" | "bad" | "neutral" {
  if (tag === "shield_absorb" || tag === "hull_resist") return "bad";
  if (PIERCE_TAGS.has(tag)) return "good";
  return "neutral";
}

export function auraLabel(tag: string): string {
  return AURA_LABELS[tag] || tag;
}

export function auraHint(tag: string): string {
  return AURA_HINTS[tag] || auraLabel(tag);
}

export function keywordLabel(kw: string): string {
  return KEYWORD_LABELS[kw] || kw;
}

export function keywordHint(kw: string): string {
  return KEYWORD_HINTS[kw] || keywordLabel(kw);
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] || status;
}

export function statusHint(status: string): string {
  return STATUS_HINTS[status] || statusLabel(status);
}

export function cardProvidesEscort(card: {
  role: string;
  bonusKeywords?: string[];
  count?: number;
}): boolean {
  if ((card.count ?? 1) <= 0) return false;
  return (
    keywordsForCard(card).includes("escort") || card.role === "screen"
  );
}

export function defenderHpPool(card: {
  hp: number;
  maxHp: number;
  count: number;
}): number {
  const maxHp = Math.max(1, card.maxHp || card.hp || 1);
  const currentHp = card.hp || maxHp;
  return Math.max(0, currentHp + Math.max(0, (card.count || 0) - 1) * maxHp);
}

export type StrikePreview = {
  damage: number;
  lethal: boolean;
  overflowToBase: number;
  propertyMult: number;
  propertyTags: string[];
  auraTags: string[];
};

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
  return estimateStrikeOutcome(attacker, defender, opts).damage;
}

/** Preview + lethal / overwhelm overflow (parity with server resolveCardPair). */
export function estimateStrikeOutcome(
  attacker: BattleCard,
  defender: BattleCard | null,
  opts: {
    atkBuff?: { damageMult?: number; flankBase?: boolean; bombard?: boolean };
    outgoingMult?: number;
    incomingMult?: number;
    defBuff?: { defenseMult?: number };
    atkLine?: BattleCard[];
    defLine?: BattleCard[];
  } = {},
): StrikePreview {
  const atkBuff = opts.atkBuff || {};
  const atkAura = formationAuraMods(attacker, opts.atkLine);
  const defAura = defender
    ? formationAuraMods(defender, opts.defLine)
    : { outgoingMult: 1, incomingMult: 1, tags: [] as string[] };
  const prop = propertyCombatBreakdown(attacker, defender);
  const outgoing =
    (opts.outgoingMult ?? 1) * atkAura.outgoingMult;
  const incoming =
    (opts.incomingMult ?? 1) * defAura.incomingMult;
  const dmgMult = (atkBuff.damageMult ?? 1) * outgoing;
  const hpRatio = Math.max(0.35, attacker.hp / Math.max(1, attacker.maxHp));
  let raw =
    attacker.damage *
    dmgMult *
    (0.55 + attacker.accuracy / 220) *
    (1 + (attacker.shields || 0) / 250) *
    Math.max(1, attacker.count) *
    hpRatio *
    prop.mult;
  const auraTags = [...new Set([...atkAura.tags, ...defAura.tags])];
  if (defender) {
    raw *= matchupMult(attacker.role, defender.role);
    const defMit =
      1 +
      Math.min(
        0.35,
        ((defender.defense || 0) * 0.004 + (defender.shields || 0) * 0.002) *
          (opts.defBuff?.defenseMult ?? 1),
      );
    const damage = Math.max(1, Math.round((raw * 0.65 * incoming) / defMit));
    const pool = defenderHpPool(defender);
    const lethal = pool > 0 && damage >= pool;
    const overwhelm = keywordsForCard(attacker).includes("overwhelm");
    const overflowToBase =
      lethal && overwhelm ? Math.max(0, damage - pool) : 0;
    return {
      damage,
      lethal,
      overflowToBase,
      propertyMult: prop.mult,
      propertyTags: prop.tags,
      auraTags,
    };
  }
  let mult = 0.5;
  if (atkBuff.flankBase) mult = 0.6;
  if (atkBuff.bombard || keywordForRole(attacker.role) === "siege") mult = 0.75;
  if (keywordForRole(attacker.role) === "siege") raw *= 1.5;
  const damage = Math.max(1, Math.round(raw * mult));
  return {
    damage,
    lethal: false,
    overflowToBase: 0,
    propertyMult: prop.mult,
    propertyTags: prop.tags,
    auraTags,
  };
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
