import type { GmLiveDomainId } from "../../state/types";
import type { IntentRow } from "../IntentsInbox";
import type { WorldState } from "../../state/types";
import { findContestedIntentGroups } from "./contestedIntents";

export type GmAttentionKind =
  | "intents"
  | "contested"
  | "combat"
  | "quest"
  | "timer"
  | "loyalty"
  | "deficit"
  | "alchemy"
  | "npc_task";

export type GmAttentionItem = {
  id: string;
  kind: GmAttentionKind;
  label: string;
  detail?: string;
  domain: GmLiveDomainId;
  factionId?: string | null;
  systemId?: string | null;
  priority: number;
};

type EngagementLite = {
  id: string;
  status?: string;
  systemId?: string;
  theater?: string;
};

/**
 * Build GM Attention list for Live strip.
 * Pure + sync — engagements/intents passed from callers that already fetch.
 */
export function buildGmAttention(opts: {
  world: WorldState;
  pendingIntents?: IntentRow[];
  engagements?: EngagementLite[];
}): GmAttentionItem[] {
  const { world } = opts;
  const turn = world.meta?.turn ?? 0;
  const items: GmAttentionItem[] = [];

  const pending = opts.pendingIntents ?? [];

  // C5 T5.4 — contested orders (same rank + same target/resource)
  const contested = findContestedIntentGroups(pending);
  for (const g of contested) {
    const sysId = g.claimKey.startsWith("sys:") ? g.claimKey.slice(4) : null;
    const sysName = sysId
      ? (world.systems.find((s) => s.id === sysId)?.name ?? sysId)
      : null;
    items.push({
      id: g.id,
      kind: "contested",
      label: `⚔ Спор · ${sysName ?? g.claimLabel}`,
      detail: `ранг ${g.rank} · ${g.intents.length} приказов · ${g.factionIds.length} фракц.`,
      domain: "inbox",
      factionId: g.factionIds[0] ?? null,
      systemId: sysId,
      priority: 0,
    });
  }

  if (pending.length > 0) {
    const byFac = new Map<string, number>();
    for (const i of pending) {
      byFac.set(i.factionId, (byFac.get(i.factionId) ?? 0) + 1);
    }
    for (const [factionId, n] of byFac) {
      const name =
        world.factions.find((f) => f.id === factionId)?.name ?? factionId;
      items.push({
        id: `intent:${factionId}`,
        kind: "intents",
        label: `${name}: ${n} приказ${n === 1 ? "" : n < 5 ? "а" : "ов"}`,
        domain: "inbox",
        factionId,
        priority: contested.length > 0 ? 1 : 0,
      });
    }
  }

  for (const e of opts.engagements ?? []) {
    if (
      e.status !== "active" &&
      e.status !== "commit" &&
      e.status !== "contact"
    ) {
      continue;
    }
    const sys = world.systems.find((s) => s.id === e.systemId);
    items.push({
      id: `combat:${e.id}`,
      kind: "combat",
      label: `Бой · ${sys?.name ?? e.theater ?? e.id}`,
      detail: e.status === "contact" ? "контакт" : e.status === "commit" ? "решение" : undefined,
      domain: "diplo",
      systemId: e.systemId ?? null,
      priority: 1,
    });
  }

  for (const q of world.quests ?? []) {
    if (q.status !== "active" && q.status !== "hidden") continue;
    if (q.expiresTurn != null && q.expiresTurn - turn <= 2) {
      items.push({
        id: `quest-exp:${q.id}`,
        kind: "quest",
        label: `Квест истекает · ${q.name}`,
        detail: `ход ${q.expiresTurn}`,
        domain: "quests",
        systemId: q.systemId ?? null,
        priority: 2,
      });
    }
  }

  for (const sys of world.systems) {
    for (const t of sys.timers ?? []) {
      const left = t.expiresTurn - turn;
      if (left <= 1) {
        items.push({
          id: `timer:${sys.id}:${t.id}`,
          kind: "timer",
          label: `Таймер · ${sys.name}`,
          detail: t.label?.trim() || `ход ${t.expiresTurn}`,
          domain: "ops",
          systemId: sys.id,
          priority: 2,
        });
      }
    }
  }

  const lowLoyalty: {
    systemId: string;
    name: string;
    count: number;
    minLoy: number;
    factionId: string | null;
  }[] = [];
  for (const sys of world.systems) {
    const planets = (sys.planets ?? []).filter(
      (p) => typeof p.loyalty === "number" && p.loyalty < 35,
    );
    if (!planets.length) continue;
    const minLoy = Math.min(
      ...planets.map((p) => p.loyalty as number),
    );
    lowLoyalty.push({
      systemId: sys.id,
      name: sys.name,
      count: planets.length,
      minLoy,
      factionId:
        sys.ownerFactionId ?? planets[0]?.ownerFactionId ?? null,
    });
  }
  if (lowLoyalty.length > 3) {
    const worst = [...lowLoyalty].sort((a, b) => a.minLoy - b.minLoy)[0]!;
    items.push({
      id: "loyal:summary",
      kind: "loyalty",
      label: `Лояльность · ${worst.name} и ещё ${lowLoyalty.length - 1}`,
      detail: `мин. ${Math.round(worst.minLoy)}`,
      domain: "court",
      systemId: worst.systemId,
      factionId: worst.factionId,
      priority: 3,
    });
  } else {
    for (const row of lowLoyalty) {
      items.push({
        id: `loyal:${row.systemId}`,
        kind: "loyalty",
        label:
          row.count > 1
            ? `Низкая лояльность · ${row.name} (${row.count})`
            : `Низкая лояльность · ${row.name}`,
        detail: `мин. ${Math.round(row.minLoy)}`,
        domain: "court",
        systemId: row.systemId,
        factionId: row.factionId,
        priority: 3,
      });
    }
  }

  for (const f of world.factions) {
    for (const npc of f.npcs ?? []) {
      const task = npc.currentTask;
      if (!task) continue;
      const left = task.etaTurn - turn;
      if (left <= 0) {
        items.push({
          id: `npc:${npc.id}:${task.id}`,
          kind: "npc_task",
          label: `${npc.name}: поручение к сдаче`,
          detail: task.label,
          domain: "court",
          factionId: f.id,
          priority: 2,
        });
      }
    }
  }

  items.sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label, "ru"));
  return items.slice(0, 24);
}
