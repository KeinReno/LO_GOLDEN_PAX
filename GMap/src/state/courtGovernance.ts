import type {
  EffectInstance,
  Faction,
  FactionCouncil,
  FactionNpc,
  InternalBloc,
} from "./types";
import type { PublicContent } from "./contentCatalog";
import {
  COUNCIL_PORTFOLIO_LABELS,
  councilPortfolioLabel,
} from "./displayLabels";

export type InfluenceLine = {
  label: string;
  effect: string;
  args?: Record<string, unknown>;
};

export type CouncilPortfolioDef = {
  id: string;
  label: string;
  roles?: string[];
  factionEffects?: EffectInstance[];
};

export type CouncilSeatDef = {
  id: string;
  label: string;
  kind?: string;
  roles?: string[];
  angleDeg?: number;
  defaultUnlocked?: boolean;
  defaultPortfolio?: string;
  unlockHint?: string;
  factionEffects?: EffectInstance[];
};

/** Resolve assigned or default portfolio id for a seat. */
export function resolveSeatPortfolioId(
  fac: Pick<Faction, "council"> | null | undefined,
  seatId: string,
  content: PublicContent | null,
): string | null {
  const assigned = fac?.council?.seatPortfolios?.[seatId];
  if (assigned) return assigned;
  const def = content?.council_seats?.seats?.[seatId];
  return def?.defaultPortfolio ?? null;
}

export function listCouncilPortfolios(
  content: PublicContent | null,
): CouncilPortfolioDef[] {
  const raw = content?.council_seats?.portfolios ?? {};
  const list = Object.values(raw);
  if (list.length) return list;
  return Object.entries(COUNCIL_PORTFOLIO_LABELS).map(([id, label]) => ({
    id,
    label,
  }));
}

export function resolveSeatTitle(
  seat: Pick<CouncilSeatDef, "id" | "label" | "kind">,
  council: FactionCouncil | undefined,
): string {
  const override = council?.seatLabels?.[seat.id];
  if (override) return override;
  if (seat.kind === "ruler" || seat.id === "seat.ruler") return seat.label || "Правитель";
  return seat.label || "Советник";
}

export function portfolioLabelForSeat(
  fac: Pick<Faction, "council"> | null | undefined,
  seatId: string,
  content: PublicContent | null,
): string | null {
  const id = resolveSeatPortfolioId(fac, seatId, content);
  if (!id) return null;
  const def = content?.council_seats?.portfolios?.[id];
  return def?.label ?? councilPortfolioLabel(id);
}

function seatInfluenceEffects(
  npc: FactionNpc,
  content: PublicContent | null,
  fac?: Pick<Faction, "council"> | null,
): InfluenceLine[] {
  if (!npc.councilSeat) return [];
  const seatId = npc.councilSeat;
  const seatDef = content?.council_seats?.seats?.[seatId];
  const portfolioId = resolveSeatPortfolioId(fac ?? null, seatId, content);
  const portfolioDef = portfolioId
    ? content?.council_seats?.portfolios?.[portfolioId]
    : null;
  const effects =
    portfolioDef?.factionEffects?.length
      ? portfolioDef.factionEffects
      : seatDef?.factionEffects ?? [];
  const label =
    portfolioDef?.label ||
    seatDef?.label ||
    seatId;
  return effects.map((e) => ({
    label,
    effect: e.effect,
    args: e.args,
  }));
}

function fmtEffect(e: InfluenceLine): string {
  const a = e.args || {};
  if (e.effect === "loyalty_add") return `лояльность ${Number(a.amount) >= 0 ? "+" : ""}${a.amount}`;
  if (e.effect === "stability_add") return `стабильность ${Number(a.amount) >= 0 ? "+" : ""}${a.amount}`;
  if (e.effect === "production_mult") {
    const m = Number(a.mult ?? 1);
    const pct = Math.round((m - 1) * 100);
    return `производство ${pct >= 0 ? "+" : ""}${pct}%`;
  }
  if (e.effect === "stat_mult") {
    const m = Number(a.mult ?? 1);
    const pct = Math.round((m - 1) * 100);
    return `${a.stat || "стат"} ${pct >= 0 ? "+" : ""}${pct}%`;
  }
  if (e.effect === "pop_growth_mult") {
    const m = Number(a.mult ?? 1);
    const pct = Math.round((m - 1) * 100);
    return `рост ${pct >= 0 ? "+" : ""}${pct}%`;
  }
  if (e.effect === "npc_task_speed_mult") {
    const m = Number(a.mult ?? 1);
    const pct = Math.round((m - 1) * 100);
    return `поручения ${pct >= 0 ? "+" : ""}${pct}%`;
  }
  if (e.effect === "move_cost_mult") {
    const m = Number(a.mult ?? 1);
    const pct = Math.round((1 - m) * 100);
    return `ход ${pct >= 0 ? "−" : "+"}${Math.abs(pct)}%`;
  }
  return e.effect;
}

