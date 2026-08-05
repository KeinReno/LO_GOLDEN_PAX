import type { Faction, FactionEffectInstance } from "../../state/types";
import type { PublicContent } from "../../state/contentCatalog";
import {
  explainNpcInfluence,
  formatInfluenceLine,
  type InfluenceLine,
} from "../../state/courtGovernance";

export type EffectAuditRow = {
  id: string;
  sourceKind: string;
  sourceLabel: string;
  scope: string;
  targetId?: string;
  summary: string;
  effect: string;
};

const SOURCE_KIND_LABEL: Record<string, string> = {
  council_seat: "Двор · место",
  npc_trait: "Двор · черта",
  npc_posting: "Двор · пост",
  quest: "Квест",
  tech: "Технология",
  policy: "Политика",
  other: "Прочее",
};

function rowFromActive(
  e: FactionEffectInstance,
  idx: number,
): EffectAuditRow {
  const kind = e.source?.kind ?? "other";
  const label = e.source?.label ?? kind;
  const scope = e.scope ?? "faction";
  const line: InfluenceLine = {
    label,
    effect: e.effect,
    args: e.args,
  };
  return {
    id: `active:${idx}:${e.source?.id ?? e.effect}`,
    sourceKind: kind,
    sourceLabel: label,
    scope,
    targetId: e.targetId,
    summary: formatInfluenceLine(line),
    effect: e.effect,
  };
}

/** Realm + local modifiers for active faction (stored + derived from NPCs). */
export function auditFactionEffects(
  faction: Faction | null | undefined,
  content: PublicContent | null,
): EffectAuditRow[] {
  if (!faction) return [];
  const rows: EffectAuditRow[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < (faction.activeEffects ?? []).length; i++) {
    const e = faction.activeEffects![i]!;
    const row = rowFromActive(e, i);
    const key = `${row.sourceKind}|${row.sourceLabel}|${row.summary}|${row.scope}|${row.targetId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
  }

  for (const npc of faction.npcs ?? []) {
    if (npc.status === "dead" || npc.status === "hidden") continue;
    const { realm, local } = explainNpcInfluence(npc, content, faction);
    for (const [scope, list] of [
      ["faction", realm],
      ["local", local],
    ] as const) {
      for (const line of list) {
        const key = `npc:${npc.id}|${scope}|${line.label}|${line.effect}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          id: key,
          sourceKind: npc.councilSeat ? "council_seat" : "npc_trait",
          sourceLabel: `${npc.name}: ${line.label}`,
          scope,
          summary: formatInfluenceLine(line),
          effect: line.effect,
        });
      }
    }
  }

  return rows.sort((a, b) =>
    a.sourceKind.localeCompare(b.sourceKind) ||
    a.sourceLabel.localeCompare(b.sourceLabel),
  );
}

export function effectSourceKindLabel(kind: string): string {
  return SOURCE_KIND_LABEL[kind] ?? kind;
}
