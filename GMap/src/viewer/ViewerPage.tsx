import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Coins,
  Flag,
  Home,
  Info,
  Landmark,
  Layers,
  Map as MapIcon,
  Menu,
  MessageSquare,
  ScrollText,
  Settings,
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
} from "../renderers/MapCanvas";
import type {
  OrderType,
  ViewerPayload,
  WorldState,
} from "../state/types";
import { formatHopTurns, hopDistance, hopPath } from "../state/pathfinding";
import {
  VIEWER_LAYER_CHIPS,
  LAYER_PRESET_BUTTONS,
  applyLayerPreset,
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
  graphicsForPerf,
  readStoredGraphics,
  writeStoredGraphics,
  type GraphicsPrefKey,
  type ViewerGraphicsPrefs,
} from "../ui/viewerGraphics";
import { LAYER_LUCIDE } from "../ui/layerIcons";
import { FloatingRpWindow } from "../editors/FloatingRpWindow";
import { SystemDossier } from "../editors/SystemDossier";
import { useWorldStore } from "../state/worldStore";
import {
  PlayerForcesPanel,
  PlayerHqHome,
  PlayerOrdersPanel,
} from "./PlayerHqPanels";
import type {
  BuildingDef,
  ColonyDef,
  PlanetActionRequest,
} from "./PlayerPlanetManage";
import { RpChat } from "../editors/RpChat";
import { ViewerContextMenu } from "./ViewerContextMenu";
import { fetchContent } from "../state/contentCatalog";

const MapCanvas = lazy(() =>
  import("../renderers/MapCanvas").then((m) => ({ default: m.MapCanvas })),
);

/** Map-first rooms; forces opens from Штаб. RP = scene with GM only. */
type PlayerView = "hq" | "forces" | "orders" | "map" | "rp";

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
      return v;
  } catch {
    /* ignore */
  }
  return null;
}

function defaultPerfForDevice(): PerfMode {
  return isLikelyMobile() ? "ultralight" : "quality";
}

