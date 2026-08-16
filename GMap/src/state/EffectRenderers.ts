/**
 * Effect dictionary for UI — one renderer per effect id.
 * New effect ⇒ add here (+ tech_schema enum), not if(techId) in components.
 */
import { ECO_CATEGORY_NAMES } from "../viewer/economyFlowTypes";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "./economyLabels";

export type EffectInstance = {
  effect: string;
  args: Record<string, unknown>;
};

export type EffectView = {
  icon: string;
  short: string;
  tip: string;
};

type Renderer = (args: Record<string, unknown>) => EffectView;

function catName(cat: unknown): string {
  const c = String(cat ?? "");
  return ECO_CATEGORY_NAMES[c] ?? c;
}

function resourceLabel(args: Record<string, unknown>): string {
  if (args.resource) {
    const id = String(args.resource);
    const fromCat = CATEGORY_CURRENCIES.find((c) => c.id === id);
    if (fromCat) return fromCat.name;
    if (id === BUILD_METAL.id) return BUILD_METAL.label;
    if (id === BUILD_SUPPLY.id) return BUILD_SUPPLY.label;
    return id.replace(/^currency\./, "");
  }
  if (args.category) return catName(args.category);
  return "выход";
}

const RENDERERS: Record<string, Renderer> = {
  unlock_tech_tier: (a) => {
    const name = catName(a.category);
    const to = a.to;
    return {
      icon: "🔓",
      short: `${name} → T${to}`,
      tip: `Разблокирует тир ${to} категории ${name}`,
    };
  },
  unlock_property: (a) => ({
    icon: "🛡",
    short: `свойство «${a.property}»`,
    tip: `Открывает свойство ${a.property}`,
  }),
  open_path: (a) => ({
    icon: "🗺",
    short: `путь «${a.pathId}»`,
    tip: `Открывает путь развития ${a.pathId}`,
  }),
  production_mult: (a) => {
    const pct = Math.round((Number(a.mult) - 1) * 100);
    const label = resourceLabel(a);
    return {
      icon: "📈",
      short: `+${pct}% ${label}`,
      tip: `Множитель производства ×${a.mult}`,
    };
  },
  upkeep_mult: (a) => {
    const pct = Math.round(Number(a.mult) * 100);
    const label = resourceLabel(a);
    return {
      icon: "📉",
      short: `${pct}% апкип ${label}`,
      tip: `Множитель апкипа ×${a.mult}`,
    };
  },
  production_flat: (a) => ({
    icon: "➕",
    short: `+${a.amount} ${resourceLabel(a)}`,
    tip: `Плоский бонус производства +${a.amount}`,
  }),
  research_cost_mult: (a) => ({
    icon: "🔬",
    short: `наука ×${a.mult}${a.category ? ` (${a.category})` : ""}`,
    tip: `Стоимость исследований ×${a.mult}`,
  }),
  unit_upgrade: (a) => ({
    icon: "🚀",
    short: `${a.from} → ${a.to}`,
    tip: `Апгрейд юнитов ${a.from} → ${a.to}`,
  }),
  stat_mult: (a) => ({
    icon: "⚔",
    short: `${a.stat} ×${a.mult}`,
    tip: `Множитель стата ${a.stat}`,
  }),
  capacity_add: (a) => ({
    icon: "▦",
    short: `+${a.amount} ёмкость ${catName(a.category)} T${a.tier}`,
    tip: `Добавляет ёмкость категории ${catName(a.category)} тир ${a.tier}`,
  }),
  ap_add: (a) => ({
    icon: "◆",
    short: `+${a.amount} AP`,
    tip: `Добавляет ${a.amount} очко(а) действий`,
  }),
  cost_mult: (a) => ({
    icon: "🏗",
    short: `стоимость ×${a.mult}${a.tag ? ` (${a.tag})` : ""}`,
    tip: `Множитель стоимости ×${a.mult}`,
  }),
  pop_growth_mult: (a) => ({
    icon: "🌱",
    short: `рост ×${a.mult}`,
    tip: `Множитель роста населения ×${a.mult}`,
  }),
  move_cost_mult: (a) => ({
    icon: "↗",
    short: `ход ×${a.mult}`,
    tip: `Множитель стоимости хода ×${a.mult}`,
  }),
  building_level_mult: (a) => ({
    icon: "🏛",
    short: `здания ×${a.mult}`,
    tip: `Множитель уровня зданий ×${a.mult}`,
  }),
  logistics_disconnected_penalty: (a) => ({
    icon: "⛓",
    short: `логистика ${a.mult ?? a.amount ?? ""}`,
    tip: `Штраф отключённой логистики`,
  }),
  combat_role_mult: (a) => ({
    icon: "⚔",
    short: `vs ${a.role} ×${a.mult}`,
    tip: `Множитель силы против роли ${a.role}`,
  }),
};

export function renderEffect(e: EffectInstance): EffectView {
  const fn = RENDERERS[e.effect];
  if (fn) return fn(e.args || {});
  return {
    icon: "•",
    short: e.effect,
    tip: e.effect,
  };
}

export function renderEffects(effects: EffectInstance[] | undefined): EffectView[] {
  return (effects || []).map(renderEffect);
}

/** Register / override a renderer (content packs, tests). */
export function registerEffectRenderer(effectId: string, renderer: Renderer) {
  RENDERERS[effectId] = renderer;
}
