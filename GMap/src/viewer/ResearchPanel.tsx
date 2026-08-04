import { useEffect, useMemo, useState } from "react";
import type { ViewerPayload } from "../state/types";
import type {
  TechnologyDef,
  TechUpgrade,
  EconomyCategory,
} from "../state/contentCatalog";
import { getCachedContent } from "../state/contentCatalog";
import {
  effectiveCognitioCost,
  missingRequireProperties,
} from "../state/researchCosts";
import { canBuildWithTech } from "../state/techGate";
import { StatefulButton } from "../ui/StatefulButton";
import { ActionRing } from "../ui/ActionRing";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { useSpotlight } from "../ui/aceternityFx";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";
import { ResearchRadialTree } from "./ResearchRadialTree";
import {
  ResearchQueue,
  EffectsList,
  CognitioForecast,
  buildQueueForecasts,
  cognitioSparkFromRecent,
  ResearchTimeline,
  UpgradesComparison,
  QUEUE_MAX,
  RESEARCH_FILTER_LABELS,
  COGNITIO_DND_MIME,
  type ResearchFilter,
} from "./research";
import { buildResearchPath } from "./research/researchPath";

const CAT_ORDER: EconomyCategory[] = ["A", "B", "C", "D", "E", "F"];
const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};
const CAT_NAME = ECO_CATEGORY_NAMES;

export const RESEARCH_BRANCH_BY_DIGIT: Record<string, EconomyCategory> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D",
  "5": "E",
  "6": "F",
};

function cognitioCost(
  tech: TechnologyDef | TechUpgrade,
  eco?: ViewerPayload["economy"],
  category?: string,
): number {
  return effectiveCognitioCost(tech, eco, category);
}

function prereqNames(
  tech: TechnologyDef,
  byId: Map<string, TechnologyDef>,
): string {
  const ids = tech.prerequisites || [];
  if (!ids.length) return "—";
  return ids.map((id) => byId.get(id)?.name ?? id).join(", ");
}

function lockLabel(tech: TechnologyDef): string | null {
  const content = getCachedContent();
  if (tech.raceLock) {
    const name = content?.races?.[tech.raceLock]?.name ?? tech.raceLock;
    return `Только для расы «${name}» (≥30%)`;
  }
  if (tech.factionTraitLock) {
    const name =
      content?.faction_traits?.traits?.[tech.factionTraitLock]?.name ??
      tech.factionTraitLock;
    return `Только с чертой «${name}»`;
  }
  return null;
}

function factionTraitIds(
  traits: Array<string | { id: string }> | undefined,
): string[] {
  const out: string[] = [];
  for (const t of traits || []) {
    if (typeof t === "string") out.push(t);
    else if (t?.id) out.push(t.id);
  }
  return out;
}

/** Weighted race share % across owned inhabited planets (client mirror of server). */
function raceSharePercent(
  world: ViewerPayload["world"] | undefined,
  factionId: string | undefined,
  raceId: string,
): number {
  if (!world || !factionId || !raceId) return 0;
  const faction = world.factions?.find((f) => f.id === factionId);
  let weighted = 0;
  let popSum = 0;
  for (const sys of world.systems || []) {
    if (sys.ownerFactionId !== factionId) continue;
    for (const p of sys.planets || []) {
      const pop = Number(p.population || 0);
      if (pop <= 0) continue;
      popSum += pop;
      const mix =
        p.raceComposition?.length > 0
          ? p.raceComposition
          : [
              {
                raceId:
                  (faction as { primaryRaceId?: string } | undefined)
                    ?.primaryRaceId || "race_human",
                percent: 100,
              },
            ];
      for (const share of mix) {
        if (share.raceId === raceId) {
          weighted += pop * ((share.percent ?? 0) / 100);
        }
      }
    }
  }
  if (popSum <= 0) return 0;
  return (weighted / popSum) * 100;
}

function lockBlocksResearch(
  tech: TechnologyDef,
  world: ViewerPayload["world"] | undefined,
  factionId: string | undefined,
  eco?: ViewerPayload["economy"],
): boolean {
  if (tech.raceLock) {
    if (raceSharePercent(world, factionId, tech.raceLock) < 30) return true;
  }
  if (tech.factionTraitLock) {
    const faction = world?.factions?.find((f) => f.id === factionId);
    if (!factionTraitIds(faction?.traits).includes(tech.factionTraitLock)) {
      return true;
    }
  }
  if (missingRequireProperties(tech, eco).length > 0) return true;
  return false;
}

