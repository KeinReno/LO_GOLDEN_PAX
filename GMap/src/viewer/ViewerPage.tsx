import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { WorkbenchShell } from "../ui/WorkbenchShell";
import { StatusStrip } from "../ui/StatusStrip";
import {
  BookMarked,
  BookOpen,
  Coins,
  Flag,
  FlaskConical,
  Handshake,
  Home,
  Info,
  Landmark,
  Layers,
  Map as MapIcon,
  Menu,
  MessageSquare,
  ScrollText,
  Settings,
  Store,
  Swords,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  MapCanvasApi,
  MapContextPick,
  MapUnitDropPayload,
  MapViewModel,
  UnitDropIntent,
} from "../renderers/MapCanvas";
import type {
  OrderType,
  ViewerPayload,
  WorldState,
} from "../state/types";
import { CATEGORY_CURRENCIES } from "../state/economyLabels";
import { formatHopTurns, hopDistance, hopPath } from "../state/pathfinding";
import {
  VIEWER_LAYER_CHIPS,
  LAYER_PRESET_BUTTONS,
  MAP_MODE_PRESETS,
  activeMapModePreset,
  applyLayerPreset,
  mapModePresetFromHotkey,
  readStoredViewerLayers,
  writeStoredViewerLayers,
  layersForPerfChoice,
  type LayerPresetId,
  type MapLayerFlags,
  type MapLayerKey,
  type ViewerPerfChoice,
} from "../ui/mapLayers";
import {
  GRAPHICS_TOGGLES,
  clampPerfForDevice,
  graphicsForPerf,
  readStoredGraphics,
  writeStoredGraphics,
  type GraphicsPrefKey,
  type ViewerGraphicsPrefs,
} from "../ui/viewerGraphics";
import { LAYER_LUCIDE } from "../ui/layerIcons";
import { TurnStampHud } from "../ui/TurnStampHud";
import { FloatingRpWindow } from "../editors/FloatingRpWindow";
import { SystemCodex } from "./SystemCodex";
import { SystemView } from "../editors/SystemView";
import { useWorldStore } from "../state/worldStore";
import { EmpireResourceStrip } from "./EmpireResourceStrip";
import { PlayerHqHome, PlayerOrdersPanel } from "./PlayerHqPanels";
import { MarketPanel, type MarketBookStats, type MarketTab } from "./MarketPanel";
import { EconomyPanel } from "./economy";
import { CodexPanel } from "./codex";
import {
  countAffordableResearch,
  RESEARCH_BRANCH_BY_DIGIT,
  ResearchPanel,
} from "./ResearchPanel";
import {
  findPlanetForBuilding,
  systemsForTechHighlight,
} from "./research";
import type { EconomyCategory } from "../state/contentCatalog";
import { ViewerDiploPanel } from "./ViewerDiploPanel";
import type { DiploOffer } from "./DealDesk";
import { ForcesDeck } from "./forces/ForcesDeck";
import {
  COMBAT_STANCE_LABELS,
  countOpenEngagements,
  PlayerEngagementPanel,
  type CombatStanceId,
  type ViewerEngagement,
} from "./PlayerEngagementPanel";
import { CardBattleTable } from "./CardBattleTable";
import {
  ViewerQuestDossier,
  ViewerQuestPanel,
  visiblePlayerQuests,
} from "./ViewerQuestPanel";
import type {
  BuildingDef,
  ColonyDef,
  PlanetActionRequest,
} from "./PlayerPlanetManage";
import { CourtPanel } from "./CourtPanel";
import { ViewerContextMenu } from "./ViewerContextMenu";
import { buildViewerAlerts } from "./buildViewerAlerts";
import {
  buildEconomySystemSignals,
  severeBottleneckSystemIds,
} from "./buildEconomySignals";
import { EconomySignalPopover } from "./EconomySignalPopover";
import type { EconomyFlowBreakdown } from "./economyFlowTypes";
import { ViewerAlertFab, type AlertFocusAnchor } from "./ViewerAlertFab";
import { EngagementStanceRing } from "./EngagementStanceRing";
import {
  fetchContent,
  getCachedContent,
  intentApCost,
} from "../state/contentCatalog";
import {
  FleetOrderRing,
  resolveFleetOrderRing,
  type FleetOrderRingState,
  type HoldProgressState,
} from "./FleetOrderRing";
import { HoldRing } from "../ui/HoldRing";
import type { MapResourceDef } from "../state/contentCatalog";

const MapCanvas = lazy(() =>
  import("../renderers/MapCanvas").then((m) => ({ default: m.MapCanvas })),
);

/** Map-first rooms; forces / diplo also from Штаб. RP = scene with GM only. */
type PlayerView =
  | "hq"
  | "forces"
  | "orders"
  | "research"
  | "economy"
  | "market"
  | "diplomacy"
  | "quests"
  | "map"
  | "rp"
  | "codex";

/** Sub-tabs when биржа room is open (1–4). */
const MARKET_TAB_BY_DIGIT: Record<string, MarketTab> = {
  "1": "quotes",
  "2": "currencies",
  "3": "trade",
  "4": "superpowers",
};

/** Digit hotkeys for dock rooms (F5–F9 reserved for map layer presets). */
function dockViewFromDigit(key: string, isMobile: boolean): PlayerView | null {
  if (isMobile) {
    const mobileMap: Record<string, PlayerView> = {
      "1": "map",
      "2": "hq",
      "3": "research",
      "4": "market",
      "5": "diplomacy",
      "6": "rp",
    };
    return mobileMap[key] ?? null;
  }
  const desktopMap: Record<string, PlayerView> = {
    "1": "map",
    "2": "hq",
    "3": "research",
    "4": "market",
    "5": "diplomacy",
    "6": "forces",
    "7": "quests",
    "8": "rp",
  };
  return desktopMap[key] ?? null;
}

const PLAYER_START_KEY = "gmap-player-start";

function readStoredStart(): "hq" | "map" | null {
  try {
    const v = localStorage.getItem(PLAYER_START_KEY);
    if (v === "hq" || v === "map") return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeStoredStart(mode: "hq" | "map"): void {
  try {
    localStorage.setItem(PLAYER_START_KEY, mode);
  } catch {
    /* ignore */
  }
}

function defaultStartForDevice(): "hq" | "map" {
  /* Galaxy map is the home screen (Stellaris / ES2 style). */
  return "map";
}

function rpSeenStorageKey(factionId: string): string {
  return `gmap-rp-seen:${factionId}`;
}

function readRpSeenAt(factionId: string): string {
  try {
    return localStorage.getItem(rpSeenStorageKey(factionId)) || "";
  } catch {
    return "";
  }
}

function writeRpSeenAt(factionId: string, at: string): void {
  try {
    localStorage.setItem(rpSeenStorageKey(factionId), at);
  } catch {
    /* ignore */
  }
}

/** Modes shown to players (no vague «auto»). */
type PerfMode = ViewerPerfChoice;

interface FactionOption {
  id: string;
  name: string;
  color: string;
}

function isLikelyMobile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Width-first: coarse pointer alone (Win touch laptops) must not
    // force mobile chrome / bottom padding on a wide desktop window.
    return window.matchMedia("(max-width: 900px)").matches;
  } catch {
    return false;
  }
}

