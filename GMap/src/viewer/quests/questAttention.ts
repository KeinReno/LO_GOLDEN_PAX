import type { ViewerPayload } from "../../state/types.ts";
import { adaptQuests, hasRolledPerTurn } from "./adaptQuest.ts";
import type { Quest } from "./types.ts";

export type AttentionReason =
  | "choice"
  | "dice"
  | "offered"
  | "expires"
  | "dropped";

export type AttentionItem = {
  quest: Quest;
  reason: AttentionReason;
  label: string;
};

function expiresSoon(q: Quest, turn: number): boolean {
  return q.expiresTurn != null && q.expiresTurn - turn <= 2;
}

function choiceCountLabel(n: number): string {
  if (n === 1) return "1 выбор";
  if (n < 5) return `${n} выбора`;
  return `${n} выборов`;
}

/** Quests that need a player decision this turn. */
export function collectAttention(
  quests: Quest[],
  turn: number,
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const q of quests) {
    if (q.status === "offered") {
      items.push({ quest: q, reason: "offered", label: "Новое предложение" });
      continue;
    }
    if (q.status !== "active") continue;
    const choices = q.choices?.length ?? 0;
    if (choices > 0) {
      items.push({
        quest: q,
        reason: "choice",
        label: choiceCountLabel(choices),
      });
      continue;
    }
    if (q.diceCheck) {
      items.push({ quest: q, reason: "dice", label: "Нужен бросок" });
      continue;
    }
    if (expiresSoon(q, turn)) {
      items.push({
        quest: q,
        reason: "expires",
        label: `До хода ${q.expiresTurn}`,
      });
    }
  }
  const rank: Record<AttentionReason, number> = {
    choice: 0,
    dice: 1,
    offered: 2,
    expires: 3,
    dropped: 4,
  };
  return items.sort((a, b) => rank[a.reason] - rank[b.reason]);
}

export function liveQuests(quests: Quest[]): Quest[] {
  return quests.filter(
    (q) => q.status !== "completed" && q.status !== "failed",
  );
}

export function firstAttentionQuestId(
  quests: Quest[],
  turn: number,
): string | null {
  return collectAttention(quests, turn)[0]?.quest.id ?? null;
}

export function workingQuests(
  quests: Quest[],
  attention: AttentionItem[],
): Quest[] {
  const hot = new Set(attention.map((a) => a.quest.id));
  return quests.filter(
    (q) => q.status === "active" && !hot.has(q.id),
  );
}

/** Dock / HQ badge: decisions this turn + unrolled yearly dice. Own journal only. */
export function questAttentionCount(payload: ViewerPayload): number {
  const quests = adaptQuests(payload, {});
  const turn = payload.world.meta?.turn ?? 0;
  const rolled = hasRolledPerTurn(payload.world, payload.factionId);
  return collectAttention(quests, turn).length + (rolled ? 0 : 1);
}