function buildingsUnlockedByTech(
  tech: TechnologyDef,
  tiers: Record<string, number>,
  unlockedProperties: string[],
): { name: string; id: string }[] {
  const buildings = Object.values(getCachedContent()?.buildings || {});
  if (!buildings.length) return [];

  const nextTiers = { ...tiers };
  const nextProps = [...unlockedProperties];
  for (const e of tech.effects || []) {
    if (e.effect === "unlock_tech_tier") {
      const cat = String(e.args.category ?? "");
      const to = Number(e.args.to);
      if (cat) nextTiers[cat] = Math.max(Number(nextTiers[cat] ?? 1), to);
    } else if (e.effect === "unlock_property" && e.args.property) {
      const p = String(e.args.property);
      if (!nextProps.includes(p)) nextProps.push(p);
    }
  }

  const before = { techTiers: tiers, unlockedProperties };
  const after = { techTiers: nextTiers, unlockedProperties: nextProps };
  const out: { name: string; id: string }[] = [];
  for (const b of buildings) {
    if (canBuildWithTech(before, b).ok) continue;
    if (canBuildWithTech(after, b).ok) out.push({ name: b.name, id: b.id });
  }
  return out;
}

type NextBuy = { tech: TechnologyDef; cost: number };

/**
 * Research room: radial tech wheel (6 spokes) + queue + detail rail.
 */