function readStoredPerf(): PerfMode | null {
  try {
    const v = localStorage.getItem("gmap-viewer-perf");
    if (
      v === "quality" ||
      v === "quality_mobile" ||
      v === "mobile" ||
      v === "ultralight" ||
      v === "cinematic"
    )
      return clampPerfForDevice(v);
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPerfForDevice(): PerfMode {
  return clampPerfForDevice(isLikelyMobile() ? "ultralight" : "quality");
}

const PERF_OPTIONS: {
  id: PerfMode;
  label: string;
  hint: string;
  mobileRec?: boolean;
  desktopOnly?: boolean;
}[] = [
  {
    id: "ultralight",
    label: "Суперлайт",
    hint: "Максимум FPS. Минимум эффектов — для слабых телефонов.",
    mobileRec: true,
  },
  {
    id: "mobile",
    label: "Лайт",
    hint: "Баланс: карта читается, анимаций меньше.",
  },
  {
    id: "quality_mobile",
    label: "Качество",
    hint: "Красивая карта без бешеной перерисовки — для телефонов.",
  },
  {
    id: "quality",
    label: "Максимум",
    hint: "Полный FX и анимации. Лучше на ПК.",
  },
  {
    id: "cinematic",
    label: "Cinematic",
    hint: "Макс. polish + все слои. Тяжелее — только ПК / мощный планшет.",
    desktopOnly: true,
  },
];

export function ViewerPage() {
  const mobile = useMemo(() => isLikelyMobile(), []);
  const [factions, setFactions] = useState<FactionOption[]>([]);
  const [factionId, setFactionId] = useState("");
  const [password, setPassword] = useState("");
  const [loginPerf, setLoginPerf] = useState<PerfMode>(
    () => readStoredPerf() ?? defaultPerfForDevice(),
  );
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ViewerPayload | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [selectedLegionId, setSelectedLegionId] = useState<string | null>(null);
  const [viewerCtx, setViewerCtx] = useState<MapContextPick | null>(null);
  const [orderRing, setOrderRing] = useState<FleetOrderRingState | null>(null);
  const [holdProgress, setHoldProgress] = useState<HoldProgressState | null>(
    null,
  );
  const [orderType, setOrderType] = useState<OrderType>("move_fleet");
  const [orderNote, setOrderNote] = useState("");
  const [orderMsg, setOrderMsg] = useState<string | null>(null);
  const [apMax, setApMax] = useState(3);
  const [reservedAp, setReservedAp] = useState(0);
  const [targetSystemId, setTargetSystemId] = useState<string | null>(null);
  const [pickingTarget, setPickingTarget] = useState(false);
  /** Mobile: tap system to move selected own unit (fallback to drag). */
  const [touchMoveArmed, setTouchMoveArmed] = useState(false);
  const [planetBusy, setPlanetBusy] = useState(false);
  const [planetMsg, setPlanetMsg] = useState<string | null>(null);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchMsg, setResearchMsg] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [diploBusy, setDiploBusy] = useState(false);
  const [diploMsg, setDiploMsg] = useState<string | null>(null);
  const [focusDiploOfferId, setFocusDiploOfferId] = useState<string | null>(
    null,
  );
  const [eraBanner, setEraBanner] = useState<number | null>(null);
  const [buildingsCatalog, setBuildingsCatalog] = useState<
    Record<string, BuildingDef>
  >({});
  const [coloniesCatalog, setColoniesCatalog] = useState<
    Record<string, ColonyDef>
  >({});
  const [mapResourcesCatalog, setMapResourcesCatalog] = useState<
    Record<string, MapResourceDef> | undefined
  >();
  const [shipsCatalog, setShipsCatalog] = useState<
    Record<string, { id: string; name: string; tier?: number; faction?: string }>
  >({});
  const [unitsCatalog, setUnitsCatalog] = useState<
    Record<string, { id: string; name: string; tier?: number; faction?: string }>
  >({});
  const [systemBusy, setSystemBusy] = useState(false);
  const [flowPriorityBusy, setFlowPriorityBusy] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [marketPrefillCurrency, setMarketPrefillCurrency] = useState<
    string | null
  >(null);
  /** System opened from Economy panel (master–detail highlight). */
  const [economyLinkedSystemId, setEconomyLinkedSystemId] = useState<
    string | null
  >(null);
  const [ecoHighlightCategory, setEcoHighlightCategory] = useState<
    string | null
  >(null);
  const [systemMsg, setSystemMsg] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<PlayerView>("map");
  const [marketTab, setMarketTab] = useState<MarketTab>("quotes");
  const [researchBranch, setResearchBranch] =
    useState<EconomyCategory | null>(null);
  const [researchHighlightTechId, setResearchHighlightTechId] = useState<
    string | null
  >(null);
  const [techMapHighlightIds, setTechMapHighlightIds] = useState<string[]>(
    [],
  );
  const [economyFocusCategory, setEconomyFocusCategory] = useState<
    string | null
  >(null);
  const [forcesHighlightDefIds, setForcesHighlightDefIds] = useState<
    string[] | null
  >(null);
  const [marketBookStats, setMarketBookStats] = useState<MarketBookStats>({
    myOffers: 0,
    peerLots: 0,
  });

  useEffect(() => {
    const factionId = payload?.factionId;
    if (!factionId || !password) return;
    let cancelled = false;
    void fetch("/api/market/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ factionId, password, venue: "all" }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data || !Array.isArray(data.offers)) return;
        setMarketBookStats({
          myOffers: data.offers.filter(
            (o: { factionId?: string }) => o.factionId === factionId,
          ).length,
          peerLots: data.offers.filter(
            (o: { factionId?: string }) => o.factionId !== factionId,
          ).length,
        });
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, [payload?.factionId, password]);
  const [rpFloatOpen, setRpFloatOpen] = useState(false);
  const [rpUnread, setRpUnread] = useState(0);
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const openQuestId = useWorldStore((s) => s.openQuestId);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const [perfMode, setPerfMode] = useState<PerfMode>(
    () => readStoredPerf() ?? defaultPerfForDevice(),
  );
  const [graphics, setGraphics] = useState<ViewerGraphicsPrefs>(() => {
    const stored = readStoredGraphics();
    const mode = readStoredPerf() ?? defaultPerfForDevice();
    // If never customized, seed from perf profile
    try {
      if (!localStorage.getItem("gmap-viewer-graphics")) {
        return graphicsForPerf(mode);
      }
    } catch {
      /* ignore */
    }
    return stored;
  });
  const [layers, setLayers] = useState<MapLayerFlags>(() => {
    try {
      const hasStored = !!localStorage.getItem("gmap-viewer-layers");
      if (!hasStored && isLikelyMobile()) {
        return layersForPerfChoice("ultralight");
      }
    } catch {
      /* ignore */
    }
    return readStoredViewerLayers();
  });
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [boardRefreshToast, setBoardRefreshToast] = useState<string | null>(
    null,
  );
  const [engagements, setEngagements] = useState<ViewerEngagement[]>([]);
  const [stanceBusy, setStanceBusy] = useState(false);
  const [stanceRing, setStanceRing] = useState<{
    engagementId: string;
    x: number;
    y: number;
  } | null>(null);
  const [cardBattleId, setCardBattleId] = useState<string | null>(null);
  const [cardBattleMinimized, setCardBattleMinimized] = useState(false);
  const [systemFocusId, setSystemFocusId] = useState<string | null>(null);
  const [flowData, setFlowData] = useState<EconomyFlowBreakdown | null>(null);
  const [economyPopover, setEconomyPopover] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const mapFocus = useWorldStore((s) => s.mapFocus);
  const modelRef = useRef<MapViewModel | null>(null);
  const mapApiRef = useRef<MapCanvasApi | null>(null);
  const listeners = useRef(new Set<() => void>());
  const mapStampRef = useRef<string | null>(null);
  const credsRef = useRef({ factionId: "", password: "" });

  const bump = () => {
    for (const l of listeners.current) l();
  };

  const applyPerfMode = (mode: PerfMode, withPresets = false) => {
    const safe = clampPerfForDevice(mode);
    setPerfMode(safe);
    setLoginPerf(safe);
    try {
      localStorage.setItem("gmap-viewer-perf", safe);
    } catch {
      /* ignore */
    }
    if (withPresets) {
      const nextLayers = layersForPerfChoice(safe);
      const nextGfx = graphicsForPerf(safe);
      setLayers(nextLayers);
      setGraphics(nextGfx);
      writeStoredViewerLayers(nextLayers);
      writeStoredGraphics(nextGfx);
    }
  };

  const toggleGraphic = (key: GraphicsPrefKey) => {
    if (key === "cinematic" && mobile) return;
    setGraphics((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStoredGraphics(next);
      return next;
    });
  };

  const toggleLayer = (key: MapLayerKey) => {
    setLayers((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      writeStoredViewerLayers(next);
      return next;
    });
  };

  const applyPreset = (id: LayerPresetId) => {
    setLayers((prev) => {
      const next = applyLayerPreset(prev, id);
      writeStoredViewerLayers(next);
      return next;
    });
  };

  const activeMapMode = activeMapModePreset(layers);

  useEffect(() => {
    bump();
  }, [
    layers,
    perfMode,
    graphics,
    selectedSystemId,
    selectedFleetId,
    selectedLegionId,
    payload,
  ]);

  useEffect(() => {
    if (!orderMsg || pickingTarget) return;
    const t = window.setTimeout(() => setOrderMsg(null), 4500);
    return () => window.clearTimeout(t);
  }, [orderMsg, pickingTarget]);

  useEffect(() => {
    if (!boardRefreshToast) return;
    const t = window.setTimeout(() => setBoardRefreshToast(null), 12000);
    return () => window.clearTimeout(t);
  }, [boardRefreshToast]);

  // Drop stuck quest dossier if marker points at a hidden/unknown quest.
  useEffect(() => {
    if (!payload || openQuestId == null) return;
    if (!visiblePlayerQuests(payload.world).some((q) => q.id === openQuestId)) {
      setOpenQuestId(null);
    }
  }, [payload, openQuestId, setOpenQuestId]);

  useEffect(() => {
    void fetchContent().then((c) => {
      if (!c) return;
      if (c.buildings) setBuildingsCatalog(c.buildings as Record<string, BuildingDef>);
      if (c.colonies) setColoniesCatalog(c.colonies as Record<string, ColonyDef>);
      if (c.map_resources) setMapResourcesCatalog(c.map_resources as Record<string, MapResourceDef>);
      if (c.ships) setShipsCatalog(c.ships);
      if (c.units) setUnitsCatalog(c.units);
    });
  }, []);

  useEffect(() => {
    if (!pickingTarget && !touchMoveArmed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPickingTarget(false);
        setTouchMoveArmed(false);
        setOrderMsg(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickingTarget, touchMoveArmed]);

  useEffect(() => {
    void loadFactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live map refresh: master «Сохранить кампанию» → publish → players pick up
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/map-version");
        if (!res.ok || cancelled) return;
        const ver = (await res.json()) as {
          updatedAt?: string | null;
          turn?: number;
          tableRevision?: number;
        };
        const stamp = `${ver.turn ?? ""}|${ver.tableRevision ?? ""}`;
        if (!mapStampRef.current) {
          mapStampRef.current = stamp;
          return;
        }
        if (stamp === mapStampRef.current) return;
        const { factionId: fid, password: pw } = credsRef.current;
        if (!fid || !pw) return;
        const r2 = await fetch("/api/view-refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ factionId: fid, password: pw }),
        });
        if (!r2.ok || cancelled) return;
        const data = (await r2.json()) as ViewerPayload & {
          updatedAt?: string | null;
        };
        const turn = data.world.meta.turn ?? ver.turn ?? "?";
        const rev =
          data.tableRevision ??
          data.world.meta.tableRevision ??
          ver.tableRevision ??
          "?";
        mapStampRef.current = stamp;
        setPayload((prev) => ({
          world: data.world,
          factionId: data.factionId,
          visibleSystemIds: data.visibleSystemIds,
          knownFactionIds: data.knownFactionIds ?? prev?.knownFactionIds,
          tradePartnerIds: data.tradePartnerIds ?? prev?.tradePartnerIds,
          diploOffers: data.diploOffers ?? prev?.diploOffers,
          updatedAt: data.updatedAt ?? ver.updatedAt,
          tableRevision: data.tableRevision ?? ver.tableRevision,
          economy: data.economy ?? prev?.economy,
          briefing: data.briefing ?? prev?.briefing,
          apMax: data.apMax ?? prev?.apMax,
          reservedAp: data.reservedAp ?? prev?.reservedAp,
        }));
        if (typeof data.apMax === "number") setApMax(data.apMax);
        if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
        loadWorld(data.world);
        const boardCue = `Стол обновлён · ход ${turn} · rev ${rev}`;
        setBoardRefreshToast(boardCue);
        setSyncHint(boardCue);
        bump();
      } catch {
        /* ignore transient tunnel errors */
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload?.factionId]);

  // RP unread while campaign sheet is closed
  useEffect(() => {
    if (!payload?.factionId) {
      setRpUnread(0);
      return;
    }
    if (rpFloatOpen) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const headers: Record<string, string> = {
          "X-Faction-Id": payload.factionId,
        };
        const idxRes = await fetch("/api/rp", { headers });
        if (!idxRes.ok || cancelled) return;
        const idx = (await idxRes.json()) as {
          home?: { chapterId?: string; episodeId?: string };
          chapters?: {
            id: string;
            episodes?: { id: string; status?: string; kind?: string }[];
          }[];
        };
        let chapterId = idx.home?.chapterId;
        let episodeId = idx.home?.episodeId;
        if (!chapterId || !episodeId) {
          const flat =
            idx.chapters?.flatMap((c) =>
              (c.episodes || []).map((e) => ({
                chapterId: c.id,
                episodeId: e.id,
                status: e.status,
                kind: e.kind,
              })),
            ) ?? [];
          const hq = flat.find((e) => e.kind === "hq");
          const openEp =
            hq ?? flat.find((e) => e.status !== "closed") ?? flat[0] ?? null;
          chapterId = openEp?.chapterId;
          episodeId = openEp?.episodeId;
        }
        if (!chapterId || !episodeId || cancelled) return;
        const q = new URLSearchParams({
          chapterId,
          episodeId,
        });
        const msgRes = await fetch(`/api/rp/messages?${q}`, { headers });
        if (!msgRes.ok || cancelled) return;
        const data = (await msgRes.json()) as {
          messages?: { id: string; at: string; authorFactionId?: string }[];
        };
        const msgs = data.messages || [];
        const seen = readRpSeenAt(payload.factionId);
        const unread = seen
          ? msgs.filter((m) => m.at > seen).length
          : msgs.length > 0
            ? Math.min(msgs.length, 9)
            : 0;
        if (!cancelled) {
          setRpUnread(unread);
          if (unread > 0) {
            const { notifyNewRpMessage } = await import("../ui/rpNotify");
            notifyNewRpMessage(msgs, {
              selfFactionId: payload.factionId,
              quietDesktop: false,
            });
          }
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [payload?.factionId, payload?.world.meta.turn, payload?.updatedAt]);

  useEffect(() => {
    if (!payload?.factionId) {
      setFlowData(null);
      return;
    }
    let cancelled = false;
    const loadFlows = async () => {
      try {
        const res = await fetch(
          `/api/economy/flows?factionId=${encodeURIComponent(payload.factionId)}`,
        );
        if (!res.ok || cancelled) return;
        setFlowData((await res.json()) as EconomyFlowBreakdown);
      } catch {
        /* ignore transient errors */
      }
    };
    void loadFlows();
    return () => {
      cancelled = true;
    };
  }, [payload?.factionId, payload?.world.meta.turn, payload?.updatedAt]);

  const refreshEngagements = async (factionId: string) => {
    try {
      const res = await fetch("/api/engagements", {
        headers: { "X-Faction-Id": factionId },
      });
      if (!res.ok) return;
      const data = await res.json();
      setEngagements(data.engagements || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (!payload?.factionId) {
      setEngagements([]);
      return;
    }
    let cancelled = false;
    void refreshEngagements(payload.factionId);
    const id = window.setInterval(() => {
      if (!cancelled) void refreshEngagements(payload.factionId);
    }, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [payload?.factionId, payload?.world.meta.turn, payload?.updatedAt]);

  const loadFactions = async () => {
    setError(null);
    try {
      const res = await fetch("/api/factions");
      const raw = await res.text();
      let data: unknown = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch {
        /* keep text */
      }
      if (!res.ok) {
        const msg =
          data && typeof data === "object" && data !== null && "error" in data
            ? String((data as { error: string }).error)
            : raw || res.statusText;
        throw new Error(msg);
      }
      const list = data as FactionOption[];
      setFactions(list);
      if (list[0]) setFactionId(list[0].id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("не опубликована") || msg.includes("published")
          ? "Карта ещё не опубликована. Мастер: вкладка «Сессия» → «Опубликовать для игроков»."
          : msg ||
              "Не удалось загрузить список. Мастер должен нажать «Опубликовать».",
      );
    }
  };

  const login = async () => {
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ factionId, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = (await res.json()) as ViewerPayload & {
        updatedAt?: string | null;
      };
      credsRef.current = { factionId, password };
      mapStampRef.current = `${data.world.meta.turn ?? ""}|${data.tableRevision ?? data.world.meta.tableRevision ?? ""}`;

      const chosen = clampPerfForDevice(loginPerf);
      const nextLayers = layersForPerfChoice(chosen);
      const nextGfx = graphicsForPerf(chosen);
      try {
        localStorage.setItem("gmap-viewer-perf", chosen);
        writeStoredViewerLayers(nextLayers);
        writeStoredGraphics(nextGfx);
      } catch {
        /* ignore */
      }
      setPerfMode(chosen);
      setLayers(nextLayers);
      setGraphics(nextGfx);

      setPayload({
        ...data,
        updatedAt: data.updatedAt ?? data.world.meta.updatedAt,
      });
      loadWorld(data.world);
      setApMax(data.apMax ?? 3);
      setReservedAp(data.reservedAp ?? 0);
      setSelectedSystemId(null);
      setSelectedFleetId(null);
      setSyncHint(null);
      setSettingsOpen(false);
      setMenuOpen(false);
      setSheetOpen(false);
      setRpFloatOpen(false);
      {
        const start = readStoredStart() ?? defaultStartForDevice();
        setViewMode(start);
        writeStoredStart(start);
      }
      modelRef.current = toModel(data.world, null, null, nextLayers);
      bump();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const goView = (v: PlayerView) => {
    setViewMode(v);
    setMenuOpen(false);
    setSettingsOpen(false);
    setQueueOpen(false);
    setRpFloatOpen(v === "rp");
    if (v !== "map") setSheetOpen(false);
    setTouchMoveArmed(false);
    if (v !== "economy") setEconomyLinkedSystemId(null);
    writeStoredStart(v === "map" ? "map" : "hq");
  };

  const submitPlayerIntent = async (
    defId: string,
    intentPayload: Record<string, unknown>,
    okMsg: string,
    onOk?: (data: { intent?: { apCost?: number }; reservedAp?: number }) => void,
  ) => {
    if (!payload) return false;
    try {
      const res = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          defId,
          payload: intentPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setOrderMsg(okMsg);
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      else setReservedAp((r) => r + (data.intent?.apCost ?? intentApCost(defId)));
      onOk?.(data);
      return true;
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const submitQuestAction = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!payload) return { ok: false as const, error: "no payload" };
    try {
      const res = await fetch("/api/quest/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          action,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.world) {
        setPayload({
          ...payload,
          world: data.world,
          economy: data.economy ?? payload.economy,
          updatedAt: data.updatedAt ?? payload.updatedAt,
          tableRevision: data.tableRevision ?? payload.tableRevision,
        });
      }
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      return { ok: true as const, ...data };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setOrderMsg(msg);
      return { ok: false as const, error: msg };
    }
  };

  const setTax = async (taxSlot: string, tierId: string) => {
    if (!payload) return;
    setPolicyBusy(true);
    const taxLabels: Record<string, Record<string, string>> = {
      "tax.industry": { none: "0%", low: "10%", mid: "20%", high: "35%" },
      "tax.supply": { none: "0%", low: "10%", mid: "20%" },
    };
    const label = taxLabels[taxSlot]?.[tierId] ?? tierId;
    try {
      await submitPlayerIntent(
        "intent.set_tax",
        { taxSlot, tierId },
        `Налог в очереди: ${label}`,
        () => {
          setPayload({
            ...payload,
            economy: {
              ...payload.economy!,
              stocks: payload.economy?.stocks ?? {},
              taxes: payload.economy?.taxes ?? {},
              pendingPolicy: {
                ...(payload.economy?.pendingPolicy ?? {}),
                taxes: {
                  ...(payload.economy?.pendingPolicy?.taxes || {}),
                  [taxSlot]: tierId,
                },
              },
            },
          });
        },
      );
    } finally {
      setPolicyBusy(false);
    }
  };

  const setFlowPriority = async (opts: {
    from: string;
    to: string;
    systemId?: string | null;
  }) => {
    if (!payload) return;
    setFlowPriorityBusy(true);
    const key = opts.systemId || "_faction";
    const ok = await submitPlayerIntent(
      "intent.set_flow_priority",
      {
        from: opts.from,
        to: opts.to,
        ...(opts.systemId ? { systemId: opts.systemId } : {}),
      },
      `Приоритет ${opts.from}→${opts.to}`,
      () => {
        setPayload((prev) => {
          if (!prev?.economy) return prev;
          return {
            ...prev,
            economy: {
              ...prev.economy,
              flowPriorities: {
                ...(prev.economy.flowPriorities ?? {}),
                [key]: {
                  from: opts.from,
                  to: opts.to,
                  edge: `${opts.from}->${opts.to}`,
                },
              },
            },
          };
        });
      },
    );
    setFlowPriorityBusy(false);
    if (!ok) setOrderMsg("Не удалось задать приоритет");
  };

  const reserveStock = async (
    currencyId: string,
    amount: number,
    label?: string,
  ) => {
    if (!payload) return;
    setStockBusy(true);
    const ok = await submitPlayerIntent(
      "intent.reserve_stock",
      { currencyId, amount, ...(label ? { label } : {}) },
      amount > 0
        ? `Резерв ${amount} · ${currencyId.replace(/^currency\./, "")}`
        : `Резерв снят · ${currencyId.replace(/^currency\./, "")}`,
      () => {
        setPayload((prev) => {
          if (!prev?.economy) return prev;
          const next = { ...(prev.economy.stockReserves ?? {}) };
          if (amount <= 0) delete next[currencyId];
          else next[currencyId] = { amount, label: label || "резерв" };
          return {
            ...prev,
            economy: { ...prev.economy, stockReserves: next },
          };
        });
      },
    );
    setStockBusy(false);
    if (!ok) setOrderMsg("Резерв не применён");
  };

  const setEconomicPolicy = async (policyId: string) => {
    if (!payload) return;
    setPolicyBusy(true);
    const ok = await submitPlayerIntent(
      "intent.set_economic_policy",
      { policyId },
      `Доктрина: ${policyId}`,
      () => {
        setPayload((prev) => {
          if (!prev?.economy) return prev;
          const presets: Record<string, Record<string, string>> = {
            military: { "tax.industry": "high", "tax.supply": "low" },
            trade: { "tax.industry": "low", "tax.supply": "none" },
            growth: { "tax.industry": "none", "tax.supply": "none" },
          };
          const taxes = presets[policyId] ?? {};
          return {
            ...prev,
            economy: {
              ...prev.economy,
              economicPolicy: policyId,
              pendingPolicy: {
                ...(prev.economy.pendingPolicy ?? {}),
                taxes: {
                  ...(prev.economy.pendingPolicy?.taxes || {}),
                  ...taxes,
                },
              },
            },
          };
        });
      },
    );
    setPolicyBusy(false);
    if (!ok) setOrderMsg("Доктрина не применена");
  };

  const submitTransfer = async (
    toFactionId: string,
    currencyId: string,
    amount: number,
  ) => {
    if (!payload) return;
    const fac = payload.world.factions.find((f) => f.id === toFactionId);
    await submitPlayerIntent(
      "intent.transfer",
      { toFactionId, currencyId, amount },
      `Перевод в очереди: ${amount} → ${fac?.name ?? toFactionId}`,
    );
  };

  const submitMarketConvert = async (
    fromCurrency: string,
    toCurrency: string,
    amountFrom: number,
  ) => {
    if (!payload) return;
    await submitPlayerIntent(
      "intent.market_convert",
      { fromCurrency, toCurrency, amountFrom },
      `Обмен в очереди: ${amountFrom} ${fromCurrency.replace(/^currency\./, "")}`,
    );
  };

  const submitMarketOffer = async (
    side: "sell" | "buy",
    giveCurrency: string,
    giveAmount: number,
    wantCurrency: string,
    wantAmount: number,
    venue: "common" | "contacts" = "contacts",
  ) => {
    if (!payload) return;
    await submitPlayerIntent(
      "intent.market_offer",
      { side, giveCurrency, giveAmount, wantCurrency, wantAmount, venue },
      `Заявка (${venue === "common" ? "общий" : "контакты"}): ${giveAmount} → ${wantAmount}`,
    );
  };

  const submitMarketCancel = async (offerId: string) => {
    if (!payload) return;
    await submitPlayerIntent(
      "intent.market_cancel",
      { offerId },
      `Отмена заявки в очереди`,
    );
  };

  const submitScoutReveal = async (systemId: string) => {
    if (!payload) return;
    const sys = payload.world.systems.find((s) => s.id === systemId);
    const ap = intentApCost("intent.scout_reveal") || 1;
    await submitPlayerIntent(
      "intent.scout_reveal",
      { systemId },
      `Разведка в очереди: ${sys?.name ?? systemId} (${ap} AP)`,
    );
  };

  const submitCombatStance = async (
    engagementId: string,
    stance: CombatStanceId,
  ) => {
    if (!payload) return;
    setStanceBusy(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/stance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          stance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const label = COMBAT_STANCE_LABELS[stance] ?? stance;
      setOrderMsg(`Поза «${label}» зафиксирована`);
      if (data.engagement) {
        setEngagements((prev) =>
          prev.map((e) =>
            e.id === engagementId ? (data.engagement as ViewerEngagement) : e,
          ),
        );
      } else {
        await refreshEngagements(payload.factionId);
      }
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setStanceBusy(false);
    }
  };

  const submitRequestCardBattle = async (engagementId: string) => {
    if (!payload) return;
    setStanceBusy(true);
    try {
      const res = await fetch(
        `/api/engagements/${engagementId}/request_card`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            factionId: payload.factionId,
            password,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setOrderMsg(
        data.mutual
          ? "Карточный бой начат (взаимное согласие)"
          : "Запрос карточного боя отправлен",
      );
      if (data.engagement) {
        setEngagements((prev) =>
          prev.map((e) =>
            e.id === engagementId ? (data.engagement as ViewerEngagement) : e,
          ),
        );
        if (data.engagement.mode === "card") {
          setCardBattleMinimized(false);
          setCardBattleId(engagementId);
        }
      } else {
        await refreshEngagements(payload.factionId);
      }
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setStanceBusy(false);
    }
  };

  const applyDiploSession = (data: ViewerPayload & {
    diploOffers?: ViewerPayload["diploOffers"];
    economy?: ViewerPayload["economy"];
  }) => {
    if (!payload) return;
    setPayload({
      ...payload,
      world: data.world ?? payload.world,
      economy: data.economy ?? payload.economy,
      diploOffers: data.diploOffers ?? payload.diploOffers,
      knownFactionIds: data.knownFactionIds ?? payload.knownFactionIds,
      tradePartnerIds: data.tradePartnerIds ?? payload.tradePartnerIds,
      visibleSystemIds: data.visibleSystemIds ?? payload.visibleSystemIds,
      tableRevision: data.tableRevision ?? payload.tableRevision,
    });
    if (data.world) loadWorld(data.world);
    if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
  };

  const diploOfferAction = async (
    action: "create" | "accept" | "reject" | "cancel",
    body: Record<string, unknown>,
    okMsg: string,
  ) => {
    if (!payload) return;
    setDiploBusy(true);
    setDiploMsg(null);
    try {
      const res = await fetch("/api/diplo/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          action,
          ...body,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      applyDiploSession(data);
      setDiploMsg(okMsg);
      setFocusDiploOfferId(null);
    } catch (err) {
      setDiploMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDiploBusy(false);
    }
  };

  const researchTech = async (techId: string) => {
    if (!payload) return;
    setResearchBusy(true);
    setResearchMsg(null);
    try {
      const res = await fetch("/api/economy/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          techId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) {
        setPayload({
          ...payload,
          economy: { ...payload.economy, ...data.economy },
        });
      }
      setResearchMsg(`Исследовано: ${data.tech?.name ?? techId}`);
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setResearchBusy(false);
    }
  };

  const researchUpgrade = async (techId: string, upgradeId: string) => {
    if (!payload) return;
    setResearchBusy(true);
    setResearchMsg(null);
    try {
      const res = await fetch("/api/economy/research-upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          techId,
          upgradeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) {
        setPayload({
          ...payload,
          economy: { ...payload.economy, ...data.economy },
        });
      }
      setResearchMsg(`Улучшено: ${data.upgrade?.name ?? upgradeId}`);
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setResearchBusy(false);
    }
  };

  const setResearchQueue = async (queue: string[]) => {
    if (!payload) return;
    setResearchBusy(true);
    setResearchMsg(null);
    try {
      const res = await fetch("/api/economy/research-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          queue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) {
        setPayload({
          ...payload,
          economy: { ...payload.economy, ...data.economy },
        });
      }
      setResearchMsg(
        `Очередь: ${(data.queue as string[] | undefined)?.length ?? 0} слотов`,
      );
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setResearchBusy(false);
    }
  };

  const accelerateResearch = async (techId: string) => {
    if (!payload) return;
    setResearchBusy(true);
    setResearchMsg(null);
    try {
      const res = await fetch("/api/economy/research-accelerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          techId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) {
        setPayload({
          ...payload,
          economy: { ...payload.economy, ...data.economy },
        });
      }
      setResearchMsg(`Ускорено: ${data.tech?.name ?? techId}`);
    } catch (err) {
      setResearchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setResearchBusy(false);
    }
  };

  const setBuildQueue = async (
    queue: Array<{ systemId: string; planetId: string; buildingId: string }>,
  ) => {
    if (!payload) return;
    setPlanetBusy(true);
    setPlanetMsg(null);
    try {
      const res = await fetch("/api/economy/build-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          queue,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.economy) {
        setPayload({
          ...payload,
          economy: { ...payload.economy, ...data.economy },
        });
      }
      setPlanetMsg(
        `Очередь строительства: ${(data.queue as unknown[] | undefined)?.length ?? 0}`,
      );
    } catch (err) {
      setPlanetMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPlanetBusy(false);
    }
  };

  const previewBuild = async (opts: {
    systemId: string;
    planetId: string;
    buildingId: string;
  }) => {
    if (!payload) return null;
    try {
      const res = await fetch("/api/economy/preview-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          ...opts,
        }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, error: data.error || res.statusText };
      return data;
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  };

  const openResearchWithTech = useCallback((techId: string) => {
    setResearchHighlightTechId(techId);
    goView("research");
  }, []);

  const highlightSystemsForTech = useCallback(
    (techId: string) => {
      if (!payload) return;
      const tech = getCachedContent()?.technologies?.[techId];
      if (!tech) {
        setResearchMsg("Неизвестная технология");
        return;
      }
      const ids = systemsForTechHighlight(
        tech,
        payload.world.systems || [],
        payload.factionId,
        {
          techTiers: payload.economy?.techTiers,
          unlockedProperties: payload.economy?.unlockedProperties,
        },
      );
      setTechMapHighlightIds(ids);
      goView("map");
      if (ids[0]) {
        setSelectedSystemId(ids[0]);
        window.setTimeout(() => mapApiRef.current?.focusSystem(ids[0]), 80);
      }
      setResearchMsg(
        ids.length
          ? `Подсвечено систем: ${ids.length} · «${tech.name}» (Esc — сброс)`
          : "Нет подходящих систем",
      );
    },
    [payload],
  );

  const runPlanetAction = async (req: PlanetActionRequest) => {
    if (!payload) return;
    setPlanetBusy(true);
    setPlanetMsg(null);
    try {
      const res = await fetch("/api/planet/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          ...req,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.world) {
        setPayload({
          ...payload,
          world: data.world,
          visibleSystemIds: data.visibleSystemIds ?? payload.visibleSystemIds,
          economy: data.economy
            ? { ...payload.economy, ...data.economy }
            : payload.economy,
          reservedAp: data.reservedAp ?? payload.reservedAp,
          apMax: data.apMax ?? payload.apMax,
        });
        loadWorld(data.world);
      }
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      if (typeof data.apMax === "number") setApMax(data.apMax);
      const labels: Record<string, string> = {
        build: "Постройка завершена",
        demolish: "Постройка снесена",
        colonize: "Колония основана",
        set_colony_type: "Тип колонии изменён",
      };
      setPlanetMsg(labels[req.action] ?? "Готово");
      bump();
    } catch (e) {
      setPlanetMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanetBusy(false);
    }
  };

  const runSystemAction = async (req: {
    action: string;
    systemId: string;
    stationKind?: string;
    stationId?: string;
    shipId?: string;
    unitId?: string;
    count?: number;
    planetId?: string;
    beltAngle?: number;
    name?: string;
  }) => {
    if (!payload) return;
    setSystemBusy(true);
    setSystemMsg(null);
    try {
      const res = await fetch("/api/system/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          ...req,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (data.world) {
        setPayload({
          ...payload,
          world: data.world,
          visibleSystemIds: data.visibleSystemIds ?? payload.visibleSystemIds,
          economy: data.economy
            ? { ...payload.economy, ...data.economy }
            : payload.economy,
          reservedAp: data.reservedAp ?? payload.reservedAp,
          apMax: data.apMax ?? payload.apMax,
        });
        loadWorld(data.world);
      }
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      if (typeof data.apMax === "number") setApMax(data.apMax);
      const labels: Record<string, string> = {
        build_station: "Станция построена",
        demolish_station: "Станция снесена",
        produce_ship: "Корабли добавлены во флот",
        produce_unit: "Войска добавлены в легион",
        rename_system: "Система переименована",
      };
      setSystemMsg(labels[req.action] ?? "Готово");
      bump();
    } catch (e) {
      setSystemMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSystemBusy(false);
    }
  };

  const cancelOrder = async (orderId: string) => {
    if (!payload) return;
    try {
      const res = await fetch(`/api/intents/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      const cancelled = payload.world.orders.find((o) => o.id === orderId);
      let world = {
        ...payload.world,
        orders: payload.world.orders.filter((x) => x.id !== orderId),
      };
      if (cancelled?.fleetId) {
        world = {
          ...world,
          fleets: world.fleets.map((f) =>
            f.id === cancelled.fleetId ? { ...f, route: [] } : f,
          ),
        };
      }
      if (cancelled?.legionId) {
        world = {
          ...world,
          legions: world.legions.map((l) =>
            l.id === cancelled.legionId ? { ...l, route: [] } : l,
          ),
        };
      }
      setPayload({ ...payload, world });
      loadWorld(world);
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      else setReservedAp((r) => Math.max(0, r - 1));
      if (typeof data.apMax === "number") setApMax(data.apMax);
      setOrderMsg("Приказ отменён");
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const readModel = () => {
    if (!payload) {
      return {
        world: emptyWorld(),
        selectedSystemId: null,
        selectedFleetId: null,
        selectedLegionId: null,
        selectedLinkId: null,
        selectedSectorId: null,
        linkDraftFromId: null,
        sectorDraftPoints: [],
        ...layers,
        perfMode,
        graphics,
      } satisfies MapViewModel;
    }
    const m: MapViewModel = {
      world: payload.world,
      selectedSystemId,
      selectedFleetId,
      selectedLegionId,
      selectedLinkId: null,
      selectedSectorId: null,
      linkDraftFromId: null,
      sectorDraftPoints: [],
      ...layers,
      /* Routes/orders must always show for player moves. */
      showOrders: true,
      /* Capital→systems spokes clutter player map; never for viewer. */
      showSupply: false,
      activeFactionId: payload.factionId,
      economyBottleneckSystemIds,
      perfMode,
      graphics,
    };
    modelRef.current = m;
    return m;
  };

  const subscribe = (cb: () => void) => {
    listeners.current.add(cb);
    return () => {
      listeners.current.delete(cb);
    };
  };

  const selectedSystem = useMemo(
    () => payload?.world.systems.find((s) => s.id === selectedSystemId) ?? null,
    [payload, selectedSystemId],
  );
  const selectedFleet = useMemo(
    () => payload?.world.fleets.find((f) => f.id === selectedFleetId) ?? null,
    [payload, selectedFleetId],
  );
  const selectedLegion = useMemo(
    () => payload?.world.legions.find((l) => l.id === selectedLegionId) ?? null,
    [payload, selectedLegionId],
  );

  const applyLocalMoveRoute = (
    world: WorldState,
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    arriveStance: "idle" | "blockade" | "fortify" = "idle",
  ): WorldState => {
    const fromId =
      kind === "fleet"
        ? world.fleets.find((f) => f.id === unitId)?.systemId
        : world.legions.find((l) => l.id === unitId)?.systemId;
    const path = hopPath(world, fromId, toSystemId);
    // Mirror server: first hop this "tick" preview as full remaining path for UI.
    const route = path.length >= 2 ? path.slice(1) : [];
    if (kind === "fleet") {
      const multiHop = route.length > 1;
      return {
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === unitId
            ? {
                ...f,
                route,
                stance: multiHop
                  ? ("move" as const)
                  : route.length === 1
                    ? ("move" as const)
                    : arriveStance,
                pendingArrival:
                  route.length > 0
                    ? { stance: arriveStance, systemId: toSystemId }
                    : undefined,
              }
            : f,
        ),
      };
    }
    return {
      ...world,
      legions: world.legions.map((l) =>
        l.id === unitId ? { ...l, route } : l,
      ),
    };
  };

  const applyLocalFleetOrder = (
    world: WorldState,
    unitId: string,
    toSystemId: string,
    orderType: OrderType,
    fromSystemId?: string,
  ): WorldState => {
    if (orderType === "move_fleet" && fromSystemId) {
      return applyLocalMoveRoute(world, "fleet", unitId, toSystemId, "idle");
    }
    if (orderType === "blockade") {
      if (fromSystemId && fromSystemId !== toSystemId) {
        // En route — do not mark blockaded until arrival (server applies on last hop).
        return applyLocalMoveRoute(
          world,
          "fleet",
          unitId,
          toSystemId,
          "blockade",
        );
      }
      return {
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === unitId
            ? {
                ...f,
                route: [],
                stance: "blockade" as const,
                pendingArrival: undefined,
              }
            : f,
        ),
        systems: world.systems.map((s) =>
          s.id === toSystemId ? { ...s, blockaded: true } : s,
        ),
      };
    }
    if (orderType === "fortify") {
      if (fromSystemId && fromSystemId !== toSystemId) {
        return applyLocalMoveRoute(
          world,
          "fleet",
          unitId,
          toSystemId,
          "fortify",
        );
      }
      return {
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === unitId
            ? {
                ...f,
                route: [],
                stance: "fortify" as const,
                pendingArrival: undefined,
              }
            : f,
        ),
      };
    }
    return world;
  };

  const submitUnitOrder = async (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops: number | undefined,
    orderType: OrderType,
    noteOverride?: string,
  ) => {
    if (!payload) return;
    setOrderMsg(null);
    const fromSystemId =
      kind === "fleet"
        ? payload.world.fleets.find((f) => f.id === unitId)?.systemId
        : payload.world.legions.find((l) => l.id === unitId)?.systemId;
    const isMove = orderType === "move_fleet" || orderType === "move_legion";
    const isFleetStanceOrder =
      orderType === "blockade" || orderType === "fortify";
    const hopsLabel =
      hops != null && Number.isFinite(hops) ? ` · ${formatHopTurns(hops)}` : "";
    const body = {
      factionId: payload.factionId,
      password,
      type: orderType,
      fleetId: kind === "fleet" ? unitId : undefined,
      legionId: kind === "legion" ? unitId : undefined,
      fromSystemId,
      toSystemId,
      note:
        noteOverride ??
        (isMove
          ? hops
            ? `Перетаскивание${hopsLabel}`
            : "Перетаскивание"
          : orderType === "blockade"
            ? `Блокада${hopsLabel}`
            : orderType === "fortify"
              ? "Оборона"
              : `Жест · ${orderType}${hopsLabel}`),
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      let nextWorld = {
        ...payload.world,
        orders: [...payload.world.orders, data.order],
      };
      if (isMove && fromSystemId) {
        nextWorld = applyLocalMoveRoute(nextWorld, kind, unitId, toSystemId);
      } else if (kind === "fleet" && isFleetStanceOrder) {
        nextWorld = applyLocalFleetOrder(
          nextWorld,
          unitId,
          toSystemId,
          orderType,
          fromSystemId,
        );
      }
      setPayload({ ...payload, world: nextWorld });
      loadWorld(nextWorld);
      if (typeof data.apMax === "number") setApMax(data.apMax);
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      else if (typeof data.intent?.apCost === "number") {
        setReservedAp((r) => r + data.intent.apCost);
      }
      const nextAp =
        typeof data.reservedAp === "number"
          ? data.reservedAp
          : reservedAp + (data.intent?.apCost ?? 0);
      const verb =
        orderType === "attack_system"
          ? "Приказ на атаку принят"
          : orderType === "claim_system"
            ? "Приказ на захват принят"
            : orderType === "blockade"
              ? "Приказ на блокаду принят"
              : orderType === "fortify"
                ? "Приказ на оборону принят"
                : "Приказ на ход принят";
      setOrderMsg(`${verb}${hopsLabel} · AP ${nextAp}/${data.apMax ?? apMax}`);
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Legacy alias: move-only drag (kept for any external callers).
  const submitMoveOrder = (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops?: number,
  ) => submitUnitOrder(kind, unitId, toSystemId, hops, kind === "fleet" ? "move_fleet" : "move_legion");

  const submitDirectAttack = (fleetId: string, toSystemId: string) => {
    setSelectedFleetId(fleetId);
    setSelectedLegionId(null);
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("attack_system");
    void submitUnitOrder("fleet", fleetId, toSystemId, undefined, "attack_system");
  };

  const submitDirectClaim = (toSystemId: string, fleetId?: string | null) => {
    if (fleetId) {
      setSelectedFleetId(fleetId);
      setSelectedLegionId(null);
    }
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("claim_system");
    if (!payload) return;
    setOrderMsg(null);
    const fromSystemId = fleetId
      ? payload.world.fleets.find((f) => f.id === fleetId)?.systemId
      : undefined;
    const body = {
      factionId: payload.factionId,
      password,
      type: "claim_system" as const,
      fleetId: fleetId ?? undefined,
      fromSystemId,
      toSystemId,
      note: "Жест · claim_system",
    };
    void (async () => {
      try {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || res.statusText);
        }
        const data = await res.json();
        const nextWorld = {
          ...payload.world,
          orders: [...payload.world.orders, data.order],
        };
        setPayload({ ...payload, world: nextWorld });
        loadWorld(nextWorld);
        if (typeof data.apMax === "number") setApMax(data.apMax);
        if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
        else if (typeof data.intent?.apCost === "number") {
          setReservedAp((r) => r + data.intent.apCost);
        }
        const nextAp =
          typeof data.reservedAp === "number"
            ? data.reservedAp
            : reservedAp + (data.intent?.apCost ?? 0);
        setOrderMsg(
          `Приказ на захват принят · AP ${nextAp}/${data.apMax ?? apMax}`,
        );
        bump();
      } catch (e) {
        setOrderMsg(e instanceof Error ? e.message : String(e));
      }
    })();
  };

  const submitDirectBlockade = (
    fleetId: string,
    toSystemId: string,
    hops?: number,
  ) => {
    setSelectedFleetId(fleetId);
    setSelectedLegionId(null);
    setSelectedSystemId(toSystemId);
    setTargetSystemId(toSystemId);
    setOrderType("blockade");
    void submitUnitOrder("fleet", fleetId, toSystemId, hops, "blockade");
  };

  const cancelFleetRoute = useCallback(
    async (fleetId: string) => {
      if (!payload) return;
      const pending = payload.world.orders.find(
        (o) =>
          o.fleetId === fleetId &&
          o.status === "pending" &&
          (o.type === "move_fleet" || o.type === "blockade"),
      );
      if (pending) {
        await cancelOrder(pending.id);
        return;
      }
      const nextWorld = {
        ...payload.world,
        fleets: payload.world.fleets.map((f) =>
          f.id === fleetId ? { ...f, route: [] } : f,
        ),
      };
      setPayload({ ...payload, world: nextWorld });
      loadWorld(nextWorld);
      setOrderMsg("Маршрут сброшен");
      bump();
    },
    [payload, cancelOrder, loadWorld, bump],
  );

  const clearFleetStance = useCallback(
    (fleetId: string) => {
      if (!payload) return;
      const nextWorld = {
        ...payload.world,
        fleets: payload.world.fleets.map((f) =>
          f.id === fleetId
            ? {
                ...f,
                stance: "idle" as const,
                route: [],
                pendingArrival: undefined,
              }
            : f,
        ),
      };
      setPayload({ ...payload, world: nextWorld });
      loadWorld(nextWorld);
      setOrderMsg("Режим сброшен");
      bump();
    },
    [payload, loadWorld, bump],
  );

  const openStanceRing = useCallback(
    (
      engagementId: string,
      anchor?: { clientX: number; clientY: number },
    ) => {
      if (!payload) return;
      const eng = engagements.find((e) => e.id === engagementId);
      if (!eng) return;
      const mySide = eng.sides.find((s) => s.factionId === payload.factionId);
      if (!mySide || mySide.locked) return;
      setStanceRing({
        engagementId,
        x: anchor?.clientX ?? window.innerWidth / 2,
        y: anchor?.clientY ?? window.innerHeight / 2,
      });
    },
    [payload, engagements],
  );

  const openPlayerSystem = useCallback((systemId: string) => {
    setSystemFocusId(systemId);
    setSelectedSystemId(systemId);
    setSheetOpen(false);
    setTouchMoveArmed(false);
    setViewerCtx(null);
    useWorldStore.setState({
      dossierSystemId: null,
      selectedSystemId: systemId,
      mapFocus: { level: "system", systemId },
      contextMenu: null,
    });
    window.setTimeout(() => mapApiRef.current?.focusSystem(systemId), 80);
  }, []);

  const openPlayerPlanet = useCallback((systemId: string, planetId: string) => {
    useWorldStore.setState({
      dossierSystemId: null,
      mapFocus: { level: "planet", systemId, planetId },
    });
  }, []);

  const openBuildingFromResearch = useCallback(
    (buildingId: string) => {
      if (!payload) return;
      const def = buildingsCatalog[buildingId];
      const hit = findPlanetForBuilding(
        buildingId,
        payload.world.systems || [],
        payload.factionId,
      );
      if (!hit) {
        setResearchMsg("Нет своей планеты для постройки");
        return;
      }
      setTechMapHighlightIds([hit.systemId]);
      goView("map");
      openPlayerSystem(hit.systemId);
      openPlayerPlanet(hit.systemId, hit.planetId);
      setResearchMsg(
        def
          ? `Открыта «${hit.systemName}» для «${def.name}»`
          : `Открыта система ${hit.systemName}`,
      );
    },
    [payload, buildingsCatalog, openPlayerSystem, openPlayerPlanet],
  );

  const closePlayerSystem = useCallback(() => {
    setSystemFocusId(null);
    setEconomyLinkedSystemId(null);
    closeSystemView();
    useWorldStore.setState({
      dossierSystemId: null,
      mapFocus: { level: "galaxy" },
    });
  }, [closeSystemView]);

  const openSystemHelp = useCallback((systemId: string) => {
    useWorldStore.setState({ dossierSystemId: systemId });
  }, []);

  const closeSystemHelp = useCallback(() => {
    useWorldStore.setState({ dossierSystemId: null });
  }, []);

  const focusedSystem = useMemo(
    () => payload?.world.systems.find((s) => s.id === systemFocusId) ?? null,
    [payload, systemFocusId],
  );

  const playerSystemNav = useMemo(() => {
    if (!systemFocusId) return undefined;
    return {
      onGalaxyBack: closePlayerSystem,
      onOpenSystem: (id: string) => {
        setSystemFocusId(id);
        setSelectedSystemId(id);
        useWorldStore.setState({
          dossierSystemId: null,
          mapFocus: { level: "system", systemId: id },
        });
      },
      onOpenPlanet: openPlayerPlanet,
      selectedPlanetId:
        mapFocus.level === "planet" && mapFocus.systemId === systemFocusId
          ? mapFocus.planetId
          : null,
    };
  }, [systemFocusId, mapFocus, closePlayerSystem, openPlayerPlanet]);

  useEffect(() => {
    if (!systemFocusId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const dossierOpen = useWorldStore.getState().dossierSystemId;
        if (dossierOpen) {
          closeSystemHelp();
          return;
        }
        closePlayerSystem();
        return;
      }
      if (
        (e.key === "i" || e.key === "I" || e.key === "ш" || e.key === "Ш") &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        const t = e.target as HTMLElement | null;
        if (
          t &&
          (t.tagName === "INPUT" ||
            t.tagName === "TEXTAREA" ||
            t.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        const open = useWorldStore.getState().dossierSystemId;
        if (open) closeSystemHelp();
        else openSystemHelp(systemFocusId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [systemFocusId, closePlayerSystem, closeSystemHelp, openSystemHelp]);

  const openFleetOrderRing = useCallback(
    (pick: MapContextPick) => {
      if (!payload) return false;
      const ring = resolveFleetOrderRing(pick, payload, selectedFleetId);
      if (!ring) return false;
      setViewerCtx(null);
      setOrderRing(ring);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      if (ring.fleetId) setSelectedFleetId(ring.fleetId);
      setSelectedSystemId(ring.systemId);
      setTargetSystemId(ring.systemId);
      return true;
    },
    [payload, selectedFleetId],
  );

  const onUnitDrop = (drop: MapUnitDropPayload) => {
    if (!payload) return;
    const gatedIntents: UnitDropIntent[] = ["move", "attack", "claim"];
    if (
      gatedIntents.includes(drop.intent ?? "move") &&
      !payload.visibleSystemIds.includes(drop.toSystemId)
    ) {
      setOrderMsg("Цель вне радиуса обзора");
      return;
    }
    if (drop.kind === "fleet") {
      setSelectedFleetId(drop.unitId);
      setSelectedLegionId(null);
    } else {
      setSelectedLegionId(drop.unitId);
      setSelectedFleetId(null);
    }
    setSelectedSystemId(drop.toSystemId);
    setTargetSystemId(drop.toSystemId);
    const intentToType: Record<UnitDropIntent, OrderType> = {
      move: drop.kind === "fleet" ? "move_fleet" : "move_legion",
      attack: "attack_system",
      claim: "claim_system",
    };
    const orderType = intentToType[drop.intent ?? "move"];
    setOrderType(orderType);
    setSheetOpen(false);
    void submitUnitOrder(drop.kind, drop.unitId, drop.toSystemId, drop.hops, orderType);
  };

  const submitOrder = async () => {
    if (!payload) return;
    setOrderMsg(null);
    const body = {
      factionId: payload.factionId,
      password,
      type: orderType,
      fleetId: selectedFleetId ?? undefined,
      legionId: selectedLegionId ?? undefined,
      fromSystemId:
        selectedFleet?.systemId ??
        selectedLegion?.systemId ??
        selectedSystemId ??
        undefined,
      toSystemId: targetSystemId ?? selectedSystemId ?? undefined,
      note: orderNote,
    };
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || res.statusText);
      }
      const data = await res.json();
      let nextWorld = {
        ...payload.world,
        orders: [...payload.world.orders, data.order],
      };
      const toId = body.toSystemId;
      if (
        toId &&
        (orderType === "move_fleet" || orderType === "move_legion")
      ) {
        const unitId =
          orderType === "move_fleet" ? selectedFleetId : selectedLegionId;
        if (unitId) {
          nextWorld = applyLocalMoveRoute(
            nextWorld,
            orderType === "move_fleet" ? "fleet" : "legion",
            unitId,
            toId,
          );
        }
      }
      setPayload({ ...payload, world: nextWorld });
      loadWorld(nextWorld);
      if (typeof data.apMax === "number") setApMax(data.apMax);
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      else if (typeof data.intent?.apCost === "number") {
        setReservedAp((r) => r + data.intent.apCost);
      }
      const nextAp =
        typeof data.reservedAp === "number"
          ? data.reservedAp
          : reservedAp + (data.intent?.apCost ?? 0);
      setOrderMsg(
        `Приказ принят · AP ${nextAp}/${data.apMax ?? apMax}`,
      );
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  // Hooks must run before any early return (login screen).
  /** Slim edge panel: HQ only. */
  const desktopGlass = !mobile && viewMode === "hq";
  /** Full workbench modal: diplo / market / research / forces / quests. */
  const desktopWorkbench =
    !mobile &&
    (viewMode === "forces" ||
      viewMode === "research" ||
      viewMode === "market" ||
      viewMode === "diplomacy" ||
      viewMode === "quests" ||
      viewMode === "codex");
  const mobileRoom =
    mobile &&
    (viewMode === "hq" ||
      viewMode === "forces" ||
      viewMode === "research" ||
      viewMode === "market" ||
      viewMode === "diplomacy" ||
      viewMode === "quests" ||
      viewMode === "codex");
  // Map-first: workbenches keep the map mounted underneath.
  const showMapLayer =
    !!payload &&
    (viewMode === "map" ||
      viewMode === "economy" ||
      desktopGlass ||
      desktopWorkbench ||
      mobileRoom ||
      queueOpen ||
      (!mobile && viewMode === "rp"));

  const pendingCount = useMemo(
    () =>
      payload?.world.orders.filter((o) => o.status === "pending").length ?? 0,
    [payload],
  );

  const focusAlertIdleFleet = useCallback(
    (fleetId: string, systemId: string) => {
      if (!payload) return;
      setSelectedFleetId(fleetId);
      setSelectedLegionId(null);
      setSelectedSystemId(systemId);
      setViewMode("map");
      setMenuOpen(false);
      setSettingsOpen(false);
      setRpFloatOpen(false);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      writeStoredStart("map");
      window.setTimeout(
        () => mapApiRef.current?.focusSystem(systemId),
        80,
      );
    },
    [payload],
  );

  const focusAlertEngagement = useCallback(
    (
      systemId: string,
      engagementId: string,
      anchor?: { clientX: number; clientY: number },
    ) => {
      if (!payload) return;
      setSelectedSystemId(systemId);
      setViewMode("map");
      setMenuOpen(false);
      setSettingsOpen(false);
      setRpFloatOpen(false);
      setSheetOpen(false);
      setTouchMoveArmed(false);
      writeStoredStart("map");
      openStanceRing(engagementId, anchor);
      window.setTimeout(
        () => mapApiRef.current?.focusSystem(systemId),
        80,
      );
    },
    [payload, openStanceRing],
  );

  const focusAlertOrders = useCallback(() => {
    setViewMode("map");
    setQueueOpen(true);
    setMenuOpen(false);
    setSettingsOpen(false);
    setRpFloatOpen(false);
    setTouchMoveArmed(false);
    writeStoredStart("map");
  }, []);

  const focusAlertDiplo = useCallback((offerId?: string) => {
    setFocusDiploOfferId(offerId ?? null);
    setQueueOpen(false);
    setMenuOpen(false);
    setSettingsOpen(false);
    setRpFloatOpen(false);
    setTouchMoveArmed(false);
    setViewMode("diplomacy");
    writeStoredStart("hq");
  }, []);

  const focusAlertRp = useCallback(() => {
    setViewMode("rp");
    setMenuOpen(false);
    setSettingsOpen(false);
    setRpFloatOpen(true);
    setTouchMoveArmed(false);
    setRpUnread(0);
    writeStoredStart("hq");
  }, []);

  const focusAlertEconomy = useCallback((anchor?: AlertFocusAnchor) => {
    setEconomyPopover({
      x: anchor?.clientX ?? window.innerWidth * 0.5,
      y: anchor?.clientY ?? 96,
    });
    setMenuOpen(false);
    setSettingsOpen(false);
    setRpFloatOpen(false);
    setTouchMoveArmed(false);
  }, []);

  const economySystemSignals = useMemo(() => {
    if (!payload) return [];
    return buildEconomySystemSignals(payload, flowData);
  }, [payload, flowData]);

  const economyBottleneckSystemIds = useMemo(() => {
    const bn = severeBottleneckSystemIds(economySystemSignals);
    if (!techMapHighlightIds.length) return bn;
    return [...new Set([...bn, ...techMapHighlightIds])];
  }, [economySystemSignals, techMapHighlightIds]);

  useEffect(() => {
    bump();
  }, [flowData, economyBottleneckSystemIds]);

  useEffect(() => {
    if (!techMapHighlightIds.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTechMapHighlightIds([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [techMapHighlightIds]);

  const viewerAlertItems = useMemo(() => {
    if (!payload) return [];
    return buildViewerAlerts({
      payload,
      engagements,
      pendingOrderCount: pendingCount,
      rpUnread,
      systemSignals: economySystemSignals,
      callbacks: {
        onFocusIdleFleet: focusAlertIdleFleet,
        onFocusEngagement: focusAlertEngagement,
        onFocusOrders: focusAlertOrders,
        onFocusRp: focusAlertRp,
        onFocusEconomy: focusAlertEconomy,
        onFocusDiplo: focusAlertDiplo,
      },
    });
  }, [
    payload,
    engagements,
    pendingCount,
    rpUnread,
    focusAlertIdleFleet,
    focusAlertEngagement,
    focusAlertOrders,
    focusAlertDiplo,
    focusAlertRp,
    focusAlertEconomy,
    economySystemSignals,
  ]);

  useEffect(() => {
    if (!showMapLayer) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const id = mapModePresetFromHotkey(e.key);
      if (!id) return;
      e.preventDefault();
      setLayers((prev) => {
        const next = applyLayerPreset(prev, id);
        writeStoredViewerLayers(next);
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMapLayer]);

  /** Room dock: 1–7 (desktop) / 1–4 (mobile). F5–F9 remain map layer presets. */
  useEffect(() => {
    if (!payload) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      ) {
        return;
      }
      if (e.key === "q" || e.key === "Q" || e.key === "й" || e.key === "Й") {
        e.preventDefault();
        setQueueOpen((v) => !v);
        return;
      }
      if (viewMode === "market") {
        const mt = MARKET_TAB_BY_DIGIT[e.key];
        if (mt) {
          e.preventDefault();
          setMarketTab(mt);
          return;
        }
      }
      if (viewMode === "research") {
        const rb = RESEARCH_BRANCH_BY_DIGIT[e.key];
        if (rb) {
          e.preventDefault();
          setResearchBranch(rb);
          return;
        }
      }
      const view = dockViewFromDigit(e.key, mobile);
      if (!view) return;
      e.preventDefault();
      goView(view);
      if (view === "rp") setRpUnread(0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [payload, mobile, viewMode]);

  // Era cinematic when max researched tech era advances
  useEffect(() => {
    if (!payload?.factionId) return;
    const techs = getCachedContent()?.technologies || {};
    const unlocked = new Set(payload.economy?.unlockedTechs || []);
    let maxEra = 1;
    for (const t of Object.values(techs)) {
      if (unlocked.has(t.id)) maxEra = Math.max(maxEra, t.era ?? 1);
    }
    const key = `gmap-era-seen-${payload.factionId}`;
    let prev = 1;
    try {
      prev = Number(sessionStorage.getItem(key) || "0") || 0;
    } catch {
      prev = 0;
    }
    if (prev === 0) {
      try {
        sessionStorage.setItem(key, String(maxEra));
      } catch {
        /* ignore */
      }
      return;
    }
    if (maxEra <= prev) return;
    try {
      sessionStorage.setItem(key, String(maxEra));
    } catch {
      /* ignore */
    }
    setEraBanner(maxEra);
    const t = window.setTimeout(() => setEraBanner(null), 4200);
    return () => window.clearTimeout(t);
  }, [payload?.factionId, payload?.economy?.unlockedTechs]);

  if (!payload) {
    return (
      <div className="viewer-login">
        <div className="login-card">
          <p className="login-eyebrow">Доступ к кампании</p>
          <h1>LO GOLDEN PAX</h1>
          <p className="hint" style={{ textAlign: "center" }}>
            После входа — карта галактики. Штаб, наука, рынок и сцена — внизу.
          </p>
          {factions.length === 0 && !error && (
            <p className="hint">Синхронизация списка держав…</p>
          )}
          <button type="button" className="btn" onClick={() => void loadFactions()}>
            Обновить список
          </button>
          {factions.length > 0 && (
            <>
              <label className="field">
                <span>Держава / фракция</span>
                <select
                  value={factionId}
                  onChange={(e) => setFactionId(e.target.value)}
                >
                  {factions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Код доступа</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Код доступа"
                  autoComplete="current-password"
                />
              </label>

              <div className="login-perf">
                <span className="login-perf-label">Режим карты</span>
                {mobile && (
                  <p className="hint login-perf-rec">
                    С телефона: <strong>Суперлайт</strong> — самый плавный,{" "}
                    <strong>Качество</strong> — красивее без лагов при зуме.
                  </p>
                )}
                <div className="login-perf-options" role="radiogroup" aria-label="Режим карты">
                  {PERF_OPTIONS.filter((opt) => !(mobile && opt.desktopOnly)).map(
                    (opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        role="radio"
                        aria-checked={loginPerf === opt.id}
                        className={`login-perf-card ${loginPerf === opt.id ? "active" : ""} ${
                          mobile && opt.mobileRec ? "recommended" : ""
                        }`}
                        onClick={() => setLoginPerf(opt.id)}
                      >
                        <strong>
                          {opt.label}
                          {mobile && opt.mobileRec ? " · реком." : ""}
                        </strong>
                        <span>{opt.hint}</span>
                      </button>
                    ),
                  )}
                </div>
              </div>

              <button
                type="button"
                className="btn primary"
                onClick={() => void login()}
              >
                Войти к столу
              </button>
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const faction = payload.world.factions.find((f) => f.id === payload.factionId);
  const playerQuests = visiblePlayerQuests(payload.world);
  const activeQuestCount = playerQuests.filter((q) => q.status === "active")
    .length;
  const warCount = (payload.world.diplomacy ?? []).filter(
    (d) =>
      d.relation === "war" &&
      (d.aId === payload.factionId || d.bId === payload.factionId),
  ).length;
  const openEngagementCount = countOpenEngagements(
    engagements,
    payload.factionId,
  );
  const openQuest =
    openQuestId != null
      ? playerQuests.find((q) => q.id === openQuestId) ?? null
      : null;

  const affordableResearch = countAffordableResearch(payload.economy);
  const tradePartnerCount = payload.tradePartnerIds?.length ?? 0;

  const hqPanel = (
    <PlayerHqHome
      payload={payload}
      reservedAp={reservedAp}
      apMax={apMax}
      rpUnread={rpUnread}
      pendingOrders={pendingCount}
      orderMsg={orderMsg}
      onSetTax={(taxSlot, tier) => void setTax(taxSlot, tier)}
      onScoutReveal={(systemId) => void submitScoutReveal(systemId)}
      mapSelectedSystemId={selectedSystemId}
      onOpenForces={() => goView("forces")}
      onOpenOrders={() => {
        goView("map");
        setQueueOpen(true);
      }}
      onOpenDiplomacy={() => goView("diplomacy")}
      onOpenQuests={() => goView("quests")}
      onOpenRp={() => {
        goView("rp");
        setRpUnread(0);
      }}
      onOpenMap={() => goView("map")}
      onOpenResearch={() => goView("research")}
      onOpenMarket={() => goView("market")}
      onOpenEconomy={() => goView("economy")}
      affordableResearch={affordableResearch}
      tradePartnerCount={tradePartnerCount}
      marketMyOffers={marketBookStats.myOffers}
      marketPeerLots={marketBookStats.peerLots}
      activeQuestCount={activeQuestCount}
      warCount={warCount}
      openEngagementCount={openEngagementCount}
      engagements={engagements}
      stanceBusy={stanceBusy}
      onSubmitCombatStance={(engId, stance) =>
        void submitCombatStance(engId, stance)
      }
      onOpenStanceRing={(engId, anchor) => openStanceRing(engId, anchor)}
    />
  );

  const researchPanel = payload.economy ? (
    <ResearchPanel
      eco={payload.economy}
      world={payload.world}
      factionId={payload.factionId}
      onResearch={(id) => void researchTech(id)}
      onResearchUpgrade={(techId, upgradeId) =>
        void researchUpgrade(techId, upgradeId)
      }
      onSetQueue={(queue) => void setResearchQueue(queue)}
      onAccelerate={(id) => void accelerateResearch(id)}
      busy={researchBusy}
      msg={researchMsg}
      branch={researchBranch}
      onBranchChange={setResearchBranch}
      highlightTechId={researchHighlightTechId}
      cognitioIncome={flowData?.totals?.F?.net ?? 0}
      categoryIncome={
        researchBranch
          ? (flowData?.totals?.[researchBranch]?.net ?? 0)
          : (flowData?.totals?.F?.net ?? 0)
      }
      categoryDemand={
        researchBranch
          ? (flowData?.totals?.[researchBranch]?.demand ?? 0)
          : (flowData?.totals?.F?.demand ?? 0)
      }
      onOpenBuilding={openBuildingFromResearch}
      onTechMapDrag={highlightSystemsForTech}
      onEffectNavigate={(target) => {
        if (target.kind === "economy_production") {
          setEconomyFocusCategory(target.category ?? null);
          goView("economy");
          setOrderMsg(
            target.category
              ? `Производство · фильтр ${target.category}`
              : "Производство",
          );
        } else if (target.kind === "forces") {
          const ids = [target.fromDefId, target.toDefId].filter(
            Boolean,
          ) as string[];
          setForcesHighlightDefIds(ids.length ? ids : null);
          goView("forces");
          setOrderMsg(
            ids.length
              ? `Силы · подсветка ${ids.join(" → ")}`
              : "Силы",
          );
        }
      }}
      asRoom={false}
    />
  ) : (
    <div className="hq-panel">
      <header className="hq-panel-head">
        <h2>Наука</h2>
        <p className="hint">Нет данных экономики — перелогиньтесь после тика.</p>
      </header>
    </div>
  );

  const marketPanel = (
    <MarketPanel
      interactive
      factionId={payload.factionId}
      password={password}
      economy={payload.economy}
      reservedAp={reservedAp}
      apMax={apMax}
      orderMsg={orderMsg}
      tradePartnerIds={payload.tradePartnerIds}
      worldFactions={payload.world.factions}
      systems={payload.world.systems.map((s) => ({ id: s.id, name: s.name }))}
      mapSelectedSystemId={selectedSystemId}
      tab={marketTab}
      onTabChange={setMarketTab}
      prefillSellCurrency={marketPrefillCurrency}
      onOpenDiplomacy={() => goView("diplomacy")}
      onBookStats={setMarketBookStats}
      onConvert={(from, to, amt) => void submitMarketConvert(from, to, amt)}
      onPlaceOffer={(side, giveCur, giveAmt, wantCur, wantAmt, venue) =>
        void submitMarketOffer(
          side,
          giveCur,
          giveAmt,
          wantCur,
          wantAmt,
          venue,
        )
      }
      onCancelOffer={(offerId) => void submitMarketCancel(offerId)}
      onEconomyPatch={(eco) => {
        if (!eco) return;
        setPayload((prev) =>
          prev ? { ...prev, economy: { ...prev.economy, ...eco } } : prev,
        );
      }}
    />
  );

  const diploIncoming = (payload.diploOffers?.incoming ??
    []) as DiploOffer[];
  const diploOutgoing = (payload.diploOffers?.outgoing ??
    []) as DiploOffer[];

  const diplomacyPanel = (
    <ViewerDiploPanel
      payload={payload}
      economy={payload.economy}
      incoming={diploIncoming}
      outgoing={diploOutgoing}
      busy={diploBusy}
      msg={diploMsg}
      focusOfferId={focusDiploOfferId}
      onCreate={({ toFactionId, give, want, note }) =>
        void diploOfferAction(
          "create",
          { toFactionId, give, want, note },
          "Предложение отправлено — адресат увидит его сразу",
        )
      }
      onAccept={(id) =>
        void diploOfferAction("accept", { offerId: id }, "Сделка принята")
      }
      onReject={(id) =>
        void diploOfferAction("reject", { offerId: id }, "Предложение отклонено")
      }
      onCancel={(id) =>
        void diploOfferAction("cancel", { offerId: id }, "Предложение отозвано")
      }
      onGift={(toId, cur, amt) => void submitTransfer(toId, cur, amt)}
      onTransfer={(toId, cur, amt) => void submitTransfer(toId, cur, amt)}
    />
  );

  const questsPanel = (
    <ViewerQuestPanel
      payload={payload}
      onFocusSystem={(systemId) => {
        setSelectedSystemId(systemId);
        goView("map");
        window.setTimeout(() => mapApiRef.current?.focusSystem(systemId), 80);
      }}
      actions={{
        onThrowYearlyDice: async () => {
          const res = await submitQuestAction("throw_quest_dice");
          if (!res.ok) {
            return {
              ok: false,
              error:
                (res.error as string | undefined) ||
                "Не удалось бросить ежеходный кубик",
            };
          }
          setOrderMsg(res.message || `Ежходные квесты: ${res.count ?? 0}`);
          const spawned = Array.isArray(res.quests)
            ? (res.quests as { id?: string }[])
                .map((q) => q?.id)
                .filter((id): id is string => Boolean(id))
            : [];
          return {
            ok: true,
            roll: res.roll as number | undefined,
            message: res.message as string | undefined,
            questIds: spawned,
          };
        },
        onResolveChoice: async (questId, choiceId) => {
          const res = await submitQuestAction("resolve_quest_choice", {
            questId,
            choiceId,
          });
          if (res.ok) setOrderMsg("Выбор по квесту применён");
          return res.ok;
        },
        onResolveDice: async (questId, specIndex, choiceId) => {
          const res = await submitQuestAction("resolve_quest_dice", {
            questId,
            specIndex,
            choiceId,
          });
          if (!res.ok) {
            return {
              ok: false,
              error: (res.error as string | undefined) || "Бросок не удался",
            };
          }
          setOrderMsg((res.message as string) || "Бросок записан");
          return {
            ok: true,
            rolls: res.rolls as number[] | undefined,
            success: res.success as boolean | null | undefined,
            message: res.message as string | undefined,
          };
        },
        onGiveNpcTask: async (npcId, opts) => {
          await submitPlayerIntent(
            "intent.give_npc_task",
            {
              npcId,
              taskLabel: opts.taskLabel,
              etaTurn: opts.etaTurn,
              linkedQuestId: opts.linkedQuestId,
            },
            "Поручение для двора принято",
          );
        },
        onSendChat: async (questId, text) => {
          setOrderMsg(`Квест ${questId}: ход отправлен агенту`);
          void text;
        },
      }}
    />
  );

  const codexPanel = <CodexPanel payload={payload} />;

  const forcesPanel = (
    <ForcesDeck
      payload={payload}
      selectedFleetId={selectedFleetId}
      selectedLegionId={selectedLegionId}
      onSelectFleet={(id) => {
        setSelectedFleetId(id);
        setSelectedLegionId(null);
        const fleet = payload.world.fleets.find((f) => f.id === id);
        if (fleet) setSelectedSystemId(fleet.systemId);
        setOrderMsg(`Флот выбран: ${fleet?.name ?? id}`);
      }}
      onSelectLegion={(id) => {
        setSelectedLegionId(id);
        setSelectedFleetId(null);
        const leg = payload.world.legions.find((l) => l.id === id);
        if (leg) setSelectedSystemId(leg.systemId);
        setOrderMsg(`Легион выбран: ${leg?.name ?? id}`);
      }}
      onFocusOnMap={(systemId) => {
        setSelectedSystemId(systemId);
        goView("map");
        window.setTimeout(
          () => mapApiRef.current?.focusSystem(systemId),
          80,
        );
      }}
      onOrderWithFleet={(id) => {
        setSelectedFleetId(id);
        setSelectedLegionId(null);
        setOrderType("move_fleet");
        const fleet = payload.world.fleets.find((f) => f.id === id);
        if (fleet) {
          setSelectedSystemId(fleet.systemId);
          goView("map");
          window.setTimeout(() => {
            mapApiRef.current?.focusSystem(fleet.systemId);
            openFleetOrderRing({
              screenX: window.innerWidth / 2,
              screenY: window.innerHeight / 2,
              worldX: 0,
              worldY: 0,
              systemId: fleet.systemId,
              fleetId: fleet.id,
              legionId: null,
              linkId: null,
              fromFleetHit: true,
            });
          }, 100);
        } else {
          setQueueOpen(true);
          goView("map");
        }
      }}
      onOrderWithLegion={(id) => {
        setSelectedLegionId(id);
        setSelectedFleetId(null);
        setOrderType("move_legion");
        const leg = payload.world.legions.find((l) => l.id === id);
        if (leg) setSelectedSystemId(leg.systemId);
        setQueueOpen(true);
        goView("map");
      }}
      onFleetComposition={(fleetId, composition) => {
        setPayload((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            world: {
              ...prev.world,
              fleets: prev.world.fleets.map((f) =>
                f.id === fleetId ? { ...f, composition } : f,
              ),
            },
          };
        });
      }}
      onLegionComposition={(legionId, composition) => {
        setPayload((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            world: {
              ...prev.world,
              legions: prev.world.legions.map((l) =>
                l.id === legionId ? { ...l, composition } : l,
              ),
            },
          };
        });
      }}
      onStocksPatch={(patch) => {
        setPayload((prev) => {
          if (!prev?.economy) return prev;
          return {
            ...prev,
            economy: {
              ...prev.economy,
              stocks: {
                ...prev.economy.stocks,
                ...patch,
              },
            },
          };
        });
      }}
      onToast={(msg) => setOrderMsg(msg)}
      highlightDefIds={forcesHighlightDefIds}
    />
  );

  const ordersPanel = (
    <PlayerOrdersPanel
      payload={payload}
      orderType={orderType}
      setOrderType={(t) => setOrderType(t as OrderType)}
      orderNote={orderNote}
      setOrderNote={setOrderNote}
      orderMsg={orderMsg}
      selectedFleetId={selectedFleetId}
      setSelectedFleetId={setSelectedFleetId}
      selectedFleetName={selectedFleet?.name ?? null}
      selectedLegionId={selectedLegionId}
      setSelectedLegionId={setSelectedLegionId}
      selectedLegionName={selectedLegion?.name ?? null}
      targetSystemId={targetSystemId}
      setTargetSystemId={setTargetSystemId}
      onSubmit={() => void submitOrder()}
      onCancelOrder={(id) => void cancelOrder(id)}
      onPickTargetOnMap={() => {
        setPickingTarget(true);
        setOrderMsg("Кликните систему на карте — цель приказа");
        goView("map");
      }}
      onOpenMap={() => goView("map")}
    />
  );

  const roomPanel =
    viewMode === "forces"
      ? forcesPanel
      : viewMode === "research"
        ? researchPanel
        : viewMode === "market"
          ? marketPanel
          : viewMode === "diplomacy"
            ? diplomacyPanel
            : viewMode === "quests"
              ? questsPanel
              : viewMode === "codex"
                ? codexPanel
                : viewMode === "hq"
                  ? hqPanel
                  : null;

  const roomTitle =
    viewMode === "forces"
      ? "Силы"
      : viewMode === "research"
        ? "Наука"
        : viewMode === "market"
          ? "Биржа"
          : viewMode === "diplomacy"
            ? "Дипломатия"
            : viewMode === "quests"
              ? "Квесты"
              : viewMode === "codex"
                ? "Справочник"
                : "Штаб";

  const workbenchSubtitle =
    viewMode === "diplomacy"
      ? "Сделка: вы ↔ условия ↔ партнёр. Входящие отсвечиваются сразу."
      : viewMode === "market"
        ? "Стакан · динамика цен · заявки."
        : viewMode === "research"
          ? "Колесо A–F · ветви 1–6 · drag/zoom."
          : viewMode === "forces"
            ? "Флоты, легионы и каталог юнитов со статами."
            : viewMode === "quests"
              ? "Сюжет · сайды · фракции · ежеходные. СКМ — перевернуть карту."
              : viewMode === "codex"
                ? "Расы · государства · постройки · юниты · технологии — по уровню знания."
                : undefined;

  const factionCss = {
    ["--faction" as string]: faction?.color ?? "#c9a227",
    ["--faction-fill" as string]:
      faction?.fillColor ?? faction?.color ?? "#c9a227",
  };

  return (
    <div
      className={`viewer-shell ${mobile ? "viewer-shell--mobile" : "viewer-shell--desktop"}`}
      style={factionCss}
    >
      {faction?.emblemPath && (
        <div
          className="viewer-faction-wash"
          aria-hidden
          style={{ backgroundImage: `url(${faction.emblemPath})` }}
        />
      )}
      <header className="viewer-topbar viewer-topbar--empire">
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Меню"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={18} strokeWidth={2} aria-hidden />
        </button>
        <div className="viewer-topbar-title">
          <span
            className="swatch"
            style={{ background: faction?.color ?? "#888" }}
          />
          <div>
            <strong>{faction?.name ?? "Игрок"}</strong>
            <span className="hint">
              ход {payload.world.meta.turn} · видно{" "}
              {payload.visibleSystemIds.length}
            </span>
          </div>
        </div>
        {mobile ? (
          <span className="viewer-ap-pill" title="Занято AP / лимит на ход">
            AP {reservedAp}/{apMax}
          </span>
        ) : (
          <EmpireResourceStrip
            economy={payload.economy}
            flowData={flowData}
            world={payload.world}
            factionId={payload.factionId}
            reservedAp={reservedAp}
            apMax={apMax}
            fleetCount={(payload.world.fleets ?? []).filter(
              (f) => f.factionId === payload.factionId,
            ).length}
            legionCount={(payload.world.legions ?? []).filter(
              (l) => l.factionId === payload.factionId,
            ).length}
            mapResources={mapResourcesCatalog}
            onOpenForces={() => goView("forces")}
          />
        )}
        <div className="viewer-topbar-actions" style={{ position: "relative" }}>
          <button
            type="button"
            className={`viewer-icon-btn viewer-queue-btn ${queueOpen ? "active" : ""}`}
            aria-label="Очередь приказов"
            title="Очередь · Q"
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(false);
              setQueueOpen((v) => !v);
            }}
          >
            <ScrollText size={18} strokeWidth={2} aria-hidden />
            {pendingCount > 0 && (
              <span className="dock-badge">{pendingCount}</span>
            )}
          </button>
          {queueOpen && (
            <div className="viewer-queue-popover" role="dialog" aria-label="Очередь">
              <div className="viewer-queue-popover-body">{ordersPanel}</div>
            </div>
          )}
        </div>
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Настройки карты"
          title="Настройки"
          onClick={() => {
            setMenuOpen(false);
            setQueueOpen(false);
            setSettingsOpen(true);
          }}
        >
          <Settings size={18} strokeWidth={2} aria-hidden />
        </button>
        {showMapLayer && (
          <button
            type="button"
            className="viewer-icon-btn"
            aria-label="Инфо"
            disabled={!selectedSystem && !selectedFleet && !selectedLegion}
            onClick={() => setSheetOpen(true)}
          >
            <Info size={18} strokeWidth={2} aria-hidden />
          </button>
        )}
      </header>

      <main className={showMapLayer ? "viewer-map" : "viewer-hq"}>
        {showMapLayer ? (
          <Suspense
            fallback={
              <div className="viewer-map-loading">
                <div className="viewer-map-loading-pulse" aria-hidden />
                <p>Загрузка карты…</p>
                <p className="hint">Подготовка театра</p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => goView("hq")}
                >
                  В штаб
                </button>
              </div>
            }
          >
            <MapCanvas
              key={`viewer-map-${perfMode}`}
              mode="viewer"
              apiRef={mapApiRef}
              readModel={readModel}
              onModelSubscribe={subscribe}
              interactive={!systemFocusId}
              hostClassName={systemFocusId ? "viewer-map--inert" : undefined}
              playerFactionId={payload.factionId}
              onUnitDrop={(drop) => {
                setTouchMoveArmed(false);
                onUnitDrop(drop);
              }}
              onUnitDragStart={(kind, unitId) => {
                if (kind === "fleet") {
                  setSelectedFleetId(unitId);
                  setSelectedLegionId(null);
                  const fleet = payload.world.fleets.find((f) => f.id === unitId);
                  if (fleet) setSelectedSystemId(fleet.systemId);
                } else {
                  setSelectedLegionId(unitId);
                  setSelectedFleetId(null);
                  const leg = payload.world.legions.find((l) => l.id === unitId);
                  if (leg) setSelectedSystemId(leg.systemId);
                }
                setSheetOpen(false);
                setTouchMoveArmed(false);
                bump();
              }}
              onViewerContextMenu={(pick) => {
                if (openFleetOrderRing(pick)) return;
                setViewerCtx(pick);
                setSheetOpen(false);
                setTouchMoveArmed(false);
                if (pick.fleetId) {
                  setSelectedFleetId(pick.fleetId);
                  setSelectedLegionId(null);
                } else if (pick.legionId) {
                  setSelectedLegionId(pick.legionId);
                  setSelectedFleetId(null);
                }
                if (pick.systemId) setSelectedSystemId(pick.systemId);
              }}
              onSystemHold={(systemId, screenX, screenY) =>
                openFleetOrderRing({
                  screenX,
                  screenY,
                  worldX: 0,
                  worldY: 0,
                  systemId,
                  fleetId: selectedFleetId,
                  legionId: null,
                  linkId: null,
                })
              }
              onHoldProgress={(pick) => {
                setHoldProgress(pick);
              }}
              onSystemOpen={(id) => {
                setSelectedSystemId(id);
                setSheetOpen(false);
                setTouchMoveArmed(false);
                openPlayerSystem(id);
              }}
              onSystemClick={(id) => {
                if (id) {
                  setTargetSystemId(id);
                  if (pickingTarget) {
                    setSelectedSystemId(id);
                    setPickingTarget(false);
                    setOrderMsg(
                      `Цель: ${
                        payload.world.systems.find((s) => s.id === id)?.name ??
                        id
                      }`,
                    );
                    setQueueOpen(true);
                    bump();
                    return;
                  }
                  if (touchMoveArmed) {
                    const kind = selectedLegionId ? "legion" : "fleet";
                    const unitId = selectedLegionId ?? selectedFleetId;
                    const unit =
                      kind === "legion"
                        ? payload.world.legions.find((l) => l.id === unitId)
                        : payload.world.fleets.find((f) => f.id === unitId);
                    if (
                      unitId &&
                      unit &&
                      unit.factionId === payload.factionId &&
                      unit.systemId !== id
                    ) {
                      const hops = hopDistance(
                        payload.world,
                        unit.systemId,
                        id,
                      );
                      setTouchMoveArmed(false);
                      if (Number.isFinite(hops) && hops > 0) {
                        void submitMoveOrder(kind, unitId, id, hops);
                      } else {
                        setOrderMsg("Нет пути до этой системы");
                      }
                      bump();
                      return;
                    }
                    setTouchMoveArmed(false);
                  }
                }
                setSelectedSystemId(id);
                bump();
              }}
              onFleetClick={(id) => {
                setSelectedFleetId(id);
                setSelectedLegionId(null);
                const fleet = payload.world.fleets.find((f) => f.id === id);
                if (fleet) setSelectedSystemId(fleet.systemId);
                setTouchMoveArmed(false);
                bump();
              }}
              onLegionClick={(id) => {
                setSelectedLegionId(id);
                setSelectedFleetId(null);
                const leg = payload.world.legions.find((l) => l.id === id);
                if (leg) setSelectedSystemId(leg.systemId);
                setTouchMoveArmed(false);
                bump();
              }}
            />
            <TurnStampHud
              turn={payload.world.meta.turn}
              name={payload.world.meta.name}
              enabled={graphics.turnStamp}
            />
            <ViewerAlertFab items={viewerAlertItems} unreadRp={rpUnread} />
            {economyPopover ? (
              <EconomySignalPopover
                open
                anchor={economyPopover}
                onClose={() => setEconomyPopover(null)}
                signals={economySystemSignals}
                onFocusSystem={(systemId) => {
                  const sig = economySystemSignals.find(
                    (s) => s.systemId === systemId,
                  );
                  if (sig?.category) setEcoHighlightCategory(sig.category);
                  mapApiRef.current?.focusSystem(systemId);
                  setSelectedSystemId(systemId);
                  openPlayerSystem(systemId);
                  bump();
                }}
                onOpenHq={() => {
                  setEconomyPopover(null);
                  setViewMode("hq");
                  writeStoredStart("hq");
                }}
              />
            ) : null}
            <div
              className="map-layer-strip map-mode-strip"
              role="toolbar"
              aria-label="Режимы карты"
            >
              {MAP_MODE_PRESETS.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  className={`layer-chip map-mode-chip ${activeMapMode === mode.id ? "on" : ""}`}
                  aria-pressed={activeMapMode === mode.id}
                  title={`${mode.hint} · ${mode.hotkey}`}
                  onClick={() => applyPreset(mode.id)}
                >
                  <span>{mode.label}</span>
                  <kbd className="map-mode-kbd">{mode.hotkey}</kbd>
                </button>
              ))}
            </div>
            <ViewerContextMenu
              menu={viewerCtx}
              payload={payload}
              onClose={() => setViewerCtx(null)}
              onSelectFleet={(id) => {
                setSelectedFleetId(id);
                setSelectedLegionId(null);
                const f = payload.world.fleets.find((x) => x.id === id);
                if (f) setSelectedSystemId(f.systemId);
              }}
              onSelectLegion={(id) => {
                setSelectedLegionId(id);
                setSelectedFleetId(null);
                const l = payload.world.legions.find((x) => x.id === id);
                if (l) setSelectedSystemId(l.systemId);
              }}
              onSelectSystem={(id) => {
                setSelectedSystemId(id);
                setTargetSystemId(id);
              }}
              onOpenSystem={(id) => {
                setSelectedSystemId(id);
                openPlayerSystem(id);
              }}
              onMoveUnit={(kind, unitId, toSystemId, hops) => {
                void submitMoveOrder(kind, unitId, toSystemId, hops);
              }}
              onOrderType={(kind, opts) => {
                if (kind === "attack_system" && opts.fleetId && opts.systemId) {
                  submitDirectAttack(opts.fleetId, opts.systemId);
                  return;
                }
                if (kind === "claim_system" && opts.systemId) {
                  submitDirectClaim(opts.systemId, opts.fleetId);
                  return;
                }
                setOrderType(kind);
                if (opts.fleetId) {
                  setSelectedFleetId(opts.fleetId);
                  setSelectedLegionId(null);
                }
                if (opts.systemId) {
                  setSelectedSystemId(opts.systemId);
                  setTargetSystemId(opts.systemId);
                }
                setQueueOpen(true);
              }}
              onOpenOrders={() => setQueueOpen(true)}
              onOpenRp={() => goView("rp")}
              onScoutReveal={(systemId) => {
                void submitScoutReveal(systemId);
              }}
              scoutApCost={intentApCost("intent.scout_reveal") || 1}
              reservedAp={reservedAp}
              apMax={apMax}
            />
            {holdProgress && (
              <HoldRing
                x={holdProgress.x}
                y={holdProgress.y}
                progress={holdProgress.progress}
              />
            )}
            {payload && (
              <FleetOrderRing
                ring={orderRing}
                payload={payload}
                reservedAp={reservedAp}
                apMax={apMax}
                scoutApCost={intentApCost("intent.scout_reveal") || 1}
                onClose={() => setOrderRing(null)}
                onMove={(fleetId, toSystemId, hops) => {
                  setOrderRing(null);
                  void submitUnitOrder(
                    "fleet",
                    fleetId,
                    toSystemId,
                    hops,
                    "move_fleet",
                  );
                }}
                onAttack={(fleetId, toSystemId) => {
                  setOrderRing(null);
                  submitDirectAttack(fleetId, toSystemId);
                }}
                onBlockade={(fleetId, toSystemId, hops) => {
                  setOrderRing(null);
                  submitDirectBlockade(fleetId, toSystemId, hops);
                }}
                onFortify={(fleetId, systemId) => {
                  setOrderRing(null);
                  setSelectedFleetId(fleetId);
                  setSelectedSystemId(systemId);
                  setOrderType("fortify");
                  void submitUnitOrder(
                    "fleet",
                    fleetId,
                    systemId,
                    0,
                    "fortify",
                  );
                }}
                onCancelRoute={(fleetId) => {
                  setOrderRing(null);
                  void cancelFleetRoute(fleetId);
                }}
                onOpenSystem={(systemId) => {
                  setOrderRing(null);
                  openPlayerSystem(systemId);
                }}
                onClearStance={(fleetId) => {
                  setOrderRing(null);
                  clearFleetStance(fleetId);
                }}
                onScout={(systemId) => {
                  setOrderRing(null);
                  void submitScoutReveal(systemId);
                }}
                onClaim={(systemId, fleetId) => {
                  setOrderRing(null);
                  submitDirectClaim(systemId, fleetId);
                }}
              />
            )}
            {pickingTarget && (
              <div className="viewer-toast viewer-toast--pick" role="status">
                Укажите систему-цель · Esc — отмена
              </div>
            )}
            {touchMoveArmed && (
              <div className="viewer-toast viewer-toast--pick" role="status">
                Коснитесь системы-цели · или тяните юнит пальцем
              </div>
            )}
            {mobile &&
              viewMode === "map" &&
              (selectedFleet || selectedLegion) &&
              (selectedFleet?.factionId === payload.factionId ||
                selectedLegion?.factionId === payload.factionId) && (
                <div className="viewer-touch-bar" role="toolbar">
                  <div className="viewer-touch-bar-main">
                    <strong>
                      {selectedFleet?.name ?? selectedLegion?.name}
                    </strong>
                    <span className="hint">
                      Тяните на систему или «Ход»
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`btn ${touchMoveArmed ? "primary" : "ghost"}`}
                    onClick={() => {
                      setTouchMoveArmed((v) => !v);
                      setSheetOpen(false);
                      setViewerCtx(null);
                    }}
                  >
                    Ход
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={!selectedSystemId}
                    onClick={() => {
                      if (!selectedSystemId) return;
                      setTouchMoveArmed(false);
                      openPlayerSystem(selectedSystemId);
                    }}
                  >
                    Внутрь
                  </button>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => {
                      setTouchMoveArmed(false);
                      setSelectedFleetId(null);
                      setSelectedLegionId(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            <div className="viewer-zoom" aria-label="Масштаб">
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Приблизить"
                onClick={() => mapApiRef.current?.zoomBy(1.25)}
              >
                <ZoomIn size={20} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Отдалить"
                onClick={() => mapApiRef.current?.zoomBy(0.8)}
              >
                <ZoomOut size={20} strokeWidth={2} aria-hidden />
              </button>
              <button
                type="button"
                className="viewer-zoom-btn"
                aria-label="Сбросить вид"
                onClick={() => mapApiRef.current?.resetView()}
              >
                <Home size={18} strokeWidth={2} aria-hidden />
              </button>
            </div>
            {orderMsg && viewMode === "map" && (
              <div className="viewer-toast" role="status">
                {orderMsg}
              </div>
            )}
            {boardRefreshToast && viewMode === "map" && (
              <div className="viewer-status-slot">
                <StatusStrip
                  message={boardRefreshToast}
                  onDismiss={() => setBoardRefreshToast(null)}
                />
              </div>
            )}
            {desktopGlass && roomPanel && (
              <aside className="viewer-glass-panel" aria-label="Панель державы">
                <div className="viewer-glass-panel-head">
                  <strong>{roomTitle}</strong>
                  <button
                    type="button"
                    className="btn ghost viewer-glass-close"
                    aria-label="Закрыть панель"
                    onClick={() => goView("map")}
                  >
                    Закрыть
                  </button>
                </div>
                <div className="viewer-glass-panel-body">{roomPanel}</div>
              </aside>
            )}
            {diploIncoming.length > 0 && viewMode === "map" && !desktopWorkbench && (
              <div className="viewer-diplo-banner" role="status">
                <span>
                  Входящих дипломатических предложений:{" "}
                  <strong>{diploIncoming.length}</strong>
                </span>
                <button
                  type="button"
                  className="btn sm primary"
                  onClick={() => {
                    setFocusDiploOfferId(diploIncoming[0]?.id ?? null);
                    goView("diplomacy");
                  }}
                >
                  Открыть
                </button>
              </div>
            )}
          </Suspense>
        ) : null}
      </main>

      <WorkbenchShell
        open={Boolean(desktopWorkbench && roomPanel)}
        title={roomTitle}
        subtitle={workbenchSubtitle}
        wide={
          viewMode === "diplomacy" ||
          viewMode === "forces" ||
          viewMode === "market" ||
          viewMode === "research" ||
          viewMode === "quests" ||
          viewMode === "codex"
        }
        badge={
          viewMode === "diplomacy" && diploIncoming.length > 0 ? (
            <span className="workbench-badge">{diploIncoming.length}</span>
          ) : undefined
        }
        onClose={() => goView("map")}
      >
        {roomPanel}
      </WorkbenchShell>

      {payload && (
        <EconomyPanel
          open={viewMode === "economy"}
          payload={payload}
          flowData={flowData}
          factionName={faction?.name}
          linkedSystemId={economyLinkedSystemId}
          priorityBusy={flowPriorityBusy}
          onClose={() => {
            setEconomyLinkedSystemId(null);
            goView("map");
          }}
          onOpenSystem={(systemId) => {
            setEconomyLinkedSystemId(systemId);
            openPlayerSystem(systemId);
          }}
          onFocusDeficit={(letter, systemId) => {
            setEcoHighlightCategory(letter);
            if (systemId) {
              setEconomyLinkedSystemId(systemId);
              openPlayerSystem(systemId);
              return;
            }
            const sig = economySystemSignals.find(
              (s) => s.category === letter && s.systemId,
            );
            if (sig?.systemId) {
              setEconomyLinkedSystemId(sig.systemId);
              openPlayerSystem(sig.systemId);
            } else {
              goView("map");
            }
          }}
          onFocusSystemOnMap={(systemId) => {
            setEconomyLinkedSystemId(null);
            setSelectedSystemId(systemId);
            goView("map");
            window.setTimeout(
              () => mapApiRef.current?.focusSystem(systemId),
              80,
            );
          }}
          onSetFlowPriority={(opts) => void setFlowPriority(opts)}
          onSetTax={(slot, tier) => void setTax(slot, tier)}
          onSetDoctrine={(id) => void setEconomicPolicy(id)}
          onReserveStock={(id, amount, label) =>
            void reserveStock(id, amount, label)
          }
          onSellFromStock={(currencyId) => {
            setMarketPrefillCurrency(currencyId);
            setMarketTab("trade");
            goView("market");
          }}
          onCaravanHint={(currencyId, systemId) => {
            if (systemId) {
              setEconomyLinkedSystemId(systemId);
              openPlayerSystem(systemId);
              setOrderMsg(
                `Караван: ${currencyId.replace(/^currency\./, "")} → система (заказ на карте)`,
              );
              return;
            }
            setOrderMsg("Караваны — укажите систему drop-зоной или приказом на карте.");
            goView("map");
          }}
          onStockAlert={(currencyId) => {
            setOrderMsg(
              `Алерт: следите за ${currencyId.replace(/^currency\./, "")}`,
            );
          }}
          stockBusy={stockBusy}
          policyBusy={policyBusy}
          focusProductionCategory={economyFocusCategory}
          onOpenResearch={() => {
            goView("research");
            setOrderMsg("Наука — нарастите cognitio / изучите добычу F");
          }}
          onFocusBuild={() => {
            const owned = payload.world.systems.find(
              (s) => s.ownerFactionId === payload.factionId,
            );
            goView("map");
            if (owned) {
              setSelectedSystemId(owned.id);
              window.setTimeout(
                () => mapApiRef.current?.focusSystem(owned.id),
                80,
              );
            }
          }}
        />
      )}

      <BottomSheet
        open={Boolean(mobileRoom && roomPanel)}
        onOpenChange={(open) => {
          if (!open) goView("map");
        }}
        title={roomTitle}
        className="viewer-sheet--room"
        maxHeightVh={viewMode === "diplomacy" || viewMode === "forces" ? 94 : 88}
      >
        {roomPanel}
      </BottomSheet>

      {(menuOpen || settingsOpen) && (
        <button
          type="button"
          className="viewer-backdrop"
          aria-label="Закрыть"
          onClick={() => {
            setMenuOpen(false);
            setSettingsOpen(false);
          }}
        />
      )}

      <aside className={`viewer-drawer ${settingsOpen ? "open" : ""}`}>
        <div className="viewer-drawer-head">
          <h2>Настройки карты</h2>
          <button
            type="button"
            className="viewer-icon-btn"
            onClick={() => setSettingsOpen(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <section>
          <h3>Производительность</h3>
          <p className="hint">
            Суперлайт / Лайт — легче. Качество — красиво на телефоне без
            перерисовки каждый кадр. Максимум — полный FX (ПК). Cinematic —
            доп. polish, только на ПК (тяжелее).
          </p>
          <div className="viewer-perf-row">
            {PERF_OPTIONS.filter((opt) => !(mobile && opt.desktopOnly)).map(
              (opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`btn ghost ${perfMode === opt.id ? "active" : ""}`}
                  title={opt.hint}
                  onClick={() => {
                    applyPerfMode(opt.id, true);
                  }}
                >
                  {opt.label}
                </button>
              ),
            )}
          </div>
          <p className="hint">
            Смена режима подставляет пресет слоёв и графики — ниже можно
            донастроить вручную.
          </p>
        </section>

        <section>
          <h3>Графика</h3>
          <p className="hint">
            Влияет на FPS. «Перерисовка при зуме» лучше оставить выкл.
            Cinematic — доп. polish (звёзды, тени, пульс); тяжелее, для ПК.
          </p>
          <div className="layer-chip-grid">
            {GRAPHICS_TOGGLES.filter(
              (t) => !(mobile && t.key === "cinematic"),
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                className={`layer-chip ${graphics[t.key] ? "on" : ""}`}
                aria-pressed={graphics[t.key]}
                title={t.hint}
                onClick={() => toggleGraphic(t.key)}
              >
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3>Что показывать</h3>
          <p className="hint">
            F5–F9 — режимы на карте. Ниже — точечные слои и доп. пресеты.
          </p>
          <div className="layer-preset-row">
            {MAP_MODE_PRESETS.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`btn ghost ${activeMapMode === mode.id ? "active" : ""}`}
                title={`${mode.hint} · ${mode.hotkey}`}
                onClick={() => applyPreset(mode.id)}
              >
                {mode.label}
                <kbd className="map-mode-kbd">{mode.hotkey}</kbd>
              </button>
            ))}
          </div>
          <div className="layer-preset-row">
            {LAYER_PRESET_BUTTONS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="btn ghost"
                title={p.hint}
                onClick={() => applyPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="layer-chip-grid">
            {VIEWER_LAYER_CHIPS.map((chip) => {
              const Icon = LAYER_LUCIDE[chip.icon];
              return (
                <button
                  key={chip.key}
                  type="button"
                  className={`layer-chip ${layers[chip.key] ? "on" : ""}`}
                  aria-pressed={layers[chip.key]}
                  onClick={() => toggleLayer(chip.key)}
                >
                  <Icon size={13} strokeWidth={2.25} aria-hidden />
                  <span>{chip.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`layer-chip ${layers.showFactionLabels ? "on" : ""}`}
              aria-pressed={layers.showFactionLabels}
              onClick={() => toggleLayer("showFactionLabels")}
            >
              <Flag size={13} strokeWidth={2.25} aria-hidden />
              <span>Имена держав</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showSectors ? "on" : ""}`}
              aria-pressed={layers.showSectors}
              onClick={() => toggleLayer("showSectors")}
            >
              <Landmark size={13} strokeWidth={2.25} aria-hidden />
              <span>Секторы</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showTraffic ? "on" : ""}`}
              aria-pressed={layers.showTraffic}
              onClick={() => toggleLayer("showTraffic")}
            >
              <Layers size={13} strokeWidth={2.25} aria-hidden />
              <span>Трафик</span>
            </button>
            <button
              type="button"
              className={`layer-chip ${layers.showCaravans ? "on" : ""}`}
              aria-pressed={layers.showCaravans}
              onClick={() => toggleLayer("showCaravans")}
            >
              <Layers size={13} strokeWidth={2.25} aria-hidden />
              <span>Караваны</span>
            </button>
          </div>
        </section>
      </aside>

      <aside className={`viewer-drawer ${menuOpen ? "open" : ""}`}>
        <div className="viewer-drawer-head">
          <h2>Меню</h2>
          <button
            type="button"
            className="viewer-icon-btn"
            onClick={() => setMenuOpen(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <section>
          <h3>Легенда</h3>
          <ul className="viewer-legend">
            <li>
              <span className="leg-icon">
                <Swords size={14} strokeWidth={2} aria-hidden />
              </span>
              бой (красный) · приоритетный сигнал
            </li>
            <li>
              <span className="leg-icon coin">
                <Coins size={14} strokeWidth={2} aria-hidden />
              </span>
              добыча · одна иконка ×N ресурсов (близкий зум)
            </li>
            <li>
              <span className="leg-ship" /> флот (форма = тип)
            </li>
            <li>
              <span className="leg-shield" /> сигналы: блокада → квест → экономика → POI
            </li>
            <li>
              <span className="leg-icon">+N</span> стек сигналов · чип «Веер» — дуга иконок
            </li>
          </ul>
          {syncHint && <p className="hint ok-hint">{syncHint}</p>}
          <p className="hint">Карта подтягивается сама после сохранения мастера.</p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              setSettingsOpen(true);
            }}
          >
            Открыть настройки карты
          </button>
        </section>

        <section>
          <h3>Вы</h3>
          <p className="meta-line">
            <span
              className="swatch"
              style={{ background: faction?.color, display: "inline-block" }}
            />{" "}
            {faction?.name}
            <br />
            Ход {payload.world.meta.turn} · видно систем:{" "}
            {payload.visibleSystemIds.length}
            <br />
            AP: {reservedAp}/{apMax} (занято / лимит)
          </p>
          {payload.economy && (
            <div className="viewer-eco-chrome">
              <div className="eco-cat-grid eco-cat-grid--chrome" aria-label="Казна A–F">
                {CATEGORY_CURRENCIES.map((c) => (
                  <span
                    key={c.id}
                    className="eco-cat-cell"
                    style={{ borderLeftColor: c.cssVar }}
                    title={c.name}
                  >
                    <span className="eco-cat-letter" style={{ color: c.cssVar }}>
                      {c.short}
                    </span>
                    <strong className="eco-cat-stock">
                      {payload.economy?.stocks?.[c.id] ?? 0}
                    </strong>
                  </span>
                ))}
              </div>
              <p className="hint">
                M{payload.economy.stocks?.["currency.metal"] ?? "—"} · S
                {payload.economy.stocks?.["currency.supply"] ?? "—"}
                <br />
                Дефицит: {payload.economy.deficit ?? "ok"} · давление:{" "}
                {payload.economy.pressure ?? 0}
                {payload.economy.bottlenecks &&
                Object.keys(payload.economy.bottlenecks).length > 0
                  ? ` · узких мест: ${Object.keys(payload.economy.bottlenecks).length}`
                  : ""}
              </p>
            </div>
          )}
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setPayload(null);
              setPassword("");
              setMenuOpen(false);
            }}
          >
            Выйти
          </button>
        </section>

        <section>
          <h3>Держава</h3>
          <p className="hint">
            Карта — театр. Двойной клик / ПКМ «Провалиться» — система и планеты.
            Флот/легион — перетаскивание. Штаб / наука / рынок / очередь —
            нижний док. Сцена только с мастером.
          </p>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("hq");
            }}
          >
            Открыть штаб
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("research");
            }}
          >
            Наука
            {affordableResearch > 0 ? ` · ${affordableResearch} доступно` : ""}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("economy");
            }}
          >
            Экономика
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("market");
            }}
          >
            Биржа
            {tradePartnerCount > 0 ? ` · ${tradePartnerCount} партнёров` : ""}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              setQueueOpen(true);
            }}
          >
            Очередь{pendingCount > 0 ? ` · ${pendingCount}` : ""}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("diplomacy");
            }}
          >
            Дипломатия{warCount > 0 ? ` · ${warCount} войн` : ""}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("quests");
            }}
          >
            Квесты
            {activeQuestCount > 0 ? ` · ${activeQuestCount} активных` : ""}
          </button>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => {
              setMenuOpen(false);
              goView("rp");
            }}
          >
            Сцена с мастером
          </button>
        </section>

        <section>
          <h3>Сражения</h3>
          <p className="hint">
            Активные столкновения — выберите позу до тика. История — после
            resolve.
          </p>
          <PlayerEngagementPanel
            payload={payload}
            engagements={engagements}
            busy={stanceBusy}
            msg={orderMsg}
            onSubmitStance={(engId, stance) =>
              void submitCombatStance(engId, stance)
            }
            onOpenStanceRing={(engId, anchor) => openStanceRing(engId, anchor)}
            onRequestCardBattle={(engId) =>
              void submitRequestCardBattle(engId)
            }
            onOpenCardBattle={(engId) => {
              setCardBattleMinimized(false);
              setCardBattleId(engId);
            }}
          />
        </section>
      </aside>

      {sheetOpen && (selectedSystem || selectedFleet || selectedLegion) && (
        <button
          type="button"
          className="viewer-backdrop sheet"
          aria-label="Закрыть инфо"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <aside
        className={`viewer-sheet ${sheetOpen && (selectedSystem || selectedFleet || selectedLegion) ? "open" : ""}`}
      >
        <div className="viewer-sheet-grab">
          <p className="viewer-sheet-kicker">Сводка системы</p>
          <button
            type="button"
            className="viewer-sheet-close"
            onClick={() => setSheetOpen(false)}
          >
            Закрыть
          </button>
        </div>
        <div className="viewer-sheet-body">
          {!selectedSystem && !selectedFleet && !selectedLegion && (
            <p className="hint">Выберите систему или юнит на карте</p>
          )}
          {selectedSystem && (
            <div>
              <h2 className="system-title">{selectedSystem.name}</h2>
              <p className="hint">
                {(() => {
                  const owner = payload.world.factions.find(
                    (f) => f.id === selectedSystem.ownerFactionId,
                  );
                  const kind =
                    selectedSystem.kind === "corridor" ||
                    selectedSystem.stars.length === 0
                      ? "Коридор"
                      : `${selectedSystem.stars.length}★ · ${selectedSystem.planets.length} планет`;
                  return `${kind}${owner ? ` · ${owner.name}` : " · нейтрал"}`;
                })()}
              </p>
              <button
                type="button"
                className="btn ghost block"
                style={{ marginBottom: 8 }}
                disabled={
                  reservedAp + (intentApCost("intent.scout_reveal") || 1) > apMax
                }
                onClick={() => void submitScoutReveal(selectedSystem.id)}
              >
                Разведка · открыть систему (
                {intentApCost("intent.scout_reveal") || 1} AP)
              </button>
              {selectedSystem.planets.length > 0 && (
                <p className="hint">
                  {(() => {
                    const inhab = selectedSystem.planets.filter(
                      (p) => p.population > 0,
                    ).length;
                    return `Колоний: ${inhab} · ресурсы: ${
                      selectedSystem.resources.length
                        ? selectedSystem.resources.slice(0, 4).join(", ")
                        : "—"
                    }`;
                  })()}
                </p>
              )}
              {(selectedSystem.stations?.length ?? 0) > 0 && (
                <p className="hint">
                  Станции:{" "}
                  {selectedSystem.stations!.map((st) => st.name).join(", ")}
                </p>
              )}
              {openEngagementCount > 0 &&
                engagements.some(
                  (e) =>
                    (e.status === "active" ||
                      e.status === "commit" ||
                      e.status === "contact") &&
                    e.systemId === selectedSystem.id,
                ) && (
                  <section className="hq-card" style={{ marginTop: 8 }}>
                    <h3>Столкновение</h3>
                    <PlayerEngagementPanel
                      payload={payload}
                      engagements={engagements}
                      busy={stanceBusy}
                      filterSystemId={selectedSystem.id}
                      showHistory={false}
                      onSubmitStance={(engId, stance) =>
                        void submitCombatStance(engId, stance)
                      }
                      onOpenStanceRing={(engId, anchor) =>
                        openStanceRing(engId, anchor)
                      }
                      onRequestCardBattle={(engId) =>
                        void submitRequestCardBattle(engId)
                      }
                      onOpenCardBattle={(engId) => {
                        setCardBattleMinimized(false);
                        setCardBattleId(engId);
                      }}
                    />
                  </section>
                )}
              {selectedSystem.planets
                .filter((p) => p.population > 0 || p.colonyType !== "none")
                .slice(0, 3)
                .map((p) => (
                  <div key={p.id} className="planet-card">
                    <strong>
                      {p.orbitIndex != null ? `◉${p.orbitIndex} ` : ""}
                      {p.name}
                    </strong>
                    <div className="hint">
                      {p.type}
                      {p.population > 0 ? ` · нас. ${p.population}` : ""}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {selectedFleet && (
            <div className="planet-card">
              <strong>{selectedFleet.name}</strong>
              <div className="hint">
                {selectedFleet.composition
                  .map((c) => `${c.type}×${c.count}`)
                  .join(", ")}
              </div>
              <div className="hint">Стойка: {selectedFleet.stance}</div>
              <p className="hint">
                {mobile
                  ? "Тяните пальцем на систему (ходы на превью). Долгое нажатие — меню. Либо «Ход» в нижней панели."
                  : "Перетащите на систему — расход ходов. ПКМ — атака и прочее."}
              </p>
            </div>
          )}
          {selectedLegion && (
            <div className="planet-card">
              <strong>{selectedLegion.name}</strong>
              <div className="hint">
                Сила {selectedLegion.strength} · {selectedLegion.status}
              </div>
              <p className="hint">
                {mobile
                  ? "Тяните пальцем на систему. Долгое нажатие — меню."
                  : "Перетащите на систему — расход ходов. ПКМ — марш."}
              </p>
            </div>
          )}
          <div className="viewer-sheet-orders">
            <p className="hint">
              {mobile
                ? "Действия — долгое нажатие на карте. Здесь сводка."
                : "Действия с объектами — ПКМ на карте. Здесь только сводка."}
            </p>
            {(selectedFleetId || selectedLegionId) && selectedSystemId && (
              <button
                type="button"
                className="btn primary block"
                onClick={() => {
                  setTargetSystemId(selectedSystemId);
                  setOrderType(
                    selectedLegionId ? "move_legion" : "move_fleet",
                  );
                  setSheetOpen(false);
                  setQueueOpen(true);
                }}
              >
                К приказам…
              </button>
            )}
            {selectedSystem &&
              selectedSystem.ownerFactionId !== payload.factionId && (
                <button
                  type="button"
                  className="btn ghost block"
                  onClick={() => {
                    setTargetSystemId(selectedSystem.id);
                    setOrderType("claim_system");
                    setSheetOpen(false);
                    setQueueOpen(true);
                  }}
                >
                  Захватить (в приказы)…
                </button>
              )}
          </div>
        </div>
      </aside>

      {mobile ? (
        <>
          {viewMode === "rp" && (
            <button
              type="button"
              className="viewer-backdrop sheet"
              aria-label="Закрыть сцену"
              onClick={() => goView("map")}
            />
          )}
          <aside
            className={`viewer-sheet tall ${viewMode === "rp" ? "open" : ""}`}
            aria-hidden={viewMode !== "rp"}
          >
            <div className="viewer-sheet-grab">
              <p className="viewer-sheet-kicker">Двор · хроника</p>
              <button
                type="button"
                className="viewer-sheet-close"
                onClick={() => goView("map")}
              >
                Закрыть
              </button>
            </div>
            <div className="viewer-sheet-body">
              {viewMode === "rp" && (
                <CourtPanel
                  payload={payload}
                  password={password}
                  layout="fill"
                  factionColor={faction?.color}
                  avatarUrl={faction?.avatarUrl}
                  onMsg={(m) => setOrderMsg(m)}
                  onGiveNpcTask={async (npcId, opts) => {
                    await submitPlayerIntent(
                      "intent.give_npc_task",
                      {
                        npcId,
                        taskLabel: opts.taskLabel,
                        etaTurn: opts.etaTurn,
                        linkedQuestId: opts.linkedQuestId,
                      },
                      `Поручение для двора принято`,
                    );
                  }}
                  onMessagesLoaded={(msgs) => {
                    const latest = msgs[msgs.length - 1];
                    if (latest?.at) {
                      writeRpSeenAt(payload.factionId, latest.at);
                    }
                    setRpUnread(0);
                  }}
                />
              )}
            </div>
          </aside>
        </>
      ) : (
        <FloatingRpWindow
          open={viewMode === "rp" || rpFloatOpen}
          onOpenChange={(o) => {
            setRpFloatOpen(o);
            if (o) {
              setViewMode("rp");
              setRpUnread(0);
            } else if (viewMode === "rp") {
              setViewMode("map");
            }
          }}
          unread={rpUnread}
          storageKey={`gmap-rp-float-geom-player-${payload.factionId}`}
          title="Двор · хроника"
        >
          <CourtPanel
            payload={payload}
            password={password}
            layout="fill"
            factionColor={faction?.color}
            avatarUrl={faction?.avatarUrl}
            onMsg={(m) => setOrderMsg(m)}
            onGiveNpcTask={async (npcId, opts) => {
              await submitPlayerIntent(
                "intent.give_npc_task",
                {
                  npcId,
                  taskLabel: opts.taskLabel,
                  etaTurn: opts.etaTurn,
                  linkedQuestId: opts.linkedQuestId,
                },
                `Поручение для двора принято`,
              );
            }}
            onMessagesLoaded={(msgs) => {
              const latest = msgs[msgs.length - 1];
              if (latest?.at) {
                writeRpSeenAt(payload.factionId, latest.at);
              }
              setRpUnread(0);
            }}
          />
        </FloatingRpWindow>
      )}

      {openQuest && (
        <ViewerQuestDossier
          quest={openQuest}
          world={payload.world}
          onClose={() => setOpenQuestId(null)}
          onFocusSystem={(systemId) => {
            setOpenQuestId(null);
            setSelectedSystemId(systemId);
            goView("map");
            window.setTimeout(
              () => mapApiRef.current?.focusSystem(systemId),
              80,
            );
          }}
          onResolveChoice={async (questId, choiceId) => {
            const res = await submitQuestAction("resolve_quest_choice", {
              questId,
              choiceId,
            });
            if (res.ok) setOrderMsg("Выбор по квесту применён");
            return res.ok;
          }}
          onResolveDice={async (questId, specIndex, choiceId) => {
            const res = await submitQuestAction("resolve_quest_dice", {
              questId,
              specIndex,
              choiceId,
            });
            if (!res.ok) return { ok: false };
            setOrderMsg((res.message as string) || "Бросок записан");
            return {
              ok: true,
              rolls: res.rolls as number[] | undefined,
              success: res.success as boolean | null | undefined,
              message: res.message as string | undefined,
            };
          }}
        />
      )}

      <nav
        className={`viewer-dock viewer-dock--float ${mobile ? "viewer-dock--mobile" : "viewer-dock--desktop"}`}
        aria-label="Навигация игрока"
      >
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "map" && !desktopGlass ? "active" : ""}`}
          onClick={() => goView("map")}
          title="Карта · 1"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <MapIcon size={18} strokeWidth={2} />
          </span>
          Карта
          <kbd className="viewer-dock-kbd">1</kbd>
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${
            viewMode === "hq" || (mobile && viewMode === "forces") ? "active" : ""
          }`}
          onClick={() => goView("hq")}
          title="Штаб · 2"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Landmark size={18} strokeWidth={2} />
          </span>
          Штаб
          <kbd className="viewer-dock-kbd">2</kbd>
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "research" ? "active" : ""}`}
          onClick={() => goView("research")}
          title="Наука · 3"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <FlaskConical size={18} strokeWidth={2} />
          </span>
          Наука
          <kbd className="viewer-dock-kbd">3</kbd>
          {affordableResearch > 0 && (
            <span className="dock-badge dock-badge--hot">
              {affordableResearch > 9 ? "9+" : affordableResearch}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "economy" ? "active" : ""}`}
          onClick={() => goView("economy")}
          title="Экономика"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Coins size={18} strokeWidth={2} />
          </span>
          Эконом
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "market" ? "active" : ""}`}
          onClick={() => goView("market")}
          title="Биржа · 4"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Store size={18} strokeWidth={2} />
          </span>
          Биржа
          <kbd className="viewer-dock-kbd">4</kbd>
          {tradePartnerCount > 0 && (
            <span className="dock-badge">
              {tradePartnerCount > 9 ? "9+" : tradePartnerCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "diplomacy" ? "active" : ""} ${diploIncoming.length > 0 ? "is-alert" : ""}`}
          onClick={() => goView("diplomacy")}
          title={mobile ? "Дипломатия · 5" : "Дипломатия · 5"}
        >
          <span className="viewer-dock-icon" aria-hidden>
            <Handshake size={18} strokeWidth={2} />
          </span>
          Дипло
          <kbd className="viewer-dock-kbd">5</kbd>
          {(warCount > 0 || diploIncoming.length > 0) && (
            <span
              className={`dock-badge ${diploIncoming.length > 0 ? "dock-badge--hot" : ""}`}
            >
              {diploIncoming.length > 0
                ? diploIncoming.length > 9
                  ? "9+"
                  : diploIncoming.length
                : warCount}
            </span>
          )}
        </button>
        {!mobile && (
          <>
            <button
              type="button"
              className={`viewer-dock-btn ${viewMode === "forces" ? "active" : ""}`}
              onClick={() => goView("forces")}
              title="Силы · 6"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <Flag size={18} strokeWidth={2} />
              </span>
              Силы
              <kbd className="viewer-dock-kbd">6</kbd>
            </button>
            <button
              type="button"
              className={`viewer-dock-btn ${viewMode === "quests" ? "active" : ""}`}
              onClick={() => goView("quests")}
              title="Квесты · 7"
            >
              <span className="viewer-dock-icon" aria-hidden>
                <BookMarked size={18} strokeWidth={2} />
              </span>
              Квесты
              <kbd className="viewer-dock-kbd">7</kbd>
              {activeQuestCount > 0 && (
                <span className="dock-badge">
                  {activeQuestCount > 9 ? "9+" : activeQuestCount}
                </span>
              )}
            </button>
          </>
        )}
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "rp" ? "active" : ""}`}
          onClick={() => {
            goView("rp");
            setRpUnread(0);
          }}
          title={mobile ? "Двор · 6" : "Двор · 8"}
        >
          <span className="viewer-dock-icon" aria-hidden>
            <MessageSquare size={18} strokeWidth={2} />
          </span>
          Двор
          <kbd className="viewer-dock-kbd">{mobile ? "6" : "8"}</kbd>
          {rpUnread > 0 && viewMode !== "rp" && (
            <span className="dock-badge dock-badge--hot">
              {rpUnread > 9 ? "9+" : rpUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "codex" ? "active" : ""}`}
          onClick={() => goView("codex")}
          title="Справочник"
        >
          <span className="viewer-dock-icon" aria-hidden>
            <BookOpen size={18} strokeWidth={2} />
          </span>
          Справ.
        </button>
      </nav>
      {eraBanner != null && (
        <div className="viewer-era-cinematic" role="status" aria-live="polite">
          <div className="viewer-era-cinematic-veil" aria-hidden />
          <div className="viewer-era-cinematic-card">
            <p className="viewer-era-cinematic-kicker">Новая эра</p>
            <strong>Эра {eraBanner}</strong>
            <p className="hint">Знание открыло следующий горизонт</p>
            <button
              type="button"
              className="btn sm ghost"
              onClick={() => setEraBanner(null)}
            >
              Продолжить
            </button>
          </div>
        </div>
      )}
      {stanceRing && payload && (() => {
        const eng = engagements.find((e) => e.id === stanceRing.engagementId);
        const mySide = eng?.sides.find(
          (s) => s.factionId === payload.factionId,
        );
        return (
          <EngagementStanceRing
            open
            x={stanceRing.x}
            y={stanceRing.y}
            engagementId={stanceRing.engagementId}
            currentStance={mySide?.stance}
            locked={!!mySide?.locked}
            busy={stanceBusy}
            onClose={() => setStanceRing(null)}
            onPickStance={(stance) => {
              void submitCombatStance(stanceRing.engagementId, stance);
              setStanceRing(null);
            }}
          />
        );
      })()}
      {(() => {
        if (cardBattleMinimized && !cardBattleId) return null;
        const activeCard =
          (cardBattleId &&
            engagements.find((e) => e.id === cardBattleId)) ||
          engagements.find(
            (e) =>
              e.mode === "card" &&
              (e.status === "active" || e.status === "commit") &&
              e.sides.some((s) => s.factionId === payload?.factionId),
          ) ||
          null;
        if (!activeCard || activeCard.mode !== "card" || !payload) return null;
        if (cardBattleMinimized && activeCard.id !== cardBattleId) return null;
        const factionNames = Object.fromEntries(
          payload.world.factions.map((f) => [f.id, f.name]),
        );
        return (
          <div className="cbt-overlay" role="dialog" aria-modal="true">
            <CardBattleTable
              engagement={activeCard}
              factionId={payload.factionId}
              password={password}
              factionNames={factionNames}
              busy={stanceBusy}
              onUpdated={(next) => {
                setEngagements((prev) =>
                  prev.map((e) => (e.id === next.id ? next : e)),
                );
              }}
              onClose={() => {
                setCardBattleId(null);
                setCardBattleMinimized(true);
              }}
            />
          </div>
        );
      })()}
      {systemFocusId && focusedSystem && payload && (
        <div
          className={`viewer-system-layer ${
            economyLinkedSystemId === focusedSystem.id
              ? "viewer-system-layer--docked-right"
              : ""
          }`}
          role="region"
          aria-label={focusedSystem.name}
        >
          <header className="viewer-system-head">
            <button
              type="button"
              className="btn viewer-system-back"
              onClick={closePlayerSystem}
            >
              {economyLinkedSystemId === focusedSystem.id
                ? "← Экономика"
                : "← Галактика"}
              <span className="viewer-system-back-kbd">Esc</span>
            </button>
            <h2 className="viewer-system-title">
              {economyLinkedSystemId === focusedSystem.id ? (
                <span className="viewer-system-crumbs">
                  <span className="hint">Экономика</span>
                  <span className="hint" aria-hidden>
                    →
                  </span>
                  <span>{focusedSystem.name}</span>
                </span>
              ) : (
                focusedSystem.name
              )}
            </h2>
            <button
              type="button"
              className="btn ghost"
              onClick={() => openSystemHelp(focusedSystem.id)}
              title="Досье: объекты, добыча, постройки"
            >
              Досье
              <kbd className="sys-codex__kbd">I</kbd>
            </button>
          </header>
          <div className="viewer-system-body">
            <SystemView
              system={focusedSystem}
              readOnly
              playerFactionId={payload.factionId}
              nav={playerSystemNav}
              onSelectOwnFleet={(fleetId) => {
                closePlayerSystem();
                setSelectedFleetId(fleetId);
                setSelectedLegionId(null);
                const fleet = payload.world.fleets.find((f) => f.id === fleetId);
                if (fleet) setSelectedSystemId(fleet.systemId);
                goView("map");
                if (fleet) {
                  window.setTimeout(
                    () => mapApiRef.current?.focusSystem(fleet.systemId),
                    80,
                  );
                }
              }}
              onSelectOwnLegion={(legionId) => {
                closePlayerSystem();
                setSelectedLegionId(legionId);
                setSelectedFleetId(null);
                const leg = payload.world.legions.find((l) => l.id === legionId);
                if (leg) setSelectedSystemId(leg.systemId);
                goView("map");
                if (leg) {
                  window.setTimeout(
                    () => mapApiRef.current?.focusSystem(leg.systemId),
                    80,
                  );
                }
              }}
              planetManage={{
                factionId: payload.factionId,
                stocks: payload.economy?.stocks ?? {},
                reservedAp,
                apMax,
                buildings: buildingsCatalog,
                colonies: coloniesCatalog,
                mapResources: mapResourcesCatalog,
                techEco: {
                  techTiers: payload.economy?.techTiers,
                  unlockedProperties: payload.economy?.unlockedProperties,
                },
                busy: planetBusy,
                message: planetMsg,
                onAction: (req) => void runPlanetAction(req),
                onOpenResearch: openResearchWithTech,
                buildQueue: payload.economy?.buildQueue ?? [],
                onChangeBuildQueue: (next) => void setBuildQueue(next),
                onPreviewBuild: (buildingId) => {
                  const planetId =
                    mapFocus.level === "planet" &&
                    mapFocus.systemId === focusedSystem.id
                      ? mapFocus.planetId
                      : "";
                  if (!planetId) return Promise.resolve(null);
                  return previewBuild({
                    systemId: focusedSystem.id,
                    planetId,
                    buildingId,
                  });
                },
                highlightCategory: ecoHighlightCategory,
                onShowInEconomy: (category) => {
                  setEcoHighlightCategory(category);
                  setEconomyLinkedSystemId(focusedSystem.id);
                  goView("economy");
                },
              }}
              systemManage={{
                factionId: payload.factionId,
                stocks: payload.economy?.stocks ?? {},
                reservedAp,
                apMax,
                ships: shipsCatalog,
                units: unitsCatalog,
                mapResourceNames: Object.fromEntries(
                  Object.entries(mapResourcesCatalog ?? {}).map(([id, d]) => [
                    id,
                    d.name ?? id,
                  ]),
                ),
                busy: systemBusy,
                message: systemMsg,
                onAction: (req) => void runSystemAction(req),
                flowData,
                buildings: buildingsCatalog,
                highlightCategory: ecoHighlightCategory,
                onHighlightCategory: setEcoHighlightCategory,
              }}
            />
          </div>
          <footer className="viewer-system-actions">
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                submitDirectClaim(focusedSystem.id, selectedFleetId)
              }
            >
              Захват
            </button>
            <button
              type="button"
              className="btn ghost"
              disabled={
                !focusedSystem.ownerFactionId ||
                focusedSystem.ownerFactionId === payload.factionId ||
                !selectedFleetId
              }
              title={
                !selectedFleetId
                  ? "Выберите свой флот на карте"
                  : focusedSystem.ownerFactionId === payload.factionId
                    ? "Система под вашим контролем"
                    : "Атаковать систему"
              }
              onClick={() => {
                if (selectedFleetId) {
                  submitDirectAttack(selectedFleetId, focusedSystem.id);
                }
              }}
            >
              Атака
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => goView("rp")}
            >
              Сцена с ГМом
            </button>
          </footer>
        </div>
      )}
      <SystemCodex
        factionId={payload.factionId}
        mapResourceNames={Object.fromEntries(
          Object.entries(mapResourcesCatalog ?? {}).map(([id, d]) => [
            id,
            d.name ?? id,
          ]),
        )}
        onClose={closeSystemHelp}
      />
    </div>
  );
}

function toModel(
  world: WorldState,
  selectedSystemId: string | null,
  selectedFleetId: string | null,
  layers: MapLayerFlags,
): MapViewModel {
  return {
    world,
    selectedSystemId,
    selectedFleetId,
    selectedLegionId: null,
    selectedLinkId: null,
    selectedSectorId: null,
    linkDraftFromId: null,
    sectorDraftPoints: [],
    ...layers,
    showSupply: false,
  };
}

function emptyWorld(): WorldState {
  return {
    meta: {
      schemaVersion: 2,
      name: "",
      turn: 0,
      createdAt: "",
      updatedAt: "",
      width: 4000,
      height: 3000,
    },
    systems: [],
    links: [],
    sectors: [],
    factions: [],
    races: [],
    fleets: [],
    legions: [],
    diplomacy: [],
    orders: [],
    turnHistory: [],
    caravans: [],
    quests: [],
  };
}