export function formatInfluenceLine(e: InfluenceLine): string {
  return `${e.label}: ${fmtEffect(e)}`;
}

/** Client-side mirror of server explainNpcInfluence for dossier UI. */
export function explainNpcInfluence(
  npc: FactionNpc,
  content: PublicContent | null,
  fac?: Pick<Faction, "council"> | null,
): { realm: InfluenceLine[]; local: InfluenceLine[] } {
  const traitCatalog = content?.npc_traits?.traits ?? {};
  const postingCatalog = content?.npc_postings?.postings ?? {};
  const realm: InfluenceLine[] = [];
  const local: InfluenceLine[] = [];

  for (const traitId of npc.traitIds ?? []) {
    const def = traitCatalog[traitId];
    if (!def) continue;
    for (const e of def.effects ?? []) {
      realm.push({ label: def.name || traitId, effect: e.effect, args: e.args });
    }
    if (
      npc.posting &&
      npc.posting.kind !== "court" &&
      (def.scope === "both" || def.postingEffects)
    ) {
      for (const e of def.postingEffects ?? def.effects ?? []) {
        local.push({
          label: def.name || traitId,
          effect: e.effect,
          args: e.args,
        });
      }
    }
  }

  const posting = npc.posting;
  if (posting && posting.kind !== "court") {
    const postDef = postingCatalog[posting.kind];
    if (postDef) {
      const localKey =
        posting.kind === "governor"
          ? "systemEffects"
          : posting.kind === "commander"
            ? "legionEffects"
            : "fleetEffects";
      for (const e of (postDef[localKey as keyof typeof postDef] as
        | EffectInstance[]
        | undefined) ?? []) {
        local.push({
          label: postDef.name || posting.kind,
          effect: e.effect,
          args: e.args,
        });
      }
      for (const e of postDef.factionEffects ?? postDef.effects ?? []) {
        realm.push({
          label: `${postDef.name || posting.kind} (держава)`,
          effect: e.effect,
          args: e.args,
        });
      }
    }
  }

  realm.push(...seatInfluenceEffects(npc, content, fac));

  return { realm, local };
}

export function stanceLabel(stance: InternalBloc["stance"] | string): string {
  if (stance === "loyal") return "опора";
  if (stance === "ambitious") return "амбиции";
  if (stance === "hostile") return "угроза";
  return "нейтр.";
}

export function blocKindLabel(kind?: string): string {
  if (kind === "house") return "дом";
  if (kind === "church") return "церковь";
  if (kind === "military") return "войско";
  if (kind === "guild") return "гильдия";
  if (kind === "race_caucus") return "народ";
  if (kind === "guest") return "гости";
  return "сила";
}

export type NpcHat = {
  kind: "advisor" | "race_leader" | "bloc_leader" | "governor" | "commander" | "admiral";
  label: string;
  detail?: string;
  vacant?: boolean;
};

/** All “hats” an NPC wears — for dossier / badges. */
export function listNpcHats(
  npc: FactionNpc,
  opts?: {
    blocs?: InternalBloc[];
    seatLabel?: string | null;
    postingTargetLabel?: string | null;
  },
): NpcHat[] {
  const hats: NpcHat[] = [];
  if (npc.councilSeat) {
    hats.push({
      kind: "advisor",
      label: npc.isPlayerRuler ? "Правитель" : "Советник",
      detail: opts?.seatLabel || npc.councilSeat,
    });
  }
  if (npc.raceLeadership?.raceId) {
    hats.push({
      kind: "race_leader",
      label: npc.raceLeadership.title || "Лидер народа",
      detail: npc.raceLeadership.raceId.replace(/^race_/, ""),
    });
  }
  const bloc = npc.blocId
    ? opts?.blocs?.find((b) => b.id === npc.blocId)
    : undefined;
  if (npc.isBlocLeader || (bloc && bloc.leaderNpcId === npc.id)) {
    hats.push({
      kind: "bloc_leader",
      label: "Глава дома",
      detail: bloc?.name || npc.blocId || undefined,
    });
  }
  const pk = npc.posting?.kind || "court";
  if (pk === "governor") {
    hats.push({
      kind: "governor",
      label: "Наместник",
      detail: opts?.postingTargetLabel || npc.posting?.systemId,
    });
  } else if (pk === "commander") {
    hats.push({
      kind: "commander",
      label: "Командующий",
      detail: opts?.postingTargetLabel || npc.posting?.legionId,
    });
  } else if (pk === "admiral") {
    hats.push({
      kind: "admiral",
      label: "Флотоводец",
      detail: opts?.postingTargetLabel || npc.posting?.fleetId,
    });
  }
  return hats;
}

export function systemHasGovernor(
  npcs: FactionNpc[] | undefined,
  systemId: string,
): boolean {
  return (npcs ?? []).some(
    (n) =>
      n.status !== "dead" &&
      n.status !== "hidden" &&
      n.posting?.kind === "governor" &&
      n.posting?.systemId === systemId,
  );
}
