import type { EffectInstance } from "../../state/types.ts";
import { staticCurrencyLabel } from "../../state/currencyNames.ts";
import type { QuestChoice, QuestEffect } from "./types.ts";

const EFFECT_KIND_RU: Record<string, string> = {
  resource: "ресурс",
  buff: "бонус",
  debuff: "штраф",
  population: "население",
  army: "армия",
  fleet: "флот",
  loyalty: "лояльность",
  stability: "стабильность",
  ap: "ОД",
};

function resourceUiLabel(id?: string): string {
  if (!id) return "ресурс";
  return staticCurrencyLabel(id);
}

export function choiceNeedsHold(choice: QuestChoice): boolean {
  if (choice.needsDice) return true;
  if (choice.costs && Object.keys(choice.costs).length > 0) return true;
  return (choice.effects ?? []).some((e) => e.value < 0);
}

export function digitChoiceIndex(
  key: string,
  choiceCount: number,
): number | null {
  const n = Number(key);
  if (!Number.isInteger(n) || n < 1 || n > choiceCount) return null;
  return n - 1;
}

export type EnterChoiceAction = "commit" | "hold-only" | "ignore";

export function enterChoiceAction(
  pendingId: string | null,
  choice: QuestChoice | undefined,
): EnterChoiceAction {
  if (!pendingId || !choice || choice.id !== pendingId) return "ignore";
  if (choiceNeedsHold(choice)) return "hold-only";
  return "commit";
}

export function formatEffectLine(effect: QuestEffect): string {
  const sign = effect.value >= 0 ? "+" : "−";
  const abs = Math.abs(effect.value);
  if (effect.kind === "resource") {
    return `${sign}${abs} ${resourceUiLabel(effect.target)}`;
  }
  const kind = EFFECT_KIND_RU[effect.kind] ?? effect.kind;
  return `${sign}${abs} ${kind}`;
}

export function formatChoiceCostLabel(
  costs: Record<string, number>,
): string | undefined {
  const parts = Object.entries(costs).map(
    ([id, amt]) => `−${amt} ${resourceUiLabel(id)}`,
  );
  return parts.length ? parts.join(" · ") : undefined;
}

export function formatChoiceOutcome(choice: QuestChoice): string | undefined {
  if (choice.resultText) return choice.resultText;
  const spend = choice.costs ?? {};
  const lines = (choice.effects ?? [])
    .filter((e) => {
      if (e.kind !== "resource" || e.value >= 0 || !e.target) return true;
      const full = e.target.includes(".") ? e.target : `currency.${e.target}`;
      return spend[full] == null && spend[e.target] == null;
    })
    .map(formatEffectLine);
  return lines.length ? lines.join(" · ") : undefined;
}

export function diceDifficultyLabel(dice?: number, dc?: number): string {
  if (dc != null) return `Сложность ${dc}`;
  if (dice != null) return `Кубик ${dice} граней`;
  return "Проверка";
}

export function uiEffectsFromWorld(
  effects: EffectInstance[] | undefined,
): QuestEffect[] {
  const out: QuestEffect[] = [];
  for (const e of effects ?? []) {
    const amt = Number(e.args?.amount ?? 0);
    const res =
      e.args?.resource != null ? String(e.args.resource) : undefined;
    if (
      e.effect === "production_flat" ||
      e.effect === "upkeep_flat" ||
      e.effect === "yield_flat"
    ) {
      out.push({ kind: "resource", target: res, value: amt });
      continue;
    }
    if (e.effect === "loyalty_add") {
      out.push({ kind: "loyalty", value: amt });
      continue;
    }
    if (e.effect === "stability_add") {
      out.push({ kind: "stability", value: amt });
      continue;
    }
    if (e.effect === "ap_add") {
      out.push({ kind: "ap", value: amt });
      continue;
    }
    if (e.effect === "pop_cap_add" || e.effect === "pop_cap_flat") {
      out.push({ kind: "population", value: amt });
      continue;
    }
    const known: QuestEffect["kind"][] = [
      "population",
      "army",
      "fleet",
      "loyalty",
      "buff",
      "debuff",
    ];
    const kind = known.includes(e.effect as QuestEffect["kind"])
      ? (e.effect as QuestEffect["kind"])
      : "buff";
    out.push({ kind, target: res, value: amt });
  }
  return out;
}

export function formatWorldEffectsLabel(
  effects: EffectInstance[] | undefined,
): string | undefined {
  const lines = uiEffectsFromWorld(effects).map(formatEffectLine);
  return lines.length ? lines.join(" · ") : undefined;
}
