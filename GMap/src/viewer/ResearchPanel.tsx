import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Sparkles } from "lucide-react";
import type { ViewerPayload } from "../state/types";
import type {
  TechnologyDef,
  TechUpgrade,
  EconomyCategory,
} from "../state/contentCatalog";
import { getCachedContent } from "../state/contentCatalog";
import {
  effectiveCognitioCost,
  isOfferedCandidate,
  missingRequireProperties,
} from "../state/researchCosts";
import {
  postFillTechSocket,
  postUpgradeTechGrade,
} from "../state/researchClient";
import { fmtSigned } from "../state/numberFormat";
import { StatefulButton } from "../ui/StatefulButton";
import { AnimatedTooltip } from "../ui/AnimatedTooltip";
import { useSpotlight } from "../ui/aceternityFx";
import { ECO_CATEGORY_NAMES } from "./economyFlowTypes";
import {
  listDirectionIds,
  resolveTechDirection,
  RESEARCH_DIRECTION_BY_DIGIT,
  directionColor,
  directionLabel,
} from "../state/techDirections";
import {
  ResearchQueue,
  EffectsList,
  buildQueueForecasts,
  cognitioSparkFromRecent,
  ResearchTimeline,
  TechProgressControls,
  UpgradesComparison,
  QUEUE_MAX,
  TECH_DND_MIME,
  buildingsUnlockedByTech,
} from "./research";
import {
  hybridLockLabel,
  hybridResearchBlocked,
} from "../state/hybridClient";
import { buildResearchPath } from "./research/researchPath";
import { AlchemyLab } from "./research/AlchemyLab";
import { ResearchOffers } from "./research/ResearchOffers";
import { isCatalogStubTech } from "./research/graph/visibleGraphTechs";
import { OrbitGraph } from "./research/orbit/OrbitGraph";
import { SpecializationStrip } from "./research/orbit/SpecializationStrip";
import { computeDirectionProgress } from "./research/orbit/computeDirectionProgress";
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

