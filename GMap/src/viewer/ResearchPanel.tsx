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
import {
  postFillTechSocket,
  postUpgradeTechGrade,
} from "../state/researchClient";
import { canBuildWithTech } from "../state/techGate";
import { StatefulButton } from "../ui/StatefulButton";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { useSpotlight } from "../ui/aceternityFx";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";
import {
  directionColor,
  directionLabel,
  listDirectionIds,
  resolveTechDirection,
  RESEARCH_DIRECTION_BY_DIGIT,
} from "../state/techDirections";
import {
  ResearchQueue,
  EffectsList,
  CognitioForecast,
  buildQueueForecasts,
  cognitioSparkFromRecent,
  ResearchTimeline,
  TechProgressControls,
  UpgradesComparison,
  QUEUE_MAX,
  TECH_DND_MIME,
  type ResearchFilter,
} from "./research";
import {
  hybridLockLabel,
  hybridResearchBlocked,
} from "../state/hybridClient";
import { buildResearchPath } from "./research/researchPath";
import { AlchemyLab } from "./research/AlchemyLab";
import { ResearchPathsPanel } from "./research/ResearchPathsPanel";
import { ResearchOffers } from "./research/ResearchOffers";
import { TechGraphCanvas } from "./research/graph/TechGraphCanvas";
import { useTouchDrag } from "./shared/useTouchDrag";
import {
  clearTechDragIdDeferred,
  getTechDragId,
  setCognitioDragging,
} from "./research/researchDragBus";

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