const PERF_OPTIONS: {
  id: PerfMode;
  label: string;
  hint: string;
  mobileRec?: boolean;
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
    hint: "Макс. эффекты + штамп хода. Только ПК / мощный планшет.",
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
  const [buildingsCatalog, setBuildingsCatalog] = useState<
    Record<string, BuildingDef>
  >({});
  const [coloniesCatalog, setColoniesCatalog] = useState<
    Record<string, ColonyDef>
  >({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewMode, setViewMode] = useState<PlayerView>("map");
  const [rpFloatOpen, setRpFloatOpen] = useState(false);
  const [rpUnread, setRpUnread] = useState(0);
  const loadWorld = useWorldStore((s) => s.loadWorld);
  const openSystemView = useWorldStore((s) => s.openSystemView);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
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
  const [engagements, setEngagements] = useState<
    {
      id: string;
      theater: string;
      systemId: string;
      status: string;
      sides: { factionId: string; stance?: string }[];
      result?: {
        outcome?: string;
        lossesA?: { defId: string; lost: number }[];
        lossesB?: { defId: string; lost: number }[];
      } | null;
    }[]
  >([]);
  const modelRef = useRef<MapViewModel | null>(null);
  const mapApiRef = useRef<MapCanvasApi | null>(null);
  const listeners = useRef(new Set<() => void>());
  const mapStampRef = useRef<string | null>(null);
  const credsRef = useRef({ factionId: "", password: "" });

  const bump = () => {
    for (const l of listeners.current) l();
  };

  const applyPerfMode = (mode: PerfMode, withPresets = false) => {
    setPerfMode(mode);
    setLoginPerf(mode);
    try {
      localStorage.setItem("gmap-viewer-perf", mode);
    } catch {
      /* ignore */
    }
    if (withPresets) {
      const nextLayers = layersForPerfChoice(mode);
      const nextGfx = graphicsForPerf(mode);
      setLayers(nextLayers);
      setGraphics(nextGfx);
      writeStoredViewerLayers(nextLayers);
      writeStoredGraphics(nextGfx);
    }
  };

  const toggleGraphic = (key: GraphicsPrefKey) => {
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
    void fetchContent().then((c) => {
      if (!c) return;
      if (c.buildings) setBuildingsCatalog(c.buildings as Record<string, BuildingDef>);
      if (c.colonies) setColoniesCatalog(c.colonies as Record<string, ColonyDef>);
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
        const stamp = `${ver.tableRevision ?? ""}|${ver.updatedAt ?? ""}|${ver.turn ?? ""}`;
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
        mapStampRef.current = stamp;
        setPayload((prev) => ({
          world: data.world,
          factionId: data.factionId,
          visibleSystemIds: data.visibleSystemIds,
          updatedAt: data.updatedAt ?? ver.updatedAt,
          tableRevision: data.tableRevision ?? ver.tableRevision,
          economy: data.economy ?? prev?.economy,
          apMax: data.apMax ?? prev?.apMax,
          reservedAp: data.reservedAp ?? prev?.reservedAp,
        }));
        if (typeof data.apMax === "number") setApMax(data.apMax);
        if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
        loadWorld(data.world);
        setSyncHint(
          `Карта обновлена · ход ${data.world.meta.turn} · ${data.visibleSystemIds.length} систем`,
        );
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
  }, [payload?.factionId, rpFloatOpen]);

  useEffect(() => {
    if (!payload?.factionId) {
      setEngagements([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/engagements", {
          headers: { "X-Faction-Id": payload.factionId },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setEngagements(data.engagements || []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
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
      mapStampRef.current = `${data.tableRevision ?? data.world.meta.tableRevision ?? ""}|${data.world.meta.updatedAt ?? data.updatedAt ?? ""}|${data.world.meta.turn}`;

      const chosen = loginPerf;
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
    setRpFloatOpen(v === "rp");
    if (v !== "map") setSheetOpen(false);
    setTouchMoveArmed(false);
    writeStoredStart(v === "map" ? "map" : "hq");
  };

  const setIndustryTax = async (tierId: string) => {
    if (!payload) return;
    try {
      const res = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          factionId: payload.factionId,
          password,
          defId: "intent.set_tax",
          payload: { taxSlot: "tax.industry", tierId },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setOrderMsg(`Налог в очереди: ${tierId}`);
      setReservedAp((r) => r + (data.intent?.apCost ?? 1));
      setPayload({
        ...payload,
        economy: {
          ...payload.economy!,
          pendingPolicy: {
            taxes: {
              ...(payload.economy?.pendingPolicy?.taxes || {}),
              "tax.industry": tierId,
            },
          },
        },
      });
    } catch (err) {
      setOrderMsg(err instanceof Error ? err.message : String(err));
    }
  };

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
  ): WorldState => {
    const fromId =
      kind === "fleet"
        ? world.fleets.find((f) => f.id === unitId)?.systemId
        : world.legions.find((l) => l.id === unitId)?.systemId;
    const path = hopPath(world, fromId, toSystemId);
    const route = path.length >= 2 ? path.slice(1) : [];
    if (kind === "fleet") {
      return {
        ...world,
        fleets: world.fleets.map((f) =>
          f.id === unitId ? { ...f, route, stance: "move" as const } : f,
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

  const submitMoveOrder = async (
    kind: "fleet" | "legion",
    unitId: string,
    toSystemId: string,
    hops?: number,
  ) => {
    if (!payload) return;
    setOrderMsg(null);
    const fromSystemId =
      kind === "fleet"
        ? payload.world.fleets.find((f) => f.id === unitId)?.systemId
        : payload.world.legions.find((l) => l.id === unitId)?.systemId;
    const body = {
      factionId: payload.factionId,
      password,
      type: kind === "fleet" ? ("move_fleet" as const) : ("move_legion" as const),
      fleetId: kind === "fleet" ? unitId : undefined,
      legionId: kind === "legion" ? unitId : undefined,
      fromSystemId,
      toSystemId,
      note:
        hops != null && Number.isFinite(hops)
          ? `Перетаскивание · ${formatHopTurns(hops)}`
          : "Перетаскивание",
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
      const withRoute = applyLocalMoveRoute(
        payload.world,
        kind,
        unitId,
        toSystemId,
      );
      const nextWorld = {
        ...withRoute,
        orders: [...withRoute.orders, data.order],
      };
      setPayload({
        ...payload,
        world: nextWorld,
      });
      loadWorld(nextWorld);
      if (typeof data.apMax === "number") setApMax(data.apMax);
      if (typeof data.reservedAp === "number") setReservedAp(data.reservedAp);
      else if (typeof data.intent?.apCost === "number") {
        setReservedAp((r) => r + data.intent.apCost);
      }
      const hopsLabel =
        hops != null && Number.isFinite(hops)
          ? ` · ${formatHopTurns(hops)}`
          : "";
      const nextAp =
        typeof data.reservedAp === "number"
          ? data.reservedAp
          : reservedAp + (data.intent?.apCost ?? 0);
      setOrderMsg(
        `Приказ на ход принят${hopsLabel} · AP ${nextAp}/${data.apMax ?? apMax}`,
      );
      bump();
    } catch (e) {
      setOrderMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const onUnitDrop = (drop: MapUnitDropPayload) => {
    if (drop.kind === "fleet") {
      setSelectedFleetId(drop.unitId);
      setSelectedLegionId(null);
    } else {
      setSelectedLegionId(drop.unitId);
      setSelectedFleetId(null);
    }
    setSelectedSystemId(drop.toSystemId);
    setTargetSystemId(drop.toSystemId);
    setOrderType(drop.kind === "fleet" ? "move_fleet" : "move_legion");
    setSheetOpen(false);
    void submitMoveOrder(drop.kind, drop.unitId, drop.toSystemId, drop.hops);
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

  if (!payload) {
    return (
      <div className="viewer-login">
        <div className="login-card">
          <p className="login-eyebrow">Доступ к кампании</p>
          <h1>LO GOLDEN PAX</h1>
          <p className="hint" style={{ textAlign: "center" }}>
            После входа — карта галактики. Штаб, приказы и сцена с мастером —
            отдельными панелями.
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
                  {PERF_OPTIONS.map((opt) => (
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
                  ))}
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
  const pendingCount = payload.world.orders.filter(
    (o) => o.status === "pending",
  ).length;
  const desktopGlass =
    !mobile &&
    (viewMode === "hq" || viewMode === "forces" || viewMode === "orders");
  const mobileRoom =
    mobile &&
    (viewMode === "hq" || viewMode === "forces" || viewMode === "orders");
  // Map-first on mobile: HQ/orders are sheets over the map, not a separate page.
  const showMapLayer =
    viewMode === "map" ||
    desktopGlass ||
    mobileRoom ||
    (!mobile && viewMode === "rp");

  const hqPanel = (
    <PlayerHqHome
      payload={payload}
      reservedAp={reservedAp}
      apMax={apMax}
      rpUnread={rpUnread}
      pendingOrders={pendingCount}
      orderMsg={orderMsg}
      onSetIndustryTax={(tier) => void setIndustryTax(tier)}
      onOpenForces={() => goView("forces")}
      onOpenOrders={() => goView("orders")}
      onOpenRp={() => {
        goView("rp");
        setRpUnread(0);
      }}
      onOpenMap={() => goView("map")}
    />
  );

  const forcesPanel = (
    <PlayerForcesPanel
      payload={payload}
      selectedFleetId={selectedFleetId}
      selectedLegionId={selectedLegionId}
      onSelectFleet={(id) => {
        setSelectedFleetId(id);
        setSelectedLegionId(null);
        const fleet = payload.world.fleets.find((f) => f.id === id);
        if (fleet) {
          setSelectedSystemId(fleet.systemId);
          goView("map");
          window.setTimeout(
            () => mapApiRef.current?.focusSystem(fleet.systemId),
            80,
          );
        }
        setOrderMsg(`Флот выбран: ${fleet?.name ?? id}`);
      }}
      onSelectLegion={(id) => {
        setSelectedLegionId(id);
        setSelectedFleetId(null);
        const leg = payload.world.legions.find((l) => l.id === id);
        if (leg) {
          setSelectedSystemId(leg.systemId);
          goView("map");
          window.setTimeout(
            () => mapApiRef.current?.focusSystem(leg.systemId),
            80,
          );
        }
        setOrderMsg(`Легион выбран: ${leg?.name ?? id}`);
      }}
      onSelectSystem={(id) => {
        setSelectedSystemId(id);
        setTargetSystemId(id);
      }}
      onOrderWithFleet={(id) => {
        setSelectedFleetId(id);
        setSelectedLegionId(null);
        setOrderType("move_fleet");
        const fleet = payload.world.fleets.find((f) => f.id === id);
        if (fleet) setSelectedSystemId(fleet.systemId);
        goView("orders");
      }}
      onOrderWithLegion={(id) => {
        setSelectedLegionId(id);
        setSelectedFleetId(null);
        setOrderType("move_legion");
        const leg = payload.world.legions.find((l) => l.id === id);
        if (leg) setSelectedSystemId(leg.systemId);
        goView("orders");
      }}
      onOpenMap={() => goView("map")}
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
    />
  );

  const roomPanel =
    viewMode === "forces"
      ? forcesPanel
      : viewMode === "orders"
        ? ordersPanel
        : viewMode === "hq"
          ? hqPanel
          : null;

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
        <span className="viewer-ap-pill" title="Занято AP / лимит на ход">
          AP {reservedAp}/{apMax}
        </span>
        {!mobile && (
          <nav className="viewer-empire-banner" aria-label="Управление державой">
            <button
              type="button"
              className={viewMode === "hq" ? "on" : ""}
              onClick={() => goView("hq")}
            >
              Штаб
            </button>
            <button
              type="button"
              className={viewMode === "forces" ? "on" : ""}
              onClick={() => goView("forces")}
            >
              Силы
            </button>
            <button
              type="button"
              className={viewMode === "orders" ? "on" : ""}
              onClick={() => goView("orders")}
            >
              Приказы
              {pendingCount > 0 ? ` · ${pendingCount}` : ""}
            </button>
            <button
              type="button"
              className={viewMode === "rp" ? "on" : ""}
              onClick={() => {
                goView("rp");
                setRpUnread(0);
              }}
            >
              Сцена
              {rpUnread > 0 ? ` · ${rpUnread > 9 ? "9+" : rpUnread}` : ""}
            </button>
            <button
              type="button"
              className={viewMode === "map" && !desktopGlass ? "on" : ""}
              onClick={() => goView("map")}
              title="Карта галактики"
            >
              Карта
            </button>
          </nav>
        )}
        <button
          type="button"
          className="viewer-icon-btn"
          aria-label="Настройки карты"
          title="Настройки"
          onClick={() => {
            setMenuOpen(false);
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
              onSystemOpen={(id) => {
                setSelectedSystemId(id);
                setSheetOpen(false);
                setTouchMoveArmed(false);
                openSystemView(id);
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
                    goView("orders");
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
                openSystemView(id);
              }}
              onMoveUnit={(kind, unitId, toSystemId, hops) => {
                void submitMoveOrder(kind, unitId, toSystemId, hops);
              }}
              onOrderType={(kind, opts) => {
                setOrderType(kind);
                if (opts.fleetId) {
                  setSelectedFleetId(opts.fleetId);
                  setSelectedLegionId(null);
                }
                if (opts.systemId) {
                  setSelectedSystemId(opts.systemId);
                  setTargetSystemId(opts.systemId);
                }
                goView("orders");
              }}
              onOpenOrders={() => goView("orders")}
              onOpenRp={() => goView("rp")}
            />
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
                      openSystemView(selectedSystemId);
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
            {desktopGlass && roomPanel && (
              <aside className="viewer-glass-panel" aria-label="Панель державы">
                <div className="viewer-glass-panel-head">
                  <strong>
                    {viewMode === "orders"
                      ? "Приказы"
                      : viewMode === "forces"
                        ? "Силы"
                        : "Штаб"}
                  </strong>
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
          </Suspense>
        ) : null}
      </main>

      {mobileRoom && roomPanel && (
        <>
          <button
            type="button"
            className="viewer-backdrop sheet"
            aria-label="Закрыть"
            onClick={() => goView("map")}
          />
          <aside
            className="viewer-sheet tall open viewer-sheet--room"
            aria-label="Панель державы"
          >
            <div className="viewer-sheet-grab">
              <p className="viewer-sheet-kicker">
                {viewMode === "orders"
                  ? "Приказы"
                  : viewMode === "forces"
                    ? "Силы"
                    : "Штаб"}
              </p>
              <button
                type="button"
                className="viewer-sheet-close"
                onClick={() => goView("map")}
              >
                На карту
              </button>
            </div>
            <div className="viewer-sheet-body">{roomPanel}</div>
          </aside>
        </>
      )}

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
            перерисовки каждый кадр. Максимум — полный FX (ПК).
          </p>
          <div className="viewer-perf-row">
            {PERF_OPTIONS.map((opt) => (
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
            ))}
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
          </p>
          <div className="layer-chip-grid">
            {GRAPHICS_TOGGLES.map((t) => (
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
          <p className="hint">Пресеты или точечно — под свой комфорт.</p>
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
              бой / спорная система
            </li>
            <li>
              <span className="leg-icon coin">
                <Coins size={14} strokeWidth={2} aria-hidden />
              </span>
              торговля · ресурсы
            </li>
            <li>
              <span className="leg-ship" /> флот (форма = тип)
            </li>
            <li>
              <span className="leg-shield" /> гарнизон / станция
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
            <p className="hint">
              Металл: {payload.economy.stocks?.["currency.metal"] ?? "—"} ·
              Обеспечение: {payload.economy.stocks?.["currency.supply"] ?? "—"}
              <br />
              Дефицит: {payload.economy.deficit ?? "ok"} · давление:{" "}
              {payload.economy.pressure ?? 0}
            </p>
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
            Флот/легион — перетаскивание (маршрут на карте). Штаб / приказы /
            сцена — сверху. Сцена только с мастером.
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
              goView("rp");
            }}
          >
            Сцена с мастером
          </button>
        </section>

        <section>
          <h3>Сражения</h3>
          <p className="hint">
            Ваши Engagement после тика: исход и потери по типам.
          </p>
          {engagements.length === 0 && (
            <p className="hint">Пока нет записей боя.</p>
          )}
          {engagements
            .slice()
            .reverse()
            .slice(0, 6)
            .map((eng) => {
              const sys =
                payload.world.systems.find((s) => s.id === eng.systemId)?.name ??
                eng.systemId;
              const losses = (side: "A" | "B") => {
                const arr =
                  side === "A" ? eng.result?.lossesA : eng.result?.lossesB;
                if (!arr?.length) return "—";
                return (
                  arr
                    .filter((l) => l.lost > 0)
                    .map(
                      (l) =>
                        `${l.defId.replace(/^(ship|unit)\./, "")}−${l.lost}`,
                    )
                    .join(", ") || "без потерь"
                );
              };
              return (
                <div key={eng.id} className="order-card">
                  <div>
                    <strong>
                      {eng.theater} · {sys} · {eng.status}
                    </strong>
                    {eng.result?.outcome && (
                      <>
                        <br />
                        <span className="hint">
                          исход: {eng.result.outcome}
                        </span>
                        <br />
                        <span className="hint">
                          потери A: {losses("A")} · B: {losses("B")}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
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
                  goView("orders");
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
                    goView("orders");
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
              <p className="viewer-sheet-kicker">Сцена с мастером</p>
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
                <RpChat
                  mode="player"
                  layout="fill"
                  factionId={payload.factionId}
                  password={password}
                  factionColor={faction?.color}
                  avatarUrl={faction?.avatarUrl}
                  systems={payload.world.systems.map((s) => ({
                    id: s.id,
                    name: s.name,
                  }))}
                  onMsg={(m) => setOrderMsg(m)}
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
          mode="player"
          factionId={payload.factionId}
          password={password}
          factionColor={faction?.color}
          avatarUrl={faction?.avatarUrl}
          systems={payload.world.systems.map((s) => ({
            id: s.id,
            name: s.name,
          }))}
          onMsg={(m) => setOrderMsg(m)}
          unread={rpUnread}
          storageKey={`gmap-rp-float-geom-player-${payload.factionId}`}
          title="Сцена · мастер"
          onMessagesLoaded={(msgs) => {
            const latest = msgs[msgs.length - 1];
            if (latest?.at) {
              writeRpSeenAt(payload.factionId, latest.at);
            }
            setRpUnread(0);
          }}
        />
      )}

      {mobile && (
      <nav className="viewer-dock" aria-label="Навигация игрока">
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "map" ? "active" : ""}`}
          onClick={() => goView("map")}
        >
          <MapIcon size={18} strokeWidth={2} aria-hidden />
          Карта
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "hq" || viewMode === "forces" ? "active" : ""}`}
          onClick={() => goView("hq")}
        >
          <Landmark size={18} strokeWidth={2} aria-hidden />
          Штаб
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "orders" ? "active" : ""}`}
          onClick={() => goView("orders")}
        >
          <ScrollText size={18} strokeWidth={2} aria-hidden />
          Приказы
          {pendingCount > 0 && (
            <span className="dock-badge">{pendingCount}</span>
          )}
        </button>
        <button
          type="button"
          className={`viewer-dock-btn ${viewMode === "rp" ? "active" : ""}`}
          onClick={() => {
            goView("rp");
            setRpUnread(0);
          }}
        >
          <MessageSquare size={18} strokeWidth={2} aria-hidden />
          Сцена
          {rpUnread > 0 && viewMode !== "rp" && (
            <span className="dock-badge">{rpUnread > 9 ? "9+" : rpUnread}</span>
          )}
        </button>
      </nav>
      )}
      <SystemDossier
        readOnly
        playerActions={{
          factionId: payload.factionId,
          onClaim: (systemId) => {
            setSelectedSystemId(systemId);
            setTargetSystemId(systemId);
            setOrderType("claim_system");
            goView("orders");
          },
          onAttack: (systemId) => {
            setSelectedSystemId(systemId);
            setTargetSystemId(systemId);
            setOrderType("attack_system");
            goView("orders");
          },
          onOpenRp: () => goView("rp"),
          onSelectOwnFleet: (fleetId) => {
            closeSystemView();
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
          },
          onSelectOwnLegion: (legionId) => {
            closeSystemView();
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
          },
        }}
        planetManage={{
          factionId: payload.factionId,
          stocks: payload.economy?.stocks ?? {},
          reservedAp,
          apMax,
          buildings: buildingsCatalog,
          colonies: coloniesCatalog,
          busy: planetBusy,
          message: planetMsg,
          onAction: (req) => void runPlanetAction(req),
        }}
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