function lockLabel(
  tech: TechnologyDef,
  eco?: ViewerPayload["economy"],
): string | null {
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
  const missing = missingRequireProperties(tech, eco);
  if (missing.length) return `Нужны свойства: ${missing.join(", ")}`;
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
  const [scienceMode, setScienceMode] = useState<"tree" | "lab" | "offers">("tree");
  const [labSeed, setLabSeed] = useState<{
    a: string | null;
    b: string | null;
    key: number;
  } | null>(null);
  const [branchLocal, setBranchLocal] = useState<string | null>(null);

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
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [pendingUpgradeId, setPendingUpgradeId] = useState<string | null>(null);
  const [progressBusy, setProgressBusy] = useState(false);
  const [progressEco, setProgressEco] = useState<{
    stocks?: Record<string, number>;
    techGrades?: Record<string, number>;
    techSockets?: Record<string, string>;
  } | null>(null);
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
    const list = Object.values(dict).filter((t) => !isCatalogStubTech(t));
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

  // Nearest unresearched on the chosen axis (green nodes on the ring).
  useEffect(() => {
    if (highlightTechId) return;
    if (!focusBranch) return;
    if (scienceMode !== "tree") return;
    const pool = byDir.get(focusBranch) ?? [];
    const next = pool.find(
      (t) =>
        !unlocked.has(t.id) &&
        (t.prerequisites || []).every((p) => unlocked.has(p)),
    );
    if (next) setSelectedId(next.id);
    // Only when the player switches direction on the ring.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusBranch, scienceMode]);

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
      if (isCatalogStubTech(t)) continue;
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
  const offeredPick = selected ? isOfferedCandidate(selected, eco) : false;

  const selectedState = useMemo(() => {
    if (!selected) return null;
    const done = unlocked.has(selected.id);
    const prereqOk = (selected.prerequisites || []).every((p) =>
      unlocked.has(p),
    );
    const cost = cognitioCost(selected, eco, selected.category);
    const lock = lockLabel(selected, eco);
    const lockBlocked = lockBlocksResearch(selected, world, factionId, eco);
    const canBuy =
      !done && prereqOk && !lockBlocked && cognitio >= cost && !busy;
    let buyBlock: string | null = null;
    if (!done) {
      if (!prereqOk) buyBlock = `Сначала изучите: ${prereqNames(selected, byId)}`;
      else if (lockBlocked) buyBlock = lock || "Недоступно для этой державы";
      else if (cognitio < cost) {
        buyBlock = `Нужно ${cost} знания, есть ${cognitio}`;
      }
    }
    let status = "доступно";
    if (done) status = "исследовано";
    else if (!prereqOk) status = "нужны предыдущие";
    else if (lockBlocked) status = "эксклюзив";
    else if (cognitio < cost) status = "мало Знания";
    const buildings = buildingsUnlockedByTech(selected, eco);
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
      buyBlock,
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
    world,
    factionId,
    eco,
    byId,
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
    if (!tech || isCatalogStubTech(tech)) return;
    if (!(tech.prerequisites || []).every((p) => unlocked.has(p))) return;
    if (lockBlocksResearch(tech, world, factionId, eco)) return;
    changeQueue([...queue, techId]);
  };

  const selectedPath = useMemo(() => {
    if (!selected) return null;
    return buildResearchPath(selected.id, byId, unlocked);
  }, [selected, byId, unlocked]);

  const buildingNames = selectedState?.buildings.map((b) => b.name) ?? [];
  const directionIds = listDirectionIds();
  const activeDir =
    focusBranch && directionIds.includes(focusBranch)
      ? focusBranch
      : (directionIds[0] ?? null);
  const dirProgress = computeDirectionProgress(byDir, unlocked);
  const dirProgressById = new Map(dirProgress.map((p) => [p.direction, p]));

  const body = (
    <div className="science-dive">
      <header className="science-dive__sum">
        <div className="research-stock-row">
          <p className="hint research-stock">
            Знание:{" "}
            <AnimatedTooltip
              content="Перетащите на ноду — изучить сейчас или ускорить слот очереди"
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
                ({fmtSigned(income)}/ход)
              </span>
            ) : null}
            {affordable.length > 0 ? (
              <span className="research-stock-hot">
                {" "}
                · доступно: {affordable.length}
              </span>
            ) : null}
          </p>
          <p className="hint science-dive__rule">
            За ход берётся только 1-я в очереди. Параллельно изучать нельзя.
          </p>
        </div>
      </header>
      {onSetQueue && queue.length > 0 ? (
        <div className="science-dive__queue">
          <ResearchQueue
            eco={eco}
            compact
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
        </div>
      ) : null}
      <nav className="science-dive__tasks" aria-label="Направления науки">
        {directionIds.map((d) => {
          const p = dirProgressById.get(d);
          const on =
            (scienceMode === "tree" || scienceMode === "offers") &&
            activeDir === d;
          return (
            <button
              key={d}
              type="button"
              className={on ? "is-on" : ""}
              style={{ "--dot-c": directionColor(d) } as React.CSSProperties}
              onClick={() => {
                setScienceMode((m) => (m === "offers" ? "offers" : "tree"));
                setFocusBranch(d);
              }}
            >
              <span className="science-dive__dir-dot" aria-hidden />
              {directionLabel(d)}
              {p ? (
                <span className="tabular science-dive__dir-n">
                  {p.researched}/{p.total}
                </span>
              ) : null}
            </button>
          );
        })}
        {onAlchemyExperiment ? (
          <button
            type="button"
            className={scienceMode === "lab" ? "is-on" : ""}
            onClick={() => setScienceMode("lab")}
          >
            <FlaskConical size={16} strokeWidth={1.75} aria-hidden />
            Лаб
          </button>
        ) : null}
        <button
          type="button"
          className={scienceMode === "offers" ? "is-on" : ""}
          onClick={() => setScienceMode("offers")}
        >
          <Sparkles size={16} strokeWidth={1.75} aria-hidden />
          Предложения
        </button>
        {scienceMode === "tree" && activeDir ? (
          <SpecializationStrip
            compact
            economy={eco}
            directions={[activeDir]}
          />
        ) : null}
      </nav>
      <div className="science-dive__canvas">
        {scienceMode === "lab" && onAlchemyExperiment ? (
          <AlchemyLab
            compact={compact}
            unlockedIds={[...unlocked]}
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
        ) : scienceMode === "offers" ? (
          <ResearchOffers
            layout="stage"
            eco={eco}
            cognitio={cognitio}
            busy={busy}
            focus={activeDir}
            selectedId={selectedId}
            onResearch={onResearch}
            onReroll={onRerollOffer}
            onOpenBranch={setFocusBranch}
            onSelectTech={setSelectedId}
          />
        ) : (
          <OrbitGraph
            directions={directionIds}
            techsByDirection={byDir}
            unlocked={unlocked}
            queue={queue}
            selectedId={selectedId}
            onSelect={setSelectedId}
            focusDirection={activeDir}
            onFocusDirectionChange={(d) => {
              if (d) setFocusBranch(d);
            }}
            onCognitioDrop={dropCognitioOnTech}
            hideDirectionTabs
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categoryChips={CAT_ORDER.map((c) => ({
              id: c,
              name: CAT_NAME[c],
              color: CAT_COLOR[c],
              tier: tiers[c] ?? 1,
            }))}
          />
        )}
      </div>
      <aside
        className={`science-dive__deck research-detail fx-spotlight ${selected?.isBreakthrough ? "fx-glow" : ""}`}
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
              Зелёные узлы — ближайшие неизученные. Выберите один.
            </p>
          ) : (
            <>
              <header className="research-detail-head">
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
                <span
                  className="research-cat"
                  style={{ color: CAT_COLOR[selected.category] }}
                >
                  {CAT_NAME[selected.category]} · эра {selected.era}
                  {selected.isBreakthrough ? " · прорыв" : ""}
                </span>
              </header>

              {selectedState.lock ? (
                <p className="hint research-lock-hint">{selectedState.lock}</p>
              ) : null}

              {selected.flavor ? (
                <p className="science-dive__flavor">{selected.flavor}</p>
              ) : null}

              <div className="science-dive__gives-box">
              <h4 className="science-dive__gives">Что даёт</h4>
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
              </div>

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
                    {selectedState.done ||
                    (selectedState.prereqOk && !selectedState.lockBlocked)
                      ? "выполнены"
                      : selectedState.buyBlock || prereqNames(selected, byId)}
                  </dd>
                </div>
              </dl>

              <div className="research-detail-cta">
                <div
                  className={
                    selectedState.canBuy
                      ? "research-cta-wrap fx-moving-border"
                      : "research-cta-wrap"
                  }
                >
                  <StatefulButton
                    className={`btn ${selectedState.canBuy ? "primary" : ""}`}
                    disabled={selectedState.done}
                    aria-disabled={!selectedState.canBuy}
                    title={selectedState.buyBlock ?? undefined}
                    busy={busy && pendingId === selected.id}
                    success={successId === selected.id}
                    successLabel="Исследовано"
                    onClick={() => {
                      if (selectedState.done) return;
                      if (!selectedState.canBuy) return;
                      requestResearch(selected.id);
                    }}
                  >
                    {selectedState.done
                      ? "Исследовано"
                      : offeredPick
                        ? "Выбрать эту"
                        : "Исследовать"}
                  </StatefulButton>
                </div>
                {!selectedState.done && onSetQueue && !(scienceMode === "offers" && offeredPick) ? (
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
              {selectedState.buyBlock ? (
                <p className="hint research-buy-block" role="status">
                  {selectedState.buyBlock}
                </p>
              ) : null}
              {offeredPick && !selectedState.done ? (
                <p className="hint" role="note">
                  Из трёх карт направления берётся только одна. После выбора
                  предложение обновится.
                </p>
              ) : null}
              {msg ? (
                <p
                  className={`hint research-msg ${msg.startsWith("Исследовано") || msg.startsWith("Улучшено") || msg.startsWith("Очередь") || msg.startsWith("Ускорено") ? "is-ok" : "is-err"}`}
                  role="status"
                >
                  {msg}
                </p>
              ) : null}

              {selectedState.done ? (
                <details className="science-dive__fold">
                  <summary>Улучшения</summary>
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
                </details>
              ) : null}

              {selectedPath && selectedPath.steps.length > 1 && !selectedState.done ? (
                <details className="science-dive__fold">
                  <summary>Путь ({selectedPath.steps.length} шагов)</summary>
                  <div className="research-path-planner" aria-label="Путь исследования">
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
                      Итого {selectedPath.totalCognitio} знания
                    </p>
                  </div>
                </details>
              ) : null}
            </>
          )}

          <details className="science-dive__fold">
            <summary>История</summary>
            <ResearchTimeline recent={eco?.recent} />
          </details>
        </aside>
    </div>
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
    if (isCatalogStubTech(t)) continue;
    if (unlocked.has(t.id)) continue;
    if (!(t.prerequisites || []).every((p) => unlocked.has(p))) continue;
    if (lockBlocksResearch(t, world, factionId, eco)) continue;
    if (cognitio >= cognitioCost(t, eco, t.category)) n += 1;
  }
  return n;
}