export const RESEARCH_BRANCH_BY_DIGIT: Record<string, string> =
  RESEARCH_DIRECTION_BY_DIGIT;

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
  const hybrid = hybridLockLabel(tech);
  if (hybrid) return hybrid;
  if (tech.raceLock) {
    const name = content?.races?.[tech.raceLock]?.name ?? tech.raceLock;
    return `Только для расы «${name}» (от 30% населения)`;
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
  if (
    hybridResearchBlocked(
      tech,
      eco?.unlockedLineages,
      world,
      factionId,
    )
  ) {
    return true;
  }
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
 * Research room: path scores + pan/zoom tech graph + detail rail.
 */
export function ResearchPanel({
  eco,
  world,
  factionId,
  onResearch,
  onResearchUpgrade,
  onUpgradeGrade,
  onFillSocket,
  onSetQueue,
  onAccelerate,
  onAlchemyExperiment,
  onRerollOffer,
  busy,
  msg,
  compact = false,
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
  onUpgradeGrade?: (techId: string) => void;
  onFillSocket?: (techId: string, resourceId: string) => void;
  onSetQueue?: (queue: string[]) => void;
  onAccelerate?: (techId: string) => void;
  onAlchemyExperiment?: (techA: string, techB: string) => void;
  onRerollOffer?: (direction: string) => void;
  busy?: boolean;
  msg?: string | null;
  /** Phone BottomSheet: single column, hide desktop hotkeys. */
  compact?: boolean;
  branch?: string | null;
  onBranchChange?: (c: string | null) => void;
  highlightTechId?: string | null;
  cognitioIncome?: number;
  categoryIncome?: number;
  categoryDemand?: number;
  flowTotals?: Record<string, { rate?: number; demand?: number; net?: number }>;
  onOpenBuilding?: (buildingName: string) => void;
  onTechMapDrag?: (techId: string) => void;
  onEffectNavigate?: (target: import("./research/EffectsList").EffectNavigateTarget) => void;
}) {
  const [scienceMode, setScienceMode] = useState<"tree" | "lab">("tree");
  const [labSeed, setLabSeed] = useState<{
    a: string | null;
    b: string | null;
    key: number;
  } | null>(null);
  const [branchLocal, setBranchLocal] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const filter: ResearchFilter = "all";
  const [railOpen, setRailOpen] = useState(!compact);

  const openLabWith = (a: string | null, b: string | null = null) => {
    if (!onAlchemyExperiment) return;
    setLabSeed({ a, b, key: Date.now() });
    setScienceMode("lab");
  };
  const focusBranch =
    branchProp !== undefined ? branchProp : branchLocal;
  const setFocusBranch = (c: string | null) => {
    setBranchLocal(c);
    onBranchChange?.(c);
  };

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [pendingUpgradeId, setPendingUpgradeId] = useState<string | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [progressEco, setProgressEco] = useState<{
    stocks?: Record<string, number>;
    techGrades?: Record<string, number>;
    techSockets?: Record<string, string>;
  } | null>(null);
  const branchSpot = useSpotlight();
  const detailSpot = useSpotlight();

  const bindCognitioDrag = useTouchDrag(
    ({ first, last }) => {
      if (busy || cognitio <= 0) return;
      if (first) setCognitioDragging(true);
      if (last) setCognitioDragging(false);
    },
    { filterTaps: true },
  );

  const { byId, byDir } = useMemo(() => {
    const dict = getCachedContent()?.technologies || {};
    const list = Object.values(dict);
    const idMap = new Map(list.map((t) => [t.id, t]));
    const dirMap = new Map<string, TechnologyDef[]>();
    for (const d of listDirectionIds()) dirMap.set(d, []);
    for (const t of list) {
      const dir = resolveTechDirection(t) || "industry";
      if (!dirMap.has(dir)) dirMap.set(dir, []);
      dirMap.get(dir)!.push(t);
    }
    for (const arr of dirMap.values()) {
      arr.sort(
        (a, b) => a.era - b.era || a.name.localeCompare(b.name, "ru"),
      );
    }
    return { byId: idMap, byDir: dirMap };
  }, []);

  const allTechs = useMemo(() => {
    const out: TechnologyDef[] = [];
    for (const d of listDirectionIds()) {
      const arr = byDir.get(d);
      if (arr) out.push(...arr);
    }
    return out;
  }, [byDir]);

  const unlocked = useMemo(
    () => new Set(eco?.unlockedTechs || []),
    [eco?.unlockedTechs],
  );
  const openBranch = (c: string, era?: number) => {
    setFocusBranch(c);
    const techs = byDir.get(c) ?? [];
    const pool =
      era != null ? techs.filter((t) => (t.era || 1) === era) : techs;
    const next = pool.find(
      (t) =>
        !unlocked.has(t.id) &&
        (t.prerequisites || []).every((p) => unlocked.has(p)),
    );
    if (next) setSelectedId(next.id);
  };
  const openDirectionFromNode = (techId: string) => {
    const dir = resolveTechDirection(byId.get(techId));
    if (dir) openBranch(dir);
  };
  const unlockedUpgrades = useMemo(
    () => new Set(eco?.unlockedUpgrades || []),
    [eco?.unlockedUpgrades],
  );
  const queue = eco?.researchQueue || [];
  const queueSet = useMemo(() => new Set(queue), [queue]);
  const liveEco: ViewerPayload["economy"] = eco
    ? {
        ...eco,
        stocks: progressEco?.stocks ?? eco.stocks,
        techGrades: progressEco?.techGrades ?? eco.techGrades,
        techSockets: progressEco?.techSockets ?? eco.techSockets,
      }
    : eco;
  const cognitio = liveEco?.stocks?.["currency.cognitio"] ?? 0;
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
      if (tech) {
        const dir = resolveTechDirection(tech);
        if (dir) {
          setFocusBranch(dir);
        }
      }
    }
  }, [highlightTechId, byId]);

  // Auto-select first affordable / next in focus branch
  useEffect(() => {
    if (selectedId && byId.has(selectedId)) return;
    const pool = focusBranch
      ? byDir.get(focusBranch) ?? []
      : listDirectionIds().flatMap((d) => byDir.get(d) ?? []);
    const next =
      pool.find(
        (t) =>
          !unlocked.has(t.id) &&
          (t.prerequisites || []).every((p) => unlocked.has(p)),
      ) ?? pool[0];
    if (next) setSelectedId(next.id);
  }, [selectedId, byId, byDir, unlocked, focusBranch]);

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

  const dropCognitioOnTech = (techId: string) => {
    const tech = byId.get(techId);
    if (!tech || busy) return;
    if (queueSet.has(techId) && onAccelerate) {
      onAccelerate(techId);
      return;
    }
    onResearch(techId);
  };

  const requestUpgrade = (techId: string, upgradeId: string) => {
    if (!onResearchUpgrade) return;
    setPendingUpgradeId(upgradeId);
    setSuccessId(null);
    onResearchUpgrade(techId, upgradeId);
  };

  const applyProgressEconomy = (economy?: ViewerPayload["economy"]) => {
    if (!economy) return;
    setProgressEco({
      stocks: economy.stocks,
      techGrades: economy.techGrades,
      techSockets: economy.techSockets,
    });
  };

  const requestGrade = (techId: string) => {
    setPendingUpgradeId(`grade:${techId}`);
    setSuccessId(null);
    if (onUpgradeGrade) {
      onUpgradeGrade(techId);
      return;
    }
    if (!factionId) return;
    setProgressBusy(true);
    void postUpgradeTechGrade({ factionId, techId }).then((result) => {
      setProgressBusy(false);
      if (!result.ok) {
        setPendingUpgradeId(null);
        return;
      }
      applyProgressEconomy(result.data.economy);
      setSuccessId(`grade:${techId}`);
    });
  };

  const requestSocket = (techId: string, resourceId: string) => {
    setPendingUpgradeId(`socket:${techId}:${resourceId}`);
    setSuccessId(null);
    if (onFillSocket) {
      onFillSocket(techId, resourceId);
      return;
    }
    if (!factionId) return;
    setProgressBusy(true);
    void postFillTechSocket({ factionId, techId, resourceId }).then((result) => {
      setProgressBusy(false);
      if (!result.ok) {
        setPendingUpgradeId(null);
        return;
      }
      applyProgressEconomy(result.data.economy);
      setSuccessId(`socket:${techId}:${resourceId}`);
    });
  };

  const changeQueue = (next: string[]) => {
    onSetQueue?.(next.slice(0, QUEUE_MAX));
  };

  useEffect(() => {
    if (scienceMode !== "tree" || !onSetQueue) return;
    const onDrop = (e: DragEvent) => {
      const techId =
        getTechDragId() ||
        e.dataTransfer?.getData(TECH_DND_MIME) ||
        e.dataTransfer?.getData("text/plain");
      if (!techId || busy) return;
      const slotEl = (e.target as Element)?.closest(
        "[data-queue-slot]",
      ) as HTMLElement | null;
      if (!slotEl?.dataset.queueSlot) return;
      e.preventDefault();
      const at = Number(slotEl.dataset.queueSlot);
      const without = queue.filter((id) => id !== techId);
      const next = [...without];
      next.splice(Math.min(at, next.length), 0, techId);
      changeQueue(next.slice(0, QUEUE_MAX));
      clearTechDragIdDeferred();
    };
    const onDragOver = (e: DragEvent) => {
      if (!getTechDragId()) return;
      if (
        (e.target as Element)?.closest("[data-queue-slot],[data-queue-trash]")
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragover", onDragOver);
    return () => {
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragover", onDragOver);
    };
  }, [scienceMode, onSetQueue, queue, busy]);

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

  const buildingNames = selectedState?.buildings.map((b) => b.name) ?? [];

  const body = (
    <>
      <header className="research-panel-head">
        <h3>Исследования</h3>
        <div className="research-mode-tabs" role="tablist" aria-label="Режим науки">
          <button
            type="button"
            role="tab"
            aria-selected={scienceMode === "tree"}
            className={scienceMode === "tree" ? "on" : undefined}
            onClick={() => setScienceMode("tree")}
          >
            Дерево
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scienceMode === "lab"}
            className={scienceMode === "lab" ? "on" : undefined}
            onClick={() => setScienceMode("lab")}
            disabled={!onAlchemyExperiment}
          >
            Лаборатория
          </button>
        </div>
        <div className="research-stock-row">
          <p className="hint research-stock">
            Знание:{" "}
            <AnimatedTooltip
              content="Перетащите на ноду дерева — изучить сейчас или ускорить слот очереди"
            >
              <strong
                className="tabular research-cognitio-chip"
                {...(busy || cognitio <= 0 ? {} : bindCognitioDrag())}
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

      {scienceMode === "lab" && onAlchemyExperiment ? (
        <AlchemyLab
          compact={compact}
          unlockedIds={[...(unlocked)]}
          cognitio={cognitio}
          alchemy={eco?.alchemy}
          busy={busy}
          onExperiment={onAlchemyExperiment}
          msg={msg}
          initialSlots={
            labSeed ? { a: labSeed.a, b: labSeed.b } : null
          }
          seedKey={labSeed?.key ?? null}
        />
      ) : null}

      {scienceMode === "tree" ? (
        <div className="research-tree-body">
      <details
        className="research-rail"
        open={railOpen}
        onToggle={(e) =>
          setRailOpen((e.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary>Очередь и прогноз</summary>
        <div className="research-rail-body">
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

        </div>
      </details>

      <div className="research-tree-main">
      <div className="research-desk-bar">
      <div
        className="research-branch-tabs anim-tabs"
        role="tablist"
        aria-label="Направления науки"
      >
        <button
          type="button"
          role="tab"
          id="research-tab-all"
          aria-controls="research-panel-main"
          aria-selected={focusBranch == null}
          className={`research-branch-tab research-branch-tab--all fx-spotlight ${focusBranch == null ? "on" : ""}`}
          onClick={() => setFocusBranch(null)}
          title="Все направления"
          {...branchSpot.bind}
        >
          <strong>Все</strong>
          <span className="hint">обзор</span>
        </button>
        {listDirectionIds().map((d, i) => {
          const techs = byDir.get(d) ?? [];
          const done = techs.filter((t) => unlocked.has(t.id)).length;
          const color = directionColor(d);
          const branchAffordable = techs.some(
            (t) =>
              !unlocked.has(t.id) &&
              (t.prerequisites || []).every((p) => unlocked.has(p)) &&
              !lockBlocksResearch(t, world, factionId, eco) &&
              cognitio >= cognitioCost(t, eco, t.category),
          );
          return (
            <button
              key={d}
              type="button"
              role="tab"
              id={`research-tab-${d}`}
              aria-controls="research-panel-main"
              aria-selected={focusBranch === d}
              className={`research-branch-tab fx-spotlight ${focusBranch === d ? "on" : ""} ${branchAffordable ? "is-hot" : ""}`}
              style={
                {
                  borderColor: color,
                  "--fx-spot-color": color,
                } as React.CSSProperties
              }
              onClick={() => openBranch(d)}
              title={`${directionLabel(d)} · Alt+${i + 1}`}
              {...branchSpot.bind}
            >
              {!compact ? (
                <span className="research-tab-hotkey">Alt+{i + 1}</span>
              ) : null}
              <strong style={{ color }}>{directionLabel(d)}</strong>
              <span className="hint">
                {done}/{techs.length || 0}
                {done === techs.length && techs.length ? " · ✓" : ""}
              </span>
            </button>
          );
        })}
      </div>
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
        className="research-workbench"
        id="research-panel-main"
        role="tabpanel"
        aria-labelledby={
          focusBranch == null
            ? "research-tab-all"
            : `research-tab-${focusBranch}`
        }
      >
        <div className="research-map">
          {focusBranch == null ? (
            <details className="research-fold">
              <summary>Пути развития</summary>
              <ResearchPathsPanel
                eco={eco}
                cognitio={cognitio}
                busy={busy}
                factionId={factionId}
                world={world}
                onResearch={onResearch}
              />
            </details>
          ) : null}
          <ResearchOffers
            eco={eco}
            cognitio={cognitio}
            busy={busy}
            focus={focusBranch}
            onResearch={onResearch}
            onReroll={onRerollOffer}
            onOpenBranch={openBranch}
          />
          <TechGraphCanvas
            techs={focusBranch ? (byDir.get(focusBranch) ?? []) : allTechs}
            directionOf={
              focusBranch
                ? undefined
                : (id) => resolveTechDirection(byId.get(id))
            }
            onOpenDirection={
              focusBranch ? undefined : openDirectionFromNode
            }
            unlocked={unlocked}
            cognitio={cognitio}
            selectedId={selectedId}
            busy={busy}
            filter={filter}
            search={search}
            queueIds={queueSet}
            eco={eco}
            isTechBlocked={(tech) =>
              lockBlocksResearch(tech, world, factionId, eco)
            }
            onSelect={setSelectedId}
            onTechDragStart={onTechMapDrag}
            onCognitioDrop={dropCognitioOnTech}
          />
        </div>

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
            <p className="hint">
              {focusBranch == null
                ? "Выберите технологию на графе или направление."
                : "Выберите технологию на графе."}
            </p>
          ) : (
            <>
              <header className="research-detail-head">
                <span
                  className="research-cat"
                  style={{ color: CAT_COLOR[selected.category] }}
                >
                  {CAT_NAME[selected.category]} · эра{" "}
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
                {selectedState.done && onAlchemyExperiment ? (
                  <button
                    type="button"
                    className="btn ghost"
                    title="Открыть лабораторию с этой технологией"
                    onClick={() => openLabWith(selected.id, null)}
                  >
                    В лабораторию
                  </button>
                ) : null}
              </div>

              {selectedState.done ? (
                <>
                  <UpgradesComparison
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
                      onResearchUpgrade ? requestUpgrade : undefined
                    }
                    eco={liveEco}
                  />
                  <TechProgressControls
                    tech={selected}
                    eco={liveEco}
                    busy={busy || progressBusy}
                    pendingKey={pendingUpgradeId}
                    successKey={successId}
                    onUpgradeGrade={requestGrade}
                    onFillSocket={requestSocket}
                  />
                </>
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
      </div>
        </div>
      ) : null}
    </>
  );

  return (
    <section
      className={`hq-card research-panel${compact ? " research-panel--compact" : ""}`}
    >
      {body}
    </section>
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