export function ResearchPanel({
  eco,
  world,
  factionId,
  onResearch,
  onResearchUpgrade,
  onSetQueue,
  onAccelerate,
  busy,
  msg,
  asRoom,
  branch: branchProp,
  onBranchChange,
  highlightTechId,
  cognitioIncome = 0,
  categoryIncome = 0,
  categoryDemand = 0,
  flowTotals,
  onOpenBuilding,
  onTechMapDrag,
  onEffectNavigate,
}: {
  eco: ViewerPayload["economy"];
  world?: ViewerPayload["world"];
  factionId?: string;
  onResearch: (techId: string) => void;
  onResearchUpgrade?: (techId: string, upgradeId: string) => void;
  onSetQueue?: (queue: string[]) => void;
  onAccelerate?: (techId: string) => void;
  busy?: boolean;
  msg?: string | null;
  asRoom?: boolean;
  branch?: EconomyCategory | null;
  onBranchChange?: (c: EconomyCategory | null) => void;
  highlightTechId?: string | null;
  cognitioIncome?: number;
  categoryIncome?: number;
  categoryDemand?: number;
  flowTotals?: Record<string, { rate?: number; demand?: number; net?: number }>;
  onOpenBuilding?: (buildingName: string) => void;
  onTechMapDrag?: (techId: string) => void;
  onEffectNavigate?: (target: import("./research/EffectsList").EffectNavigateTarget) => void;
}) {
  const [branchLocal, setBranchLocal] = useState<EconomyCategory | null>(null);
  const [filter, setFilter] = useState<ResearchFilter>("all");
  const [search, setSearch] = useState("");
  const [nodeRing, setNodeRing] = useState<{
    techId: string;
    x: number;
    y: number;
  } | null>(null);
  const focusBranch =
    branchProp !== undefined ? branchProp : branchLocal;
  const setFocusBranch = (c: EconomyCategory | null) => {
    setBranchLocal(c);
    onBranchChange?.(c);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [pendingUpgradeId, setPendingUpgradeId] = useState<string | null>(null);
  const branchSpot = useSpotlight();
  const detailSpot = useSpotlight();

  const { byCat, byId } = useMemo(() => {
    const dict = getCachedContent()?.technologies || {};
    const list = Object.values(dict);
    const idMap = new Map(list.map((t) => [t.id, t]));
    const map = new Map<EconomyCategory, TechnologyDef[]>();
    for (const c of CAT_ORDER) map.set(c, []);
    for (const t of list) {
      const cat = (CAT_ORDER.includes(t.category as EconomyCategory)
        ? t.category
        : "A") as EconomyCategory;
      map.get(cat)!.push(t);
    }
    for (const arr of map.values()) {
      arr.sort(
        (a, b) => a.era - b.era || a.name.localeCompare(b.name, "ru"),
      );
    }
    return { byCat: map, byId: idMap };
  }, []);

  const unlocked = useMemo(
    () => new Set(eco?.unlockedTechs || []),
    [eco?.unlockedTechs],
  );
  const unlockedUpgrades = useMemo(
    () => new Set(eco?.unlockedUpgrades || []),
    [eco?.unlockedUpgrades],
  );
  const queue = eco?.researchQueue || [];
  const queueSet = useMemo(() => new Set(queue), [queue]);
  const cognitio = eco?.stocks?.["currency.cognitio"] ?? 0;
  const tiers = eco?.techTiers || {};
  const unlockedProps = eco?.unlockedProperties || [];

  const income =
    cognitioIncome != null
      ? cognitioIncome
      : (() => {
          const spark = cognitioSparkFromRecent(eco?.recent, 1);
          return spark[0] ?? 0;
        })();

  const forecasts = useMemo(
    () => buildQueueForecasts(queue, byId, cognitio, income, eco),
    [queue, byId, cognitio, income, eco],
  );
  const spark = useMemo(
    () => cognitioSparkFromRecent(eco?.recent, 10),
    [eco?.recent],
  );

  useEffect(() => {
    if (busy) return;
    if (pendingId) {
      if (msg?.startsWith("Исследовано")) {
        setSuccessId(pendingId);
      }
      setPendingId(null);
    }
    if (pendingUpgradeId) {
      if (msg?.startsWith("Улучшено")) {
        setSuccessId(pendingUpgradeId);
      }
      setPendingUpgradeId(null);
    }
  }, [busy, pendingId, pendingUpgradeId, msg]);

  useEffect(() => {
    if (highlightTechId && byId.has(highlightTechId)) {
      setSelectedId(highlightTechId);
      const tech = byId.get(highlightTechId);
      if (tech && CAT_ORDER.includes(tech.category as EconomyCategory)) {
        setFocusBranch(tech.category as EconomyCategory);
      }
    }
  }, [highlightTechId, byId]);

  // Auto-select first affordable / next in focus branch
  useEffect(() => {
    if (selectedId && byId.has(selectedId)) return;
    const pool = focusBranch
      ? byCat.get(focusBranch) ?? []
      : CAT_ORDER.flatMap((c) => byCat.get(c) ?? []);
    const next =
      pool.find(
        (t) =>
          !unlocked.has(t.id) &&
          (t.prerequisites || []).every((p) => unlocked.has(p)),
      ) ?? pool[0];
    if (next) setSelectedId(next.id);
  }, [selectedId, byId, byCat, unlocked, focusBranch]);

  const affordable = useMemo(() => {
    const list: NextBuy[] = [];
    for (const t of Object.values(getCachedContent()?.technologies || {})) {
      if (unlocked.has(t.id)) continue;
      if (!(t.prerequisites || []).every((p) => unlocked.has(p))) continue;
      if (lockBlocksResearch(t, world, factionId, eco)) continue;
      const cost = cognitioCost(t, eco, t.category);
      if (cognitio >= cost) list.push({ tech: t, cost });
    }
    list.sort(
      (a, b) =>
        a.cost - b.cost ||
        a.tech.era - b.tech.era ||
        a.tech.name.localeCompare(b.tech.name, "ru"),
    );
    return list;
  }, [unlocked, cognitio, world, factionId, eco]);

  const nextBuy = affordable[0] ?? null;
  const selected = selectedId ? byId.get(selectedId) : undefined;

  const selectedState = useMemo(() => {
    if (!selected) return null;
    const done = unlocked.has(selected.id);
    const prereqOk = (selected.prerequisites || []).every((p) =>
      unlocked.has(p),
    );
    const cost = cognitioCost(selected, eco, selected.category);
    const lock = lockLabel(selected);
    const lockBlocked = lockBlocksResearch(selected, world, factionId, eco);
    const canBuy =
      !done && prereqOk && !lockBlocked && cognitio >= cost && !busy;
    let status = "доступно";
    if (done) status = "исследовано";
    else if (!prereqOk) status = "закрыто";
    else if (lockBlocked) status = "эксклюзив";
    else if (cognitio < cost) status = "мало Знания";
    const buildings = buildingsUnlockedByTech(
      selected,
      tiers,
      unlockedProps,
    );
    const upgrades = selected.upgrades || [];
    const upgradeDone = upgrades.filter((u) => unlockedUpgrades.has(u.id)).length;
    const inQueue = queueSet.has(selected.id);
    const canQueue =
      !done &&
      !inQueue &&
      prereqOk &&
      !lockBlocked &&
      queue.length < QUEUE_MAX &&
      !!onSetQueue &&
      !busy;
    const availability: "available" | "queueable" | "blocked" = done
      ? "blocked"
      : canBuy
        ? "available"
        : canQueue
          ? "queueable"
          : "blocked";
    return {
      done,
      prereqOk,
      cost,
      canBuy,
      status,
      buildings,
      upgrades,
      upgradeDone,
      lock,
      lockBlocked,
      inQueue,
      canQueue,
      availability,
    };
  }, [
    selected,
    unlocked,
    unlockedUpgrades,
    cognitio,
    busy,
    tiers,
    unlockedProps,
    world,
    factionId,
    queueSet,
    queue.length,
    onSetQueue,
  ]);

  const requestResearch = (techId: string) => {
    setPendingId(techId);
    setSuccessId(null);
    onResearch(techId);
  };

  const requestUpgrade = (techId: string, upgradeId: string) => {
    if (!onResearchUpgrade) return;
    setPendingUpgradeId(upgradeId);
    setSuccessId(null);
    onResearchUpgrade(techId, upgradeId);
  };

  const changeQueue = (next: string[]) => {
    onSetQueue?.(next.slice(0, QUEUE_MAX));
  };

  const addToQueue = (techId: string) => {
    if (!onSetQueue) return;
    if (unlocked.has(techId)) return;
    if (queue.includes(techId)) return;
    if (queue.length >= QUEUE_MAX) return;
    const tech = byId.get(techId);
    if (!tech) return;
    if (!(tech.prerequisites || []).every((p) => unlocked.has(p))) return;
    if (lockBlocksResearch(tech, world, factionId, eco)) return;
    changeQueue([...queue, techId]);
  };

  const selectedPath = useMemo(() => {
    if (!selected) return null;
    return buildResearchPath(selected.id, byId, unlocked);
  }, [selected, byId, unlocked]);

  const jumpToNextBuy = () => {
    if (!nextBuy) return;
    const cat = nextBuy.tech.category as EconomyCategory;
    if (CAT_ORDER.includes(cat)) setFocusBranch(cat);
    setSelectedId(nextBuy.tech.id);
  };

  const buildingNames = selectedState?.buildings.map((b) => b.name) ?? [];

  const body = (
    <>
      <header className={asRoom === false ? undefined : "hq-panel-head"}>
        {asRoom !== false && <h2>Наука</h2>}
        {asRoom === false && <h3>Исследования</h3>}
        <div className="research-stock-row">
          <p className="hint research-stock">
            Знание:{" "}
            <AnimatedTooltip
              content="Перетащите на ноду дерева — изучить сейчас или ускорить слот очереди"
            >
              <strong
                className="tabular research-cognitio-chip"
                draggable={!busy && cognitio > 0}
                onDragStart={(e) => {
                  e.dataTransfer.setData(COGNITIO_DND_MIME, "currency.cognitio");
                  e.dataTransfer.setData("text/plain", "currency.cognitio");
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                {cognitio}
              </strong>
            </AnimatedTooltip>
            {income !== 0 ? (
              <span className="tabular">
                {" "}
                ({income > 0 ? "+" : ""}
                {income}/ход)
              </span>
            ) : null}
            {affordable.length > 0 ? (
              <span className="research-stock-hot">
                {" "}
                · доступно: {affordable.length}
              </span>
            ) : null}
          </p>
          <ul className="research-tier-pills" aria-label="Тиры категорий">
            {CAT_ORDER.map((c) => (
              <li
                key={c}
                style={{ color: CAT_COLOR[c], borderColor: CAT_COLOR[c] }}
                title={`${CAT_NAME[c]} · T${tiers[c] ?? 1}`}
              >
                <span>{c}</span>
                <strong className="tabular">{tiers[c] ?? 1}</strong>
              </li>
            ))}
          </ul>
        </div>
      </header>

      {onSetQueue ? (
        <ResearchQueue
          eco={eco}
          queue={queue}
          byId={byId}
          cognitio={cognitio}
          income={income}
          selectedId={selectedId}
          busy={busy}
          forecasts={forecasts}
          onSelect={setSelectedId}
          onChangeQueue={changeQueue}
          onAccelerate={onAccelerate}
        />
      ) : null}

      <CognitioForecast
        eco={eco}
        cognitio={cognitio}
        income={income}
        forecasts={forecasts}
        byId={byId}
        spark={spark}
      />

      {nextBuy && (
        <button
          type="button"
          className="research-next-buy"
          onClick={jumpToNextBuy}
        >
          <span className="hint">Лучший шаг</span>
          <strong style={{ color: CAT_COLOR[nextBuy.tech.category] }}>
            {nextBuy.tech.name}
          </strong>
          <span className="hint">
            {CAT_NAME[nextBuy.tech.category] ?? nextBuy.tech.category} ·{" "}
            <span className="tabular">
              {nextBuy.cost}/{cognitio}
            </span>
          </span>
          <div
            className="research-cognitio-bar"
            role="progressbar"
            aria-valuenow={Math.min(cognitio, nextBuy.cost)}
            aria-valuemin={0}
            aria-valuemax={nextBuy.cost}
          >
            <span
              style={{
                width: `${Math.min(100, (cognitio / Math.max(1, nextBuy.cost)) * 100)}%`,
              }}
            />
          </div>
        </button>
      )}

      <div className="research-filters" role="toolbar" aria-label="Фильтры">
        {(Object.keys(RESEARCH_FILTER_LABELS) as ResearchFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`research-filter-btn ${filter === f ? "on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {RESEARCH_FILTER_LABELS[f]}
          </button>
        ))}
        <label className="research-search">
                          <span className="sr-only">Поиск</span>
          <input
            type="search"
            placeholder="геол…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>

      <div
        className="research-branch-tabs anim-tabs"
        role="tablist"
        aria-label="Ветви науки"
      >
        <button
          type="button"
          role="tab"
          id="research-tab-all"
          aria-controls="research-panel-main"
          aria-selected={focusBranch == null}
          className={`research-branch-tab research-branch-tab--all fx-spotlight ${focusBranch == null ? "on" : ""}`}
          onClick={() => setFocusBranch(null)}
          title="Все ветви"
          {...branchSpot.bind}
        >
          <strong>Все</strong>
          <span className="hint">колесо</span>
        </button>
        {CAT_ORDER.map((c, i) => {
          const techs = byCat.get(c) ?? [];
          const done = techs.filter((t) => unlocked.has(t.id)).length;
          const branchAffordable = techs.some(
            (t) =>
              !unlocked.has(t.id) &&
              (t.prerequisites || []).every((p) => unlocked.has(p)) &&
              !lockBlocksResearch(t, world, factionId, eco) &&
              cognitio >= cognitioCost(t, eco, t.category),
          );
          return (
            <button
              key={c}
              type="button"
              role="tab"
              id={`research-tab-${c}`}
              aria-controls="research-panel-main"
              aria-selected={focusBranch === c}
              className={`research-branch-tab fx-spotlight ${focusBranch === c ? "on" : ""} ${branchAffordable ? "is-hot" : ""}`}
              style={
                {
                  borderColor: CAT_COLOR[c],
                  "--fx-spot-color": CAT_COLOR[c],
                } as React.CSSProperties
              }
              onClick={() => {
                setFocusBranch(c);
                const next = techs.find(
                  (t) =>
                    !unlocked.has(t.id) &&
                    (t.prerequisites || []).every((p) => unlocked.has(p)),
                );
                if (next) setSelectedId(next.id);
              }}
              title={`${CAT_NAME[c]} · Alt+${i + 1}`}
              {...branchSpot.bind}
            >
              <span className="research-tab-hotkey">Alt+{i + 1}</span>
              <span style={{ color: CAT_COLOR[c] }}>{c}</span>
              <strong>{CAT_NAME[c]}</strong>
              <span className="hint">
                T{tiers[c] ?? 1}
                {done === techs.length && techs.length ? " · ✓" : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="research-workbench"
        id="research-panel-main"
        role="tabpanel"
        aria-labelledby={
          focusBranch == null
            ? "research-tab-all"
            : `research-tab-${focusBranch}`
        }
      >
        <ResearchRadialTree
          byCat={byCat}
          unlocked={unlocked}
          unlockedUpgrades={unlockedUpgrades}
          cognitio={cognitio}
          eco={eco}
          selectedId={selectedId}
          focusBranch={focusBranch}
          busy={busy}
          onSelect={setSelectedId}
          filter={filter}
          search={search}
          highlightId={highlightTechId}
          queueIds={queueSet}
          onNodeDragStart={onTechMapDrag}
          isTechBlocked={(tech) =>
            lockBlocksResearch(tech, world, factionId, eco)
          }
          onCognitioDrop={(techId) => {
            const tech = byId.get(techId);
            if (!tech || busy) return;
            if (queueSet.has(techId) && onAccelerate) {
              onAccelerate(techId);
              return;
            }
            onResearch(techId);
          }}
          onNodeLongPress={(techId, x, y) => {
            setSelectedId(techId);
            setNodeRing({ techId, x, y });
          }}
        />

        {nodeRing ? (
          <ActionRing
            open
            x={nodeRing.x}
            y={nodeRing.y}
            onClose={() => setNodeRing(null)}
            items={[
              {
                id: "research",
                label: "Изучить",
                onSelect: () => {
                  onResearch(nodeRing.techId);
                  setNodeRing(null);
                },
              },
              ...(onSetQueue
                ? [
                    {
                      id: "queue",
                      label: "В очередь",
                      onSelect: () => {
                        addToQueue(nodeRing.techId);
                        setNodeRing(null);
                      },
                    },
                  ]
                : []),
              ...(onAccelerate && queueSet.has(nodeRing.techId)
                ? [
                    {
                      id: "rush",
                      label: "Ускорить",
                      onSelect: () => {
                        onAccelerate(nodeRing.techId);
                        setNodeRing(null);
                      },
                    },
                  ]
                : []),
            ]}
          />
        ) : null}

        <aside
          className={`research-detail fx-spotlight ${selected?.isBreakthrough ? "fx-glow" : ""}`}
          style={
            selected
              ? ({
                  "--fx-spot-color": CAT_COLOR[selected.category],
                  "--fx-glow-color": CAT_COLOR[selected.category],
                } as React.CSSProperties)
              : undefined
          }
          aria-live="polite"
          {...detailSpot.bind}
        >
          {!selected || !selectedState ? (
            <p className="hint">Выберите технологию на колесе.</p>
          ) : (
            <>
              <header className="research-detail-head">
                <span
                  className="research-cat"
                  style={{ color: CAT_COLOR[selected.category] }}
                >
                  {selected.category} · {CAT_NAME[selected.category]} · эра{" "}
                  {selected.era}
                  {selected.isBreakthrough ? " · брейкро" : ""}
                </span>
                <h3>
                  {selected.name}
                  {selectedState.lock ? (
                    <span
                      className="research-lock-badge"
                      title={selectedState.lock}
                    >
                      {" "}
                      🔒
                    </span>
                  ) : null}
                </h3>
                <span className="research-focus-status">
                  {selectedState.status}
                  {selectedState.done && selectedState.upgrades.length > 0
                    ? ` · ★${selectedState.upgradeDone}/${selectedState.upgrades.length}`
                    : ""}
                  {selectedState.inQueue ? " · в очереди" : ""}
                </span>
              </header>

              {selectedState.lock ? (
                <p className="hint research-lock-hint">{selectedState.lock}</p>
              ) : null}

              {selectedPath && selectedPath.steps.length > 1 && !selectedState.done ? (
                <div className="research-path-planner" aria-label="Путь исследования">
                  <strong>Путь</strong>
                  <ol>
                    {selectedPath.steps.map((s) => (
                      <li key={s.techId}>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => setSelectedId(s.techId)}
                        >
                          {s.name}
                        </button>
                        <span className="tabular hint"> · {s.cost}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="hint">
                    Итого {selectedPath.totalCognitio} cognitio ·{" "}
                    {selectedPath.steps.length} шагов
                  </p>
                </div>
              ) : null}

              <EffectsList
                effects={selected.effects}
                buildings={buildingNames}
                onBuildingClick={
                  onOpenBuilding
                    ? (name) => {
                        const hit = selectedState.buildings.find(
                          (b) => b.name === name,
                        );
                        if (hit) onOpenBuilding(hit.id);
                      }
                    : undefined
                }
                onEffectNavigate={onEffectNavigate}
              />

              <dl className="research-detail-meta">
                <div>
                  <dt>Стоимость</dt>
                  <dd
                    className={`tabular ${!selectedState.done && cognitio < selectedState.cost ? "is-short" : ""}`}
                  >
                    {selectedState.cost}
                    {!selectedState.done ? ` / ${cognitio}` : ""} Знание
                  </dd>
                </div>
                <div>
                  <dt>Требования</dt>
                  <dd>
                    {selectedState.prereqOk || selectedState.done
                      ? "выполнены"
                      : prereqNames(selected, byId)}
                  </dd>
                </div>
              </dl>

              {!selectedState.done ? (
                <div
                  className="research-cognitio-bar research-cognitio-bar--detail"
                  role="progressbar"
                  aria-valuenow={Math.min(cognitio, selectedState.cost)}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(1, selectedState.cost)}
                >
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (cognitio / Math.max(1, selectedState.cost)) * 100,
                      )}%`,
                    }}
                  />
                </div>
              ) : null}

              <div className="research-detail-cta">
                <StatefulButton
                  className={`btn ${selectedState.canBuy ? "primary fx-moving-border" : ""}`}
                  disabled={!selectedState.canBuy}
                  busy={busy && pendingId === selected.id}
                  success={successId === selected.id}
                  successLabel="Исследовано"
                  onClick={() => {
                    if (!selectedState.canBuy) return;
                    requestResearch(selected.id);
                  }}
                >
                  {selectedState.done ? "Исследовано" : "Исследовать"}
                </StatefulButton>
                {!selectedState.done && onSetQueue ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={!selectedState.canQueue}
                    onClick={() => addToQueue(selected.id)}
                  >
                    {selectedState.inQueue ? "В очереди" : "В очередь"}
                  </button>
                ) : null}
                {!selectedState.done && onTechMapDrag ? (
                  <button
                    type="button"
                    className="btn ghost"
                    title="Подсветить системы на карте"
                    onClick={() => onTechMapDrag(selected.id)}
                  >
                    На карту
                  </button>
                ) : null}
              </div>

              {selectedState.done && selectedState.upgrades.length > 0 ? (
                <UpgradesComparison
                  eco={eco}
                  tech={selected}
                  unlockedUpgrades={unlockedUpgrades}
                  unlockedTechs={unlocked}
                  cognitio={cognitio}
                  busy={busy}
                  pendingUpgradeId={pendingUpgradeId}
                  successId={successId}
                  categoryIncome={
                    flowTotals?.[selected.category]?.rate ?? categoryIncome
                  }
                  categoryDemand={
                    flowTotals?.[selected.category]?.demand ?? categoryDemand
                  }
                  onResearchUpgrade={
                    onResearchUpgrade
                      ? (techId, upgradeId) =>
                          requestUpgrade(techId, upgradeId)
                      : undefined
                  }
                />
              ) : null}
            </>
          )}
          {msg && (
            <p
              className={`hint research-msg ${msg.startsWith("Исследовано") || msg.startsWith("Улучшено") || msg.startsWith("Очередь") || msg.startsWith("Ускорено") ? "is-ok" : "is-err"}`}
              role="status"
            >
              {msg}
            </p>
          )}

          <ResearchTimeline recent={eco?.recent} />
        </aside>
      </div>
    </>
  );

  if (asRoom === false) {
    return <section className="hq-card research-panel">{body}</section>;
  }

  return (
    <div className="hq-panel research-panel research-panel--room research-panel--radial">
      {body}
    </div>
  );
}

/** Count techs the player can buy right now (for dock badge). */
export function countAffordableResearch(
  eco: ViewerPayload["economy"],
  world?: ViewerPayload["world"],
  factionId?: string,
): number {
  if (!eco) return 0;
  const unlocked = new Set(eco.unlockedTechs || []);
  const cognitio = eco.stocks?.["currency.cognitio"] ?? 0;
  let n = 0;
  for (const t of Object.values(getCachedContent()?.technologies || {})) {
    if (unlocked.has(t.id)) continue;
    if (!(t.prerequisites || []).every((p) => unlocked.has(p))) continue;
    if (lockBlocksResearch(t, world, factionId, eco)) continue;
    if (cognitio >= cognitioCost(t, eco, t.category)) n += 1;
  }
  return n;
}
