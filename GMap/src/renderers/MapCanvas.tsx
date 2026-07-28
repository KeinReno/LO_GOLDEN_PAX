import { useEffect, useRef, type MutableRefObject } from "react";
import {
  Application,
  BlurFilter,
  Container,
  Graphics,
  Text,
  Sprite,
  Texture,
  FederatedPointerEvent,
} from "pixi.js";
import { useWorldStore } from "../state/worldStore";
import type { Point } from "../generators/brushGenerator";
import type { StarSystem, SystemLink, WorldState } from "../state/types";
import {
  drawActivityBadge,
  drawBattleFx,
  drawContestedRing,
  drawCrossedSwords,
  drawDiplomacyLines,
  drawFactionLabels,
  drawCapitalEmblems,
  drawFleetGlyph,
  drawFleetStanceBadge,
  drawFogVeil,
  drawIntelRing,
  drawLegionGlyph,
  drawLegionStanceBadge,
  drawLink,
  drawOrderArrow,
  drawOrderArrowIso,
  drawOwnershipAura,
  drawSectors,
  drawSelectionBrackets,
  drawSystemGlyph,
  drawTerritoryBorders,
  drawTerritoryGlow,
  drawTradeLanes,
  layoutFleetsAroundSystem,
  layoutLegionsAroundSystem,
  linkHasTraffic,
  makeAnim,
  parseFactionColor,
  resolveLabelScale,
  resolveMapLod,
  type AnimClock,
} from "./drawMapIcons";
import {
  drawStarfield,
  drawTableFloor,
  TABLE,
} from "./drawTableFx";
import { fromIso, toIso } from "./iso";
import { isCorridorSystem, censusPlanets } from "../state/planets";
import {
  getVisibleSystemIds,
  resolveEditorViewWorld,
} from "../state/fog";
import {
  isStatePolity,
  resolveFactionBorder,
  resolveFactionFill,
  resolveFactionSystemColor,
} from "../state/territory";
import { ensureMapIconsLoaded, mapIconsReady } from "./mapIconAssets";
import { MapIconOverlay, fleetSlotIcon, legionSlotIcon } from "./mapIconSprites";
import type { UnitSpriteSlot } from "./mapIconSprites";
import { BattleParticleField } from "./battleParticles";
import {
  drawAnomalyField,
  drawBlockadeRing,
  drawCaravans,
  drawContestedClaim,
  drawDeadZone,
  drawJumpRange,
  drawQuestMarker,
  drawSpecialLink,
  drawSupplyChains,
  drawTrafficDensity,
  questMarkerHit,
} from "./drawMapFeatures";
import { ORDER_ARROW_COLORS } from "../state/defaults";
import { questsAtSystem } from "../state/mapFeatures";
import { POI_PAINT_TOOLS } from "../state/types";
import { hasSpaceObject } from "../state/spaceObjects";
import { formatHopTurns, hopDistance, hopPath } from "../state/pathfinding";
import { registerMapPngExporter } from "../io/mapExportBridge";

const SYSTEM_HIT_R = 20;
const SYSTEM_DROP_R = 72;
const FLEET_HIT_R = 64;
const LEGION_HIT_R = 60;
/** Minimum on-screen hit size (px) so finger targets stay usable when zoomed out. */
const MIN_TOUCH_HIT_PX = 48;
const DRAG_START_PX = 14;
const LONG_PRESS_MS = 450;
const LINK_HIT_PX = 10;
const FLEET_ICON_SIZE = 36;
const FLEET_ICON_SIZE_SEL = 44;
const LEGION_ICON_SIZE = 34;
const LEGION_ICON_SIZE_SEL = 40;

export interface MapViewModel {
  world: WorldState;
  selectedSystemId: string | null;
  selectedSystemIds?: string[];
  selectedFleetId: string | null;
  selectedLegionId: string | null;
  selectedLinkId: string | null;
  selectedSectorId: string | null;
  linkDraftFromId: string | null;
  sectorDraftPoints: number[];
  showLinks: boolean;
  showOwnership: boolean;
  showTerritory: boolean;
  showSectors: boolean;
  showFactionLabels: boolean;
  showLabels: boolean;
  showFleets: boolean;
  showLegions: boolean;
  showOrders: boolean;
  showDiplomacy: boolean;
  showFogPreview: boolean;
  gmOmniscientView?: boolean;
  fogMaskPreview?: string[];
  showJumpRange?: boolean;
  showSupply?: boolean;
  showCaravans?: boolean;
  showBlockades?: boolean;
  showDeadZones?: boolean;
  showTraffic?: boolean;
  showQuests?: boolean;
  activeFactionId?: string | null;
  /** ultralight(bare) | mobile(lite) | quality_mobile(soft) | quality(full) | cinematic(full+) | auto */
  perfMode?:
    | "auto"
    | "quality"
    | "quality_mobile"
    | "mobile"
    | "ultralight"
    | "cinematic";
  graphics?: {
    animations?: boolean;
    labelShadows?: boolean;
    tableFx?: boolean;
    battleFx?: boolean;
    territoryGlow?: boolean;
    liveZoomRebuild?: boolean;
    turnStamp?: boolean;
    scarFx?: boolean;
    cinematic?: boolean;
  };
}

export interface MapCanvasApi {
  zoomBy: (factor: number) => void;
  resetView: () => void;
  /** Pan camera so system is centered (viewer Forces / search). */
  focusSystem: (systemId: string) => void;
}

/**
 * full — desktop FX + continuous redraw (animations)
 * soft — quality on phone: rich look, dirty-only
 * lite — reduced FX, dirty-only
 * bare — minimal, dirty-only
 */
type PerfTier = "full" | "soft" | "lite" | "bare";

function resolvePerfTier(
  mode: "editor" | "viewer",
  pref: MapViewModel["perfMode"],
): PerfTier {
  if (pref === "quality" || pref === "cinematic") return "full";
  if (pref === "quality_mobile") return "soft";
  if (pref === "ultralight") return "bare";
  if (pref === "mobile") return "lite";
  if (mode !== "viewer" || typeof window === "undefined") return "full";
  if (window.matchMedia("(max-width: 700px)").matches) return "soft";
  return "full";
}

function resolveGraphics(
  model: MapViewModel,
  tier: PerfTier,
): {
  animations: boolean;
  labelShadows: boolean;
  tableFx: boolean;
  battleFx: boolean;
  territoryGlow: boolean;
  liveZoomRebuild: boolean;
  turnStamp: boolean;
  scarFx: boolean;
  cinematic: boolean;
} {
  const g = model.graphics ?? {};
  const defaults =
    tier === "bare"
      ? {
          animations: false,
          labelShadows: false,
          tableFx: false,
          battleFx: false,
          territoryGlow: false,
          liveZoomRebuild: false,
          turnStamp: false,
          scarFx: false,
          cinematic: false,
        }
      : tier === "lite"
        ? {
            animations: false,
            labelShadows: false,
            tableFx: true,
            battleFx: false,
            territoryGlow: false,
            liveZoomRebuild: false,
            turnStamp: true,
            scarFx: false,
            cinematic: false,
          }
        : tier === "soft"
          ? {
              animations: true,
              labelShadows: false,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
              turnStamp: true,
              scarFx: true,
              cinematic: false,
            }
          : {
              animations: true,
              labelShadows: true,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
              turnStamp: true,
              scarFx: true,
              cinematic: model.perfMode === "cinematic",
            };
  return {
    animations: g.animations ?? defaults.animations,
    labelShadows: g.labelShadows ?? defaults.labelShadows,
    tableFx: g.tableFx ?? defaults.tableFx,
    battleFx: g.battleFx ?? defaults.battleFx,
    territoryGlow: g.territoryGlow ?? defaults.territoryGlow,
    liveZoomRebuild: g.liveZoomRebuild ?? defaults.liveZoomRebuild,
    turnStamp: g.turnStamp ?? defaults.turnStamp,
    scarFx: g.scarFx ?? defaults.scarFx,
    cinematic: g.cinematic ?? defaults.cinematic,
  };
}

const STATIC_ANIM: AnimClock = { t: 0, pulse: 0.5, pulse2: 0.5 };

function distPointToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Fit worldLayer so systems fill the screen (iso space). */
function fitSystemsInView(
  layer: Container,
  systems: { x: number; y: number }[],
  screenW: number,
  screenH: number,
  padding = 0.1,
): void {
  if (screenW < 8 || screenH < 8) return;
  if (!systems.length) {
    layer.position.set(screenW / 2, screenH / 2);
    layer.scale.set(0.55);
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of systems) {
    const p = toIso(s.x, s.y);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const bw = Math.max(maxX - minX, 120);
  const bh = Math.max(maxY - minY, 120);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = Math.min(
    (screenW * (1 - padding * 2)) / bw,
    (screenH * (1 - padding * 2)) / bh,
    2.2,
  );
  const s = Math.max(0.04, scale);
  layer.scale.set(s);
  layer.position.set(screenW / 2 - cx * s, screenH / 2 - cy * s);
}

function findLinkAt(
  p: Point,
  links: SystemLink[],
  systems: StarSystem[],
): SystemLink | null {
  const tip = toIso(p.x, p.y);
  const byId = new Map(systems.map((s) => [s.id, s]));
  let best: SystemLink | null = null;
  let bestD = LINK_HIT_PX;
  for (const link of links) {
    const a = byId.get(link.fromId);
    const b = byId.get(link.toId);
    if (!a || !b) continue;
    const ap = toIso(a.x, a.y);
    const bp = toIso(b.x, b.y);
    const d = distPointToSegment(tip.x, tip.y, ap.x, ap.y, bp.x, bp.y);
    if (d < bestD) {
      bestD = d;
      best = link;
    }
  }
  return best;
}

function territoryFingerprint(world: WorldState): string {
  const sys = world.systems
    .map(
      (s) =>
        `${s.id}:${s.ownerFactionId ?? ""}:${s.x.toFixed(1)}:${s.y.toFixed(1)}`,
    )
    .join("|");
  const fac = world.factions
    .map(
      (f) =>
        `${f.id}:${f.color}:${f.fillColor ?? ""}:${f.borderColor ?? ""}:${f.systemColor ?? ""}`,
    )
    .join("|");
  return `${sys}||${fac}`;
}

export type MapUnitDropPayload = {
  kind: "fleet" | "legion";
  unitId: string;
  fromSystemId: string;
  toSystemId: string;
  hops: number;
};

export type MapContextPick = {
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  systemId: string | null;
  fleetId: string | null;
  legionId: string | null;
  linkId: string | null;
};

interface MapCanvasProps {
  mode?: "editor" | "viewer";
  readModel?: () => MapViewModel;
  onModelSubscribe?: (cb: () => void) => () => void;
  onSystemClick?: (systemId: string | null) => void;
  onFleetClick?: (fleetId: string) => void;
  onLegionClick?: (legionId: string) => void;
  /** Viewer: only these faction's units can be dragged to order a move. */
  playerFactionId?: string | null;
  /** Viewer: drop after drag → submit move order (editor relocates in-store). */
  onUnitDrop?: (drop: MapUnitDropPayload) => void;
  /** Viewer: highlight own unit while dragging (no sheet). */
  onUnitDragStart?: (kind: "fleet" | "legion", unitId: string) => void;
  /** Viewer RMB menu (editor uses worldStore contextMenu). */
  onViewerContextMenu?: (pick: MapContextPick) => void;
  /** Viewer: double-click system → dive into system view. */
  onSystemOpen?: (systemId: string) => void;
  interactive?: boolean;
  apiRef?: MutableRefObject<MapCanvasApi | null>;
}

export function MapCanvas({
  mode = "editor",
  readModel,
  onModelSubscribe,
  onSystemClick,
  onFleetClick,
  onLegionClick,
  playerFactionId = null,
  onUnitDrop,
  onUnitDragStart,
  onViewerContextMenu,
  onSystemOpen,
  interactive = true,
  apiRef,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldLayerRef = useRef<Container | null>(null);
  const tableFloorGRef = useRef<Graphics | null>(null);
  const ambientGRef = useRef<Graphics | null>(null);
  const territoryGRef = useRef<Graphics | null>(null);
  const territoryBorderGRef = useRef<Graphics | null>(null);
  const sectorsGRef = useRef<Graphics | null>(null);
  const territoryFpRef = useRef<string>("");
  const diplomacyGRef = useRef<Graphics | null>(null);
  const linksGRef = useRef<Graphics | null>(null);
  const systemsGRef = useRef<Graphics | null>(null);
  const fleetsGRef = useRef<Graphics | null>(null);
  const legionsGRef = useRef<Graphics | null>(null);
  const ordersGRef = useRef<Graphics | null>(null);
  const labelsRef = useRef<Container | null>(null);
  const brushGRef = useRef<Graphics | null>(null);
  const dirtyRef = useRef(true);
  const perfTierRef = useRef<PerfTier>("full");
  const lastRedrawMsRef = useRef(0);
  const zoomGestureRef = useRef(false);
  const zoomSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const territoryLayerRef = useRef<Container | null>(null);
  const pinchRef = useRef<{
    dist: number;
    scale: number;
    midX: number;
    midY: number;
  } | null>(null);

  const strokeRef = useRef<Point[]>([]);
  const drawingRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);
  const unitDragRef = useRef<{
    kind: "fleet" | "legion";
    id: string;
    moved: boolean;
    startX: number;
    startY: number;
    startScreenX: number;
    startScreenY: number;
    pointerId: number | null;
  } | null>(null);
  const longPressRef = useRef<{
    timer: number;
    sx: number;
    sy: number;
    fired: boolean;
  } | null>(null);
  const multiDragRef = useRef<{
    ids: string[];
    lastX: number;
    lastY: number;
  } | null>(null);
  const marqueeRef = useRef<{
    active: boolean;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    additive: boolean;
  } | null>(null);
  const lastPointerWorldRef = useRef<Point>({ x: 0, y: 0 });
  const panRef = useRef<{
    active: boolean;
    lx: number;
    ly: number;
    pendingSystemId?: string | null;
    startX?: number;
    startY?: number;
  }>({ active: false, lx: 0, ly: 0 });
  const labelMapRef = useRef<Map<string, Text>>(new Map());
  const fleetStackLabelMapRef = useRef<Map<string, Text>>(new Map());
  const emblemMapRef = useRef<Map<string, Sprite>>(new Map());
  const emblemLoadingRef = useRef<Set<string>>(new Set());
  const lastClickRef = useRef<{ id: string; t: number } | null>(null);
  const animRef = useRef<AnimClock>(makeAnim(0));
  const lastDtRef = useRef(0);
  const iconOverlayRef = useRef<MapIconOverlay | null>(null);
  const battleFxRef = useRef<BattleParticleField | null>(null);
  const dragHintLabelRef = useRef<Text | null>(null);
  const readModelRef = useRef(readModel);
  const onSystemClickRef = useRef(onSystemClick);
  const onFleetClickRef = useRef(onFleetClick);
  const onLegionClickRef = useRef(onLegionClick);
  const onUnitDropRef = useRef(onUnitDrop);
  const onUnitDragStartRef = useRef(onUnitDragStart);
  const onViewerContextMenuRef = useRef(onViewerContextMenu);
  const onSystemOpenRef = useRef(onSystemOpen);
  const playerFactionIdRef = useRef(playerFactionId);
  const onModelSubscribeRef = useRef(onModelSubscribe);
  const apiRefInternal = useRef(apiRef);
  readModelRef.current = readModel;
  onSystemClickRef.current = onSystemClick;
  onFleetClickRef.current = onFleetClick;
  onLegionClickRef.current = onLegionClick;
  onUnitDropRef.current = onUnitDrop;
  onUnitDragStartRef.current = onUnitDragStart;
  onViewerContextMenuRef.current = onViewerContextMenu;
  onSystemOpenRef.current = onSystemOpen;
  playerFactionIdRef.current = playerFactionId;
  onModelSubscribeRef.current = onModelSubscribe;
  apiRefInternal.current = apiRef;

  const defaultRead = (): MapViewModel => {
    const s = useWorldStore.getState();
    // Editor FoW: slice systems like a player when GM omniscient is off.
    const world =
      mode === "editor"
        ? resolveEditorViewWorld(s.world, {
            activeFactionId: s.activeFactionId,
            gmOmniscientView: s.gmOmniscientView,
          })
        : s.world;
    return {
      world,
      selectedSystemId: s.selectedSystemId,
      selectedSystemIds: s.selectedSystemIds,
      selectedFleetId: s.selectedFleetId,
      selectedLegionId: s.selectedLegionId,
      selectedLinkId: s.selectedLinkId,
      selectedSectorId: s.selectedSectorId,
      linkDraftFromId: s.linkDraftFromId,
      sectorDraftPoints: s.sectorDraftPoints,
      showLinks: s.showLinks,
      showOwnership: s.showOwnership,
      showTerritory: s.showTerritory,
      showSectors: s.showSectors,
      showFactionLabels: s.showFactionLabels,
      showLabels: s.showLabels,
      showFleets: s.showFleets,
      showLegions: s.showLegions,
      showOrders: s.showOrders,
      showDiplomacy: s.showDiplomacy,
      showFogPreview: s.showFogPreview,
      gmOmniscientView: s.gmOmniscientView,
      fogMaskPreview: s.fogMaskPreview,
      showJumpRange: s.showJumpRange,
      showSupply: s.showSupply,
      showCaravans: s.showCaravans,
      showBlockades: s.showBlockades,
      showDeadZones: s.showDeadZones,
      showTraffic: s.showTraffic,
      showQuests: s.showQuests,
      activeFactionId: s.activeFactionId,
    };
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let ready = false;
    const app = new Application();
    const getModel = () => readModelRef.current?.() ?? defaultRead();

    const safeDestroy = () => {
      if (zoomSettleTimerRef.current) {
        clearTimeout(zoomSettleTimerRef.current);
        zoomSettleTimerRef.current = null;
      }
      zoomGestureRef.current = false;
      try {
        if (ready && app.renderer) {
          app.destroy(true, { children: true });
        }
      } catch {
        /* ignore */
      }
      worldLayerRef.current = null;
      territoryLayerRef.current = null;
      tableFloorGRef.current = null;
      ambientGRef.current = null;
      territoryGRef.current = null;
      territoryBorderGRef.current = null;
      sectorsGRef.current = null;
      territoryFpRef.current = "";
      diplomacyGRef.current = null;
      linksGRef.current = null;
      systemsGRef.current = null;
      fleetsGRef.current = null;
      legionsGRef.current = null;
      ordersGRef.current = null;
      labelsRef.current = null;
      brushGRef.current = null;
      try {
        iconOverlayRef.current?.destroy();
      } catch {
        /* ignore */
      }
      try {
        battleFxRef.current?.destroy();
      } catch {
        /* ignore */
      }
      iconOverlayRef.current = null;
      battleFxRef.current = null;
    };

    const markDirty = () => {
      dirtyRef.current = true;
    };

    const clearZoomSettleTimer = () => {
      if (zoomSettleTimerRef.current) {
        clearTimeout(zoomSettleTimerRef.current);
        zoomSettleTimerRef.current = null;
      }
    };

    const endZoomGesture = () => {
      zoomGestureRef.current = false;
      clearZoomSettleTimer();
      dirtyRef.current = true;
    };

    const noteZoomChanged = () => {
      const gfx = resolveGraphics(getModel(), perfTierRef.current);
      if (gfx.liveZoomRebuild) {
        zoomGestureRef.current = false;
        dirtyRef.current = true;
        return;
      }
      // Scale already applied — rebuild LOD/labels after the gesture settles.
      zoomGestureRef.current = true;
      clearZoomSettleTimer();
      zoomSettleTimerRef.current = setTimeout(() => {
        zoomSettleTimerRef.current = null;
        endZoomGesture();
      }, 150);
    };

    const zoomAtScreen = (sx: number, sy: number, factor: number) => {
      const layer = worldLayerRef.current;
      if (!layer) return;
      const next = Math.min(4.5, Math.max(0.12, layer.scale.x * factor));
      const before = layer.toLocal({ x: sx, y: sy });
      layer.scale.set(next);
      const after = layer.toLocal({ x: sx, y: sy });
      layer.x += (after.x - before.x) * next;
      layer.y += (after.y - before.y) * next;
      noteZoomChanged();
    };

    (async () => {
      try {
      const bootModel = getModel();
      const tier = resolvePerfTier(mode, bootModel.perfMode);
      perfTierRef.current = tier;
      dirtyRef.current = true;

      const softOrLite = tier !== "full";
      const bare = tier === "bare";
      await app.init({
        resizeTo: host,
        background: TABLE.void,
        antialias: tier === "full",
        resolution:
          softOrLite || bare
            ? 1
            : Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: !bare && tier === "full",
        preference: "webgl",
        powerPreference: softOrLite ? "low-power" : "high-performance",
      });
      ready = true;

      registerMapPngExporter(async () => {
        try {
          const extract = app.renderer.extract;
          if (!extract) return null;
          // Full stage (table + map) — avoids black WebGL buffer dump
          const dataUrl = await extract.base64({
            target: app.stage,
            format: "png",
          });
          return dataUrl || null;
        } catch (err) {
          console.warn("[GMap] extract.base64 failed", err);
          return null;
        }
      });
      if (cancelled) {
        safeDestroy();
        return;
      }

      host.appendChild(app.canvas);
      app.canvas.style.touchAction = "none";
      app.canvas.style.userSelect = "none";
      (app.canvas.style as CSSStyleDeclaration & {
        webkitUserSelect?: string;
        webkitTouchCallout?: string;
      }).webkitUserSelect = "none";
      (app.canvas.style as CSSStyleDeclaration & {
        webkitTouchCallout?: string;
      }).webkitTouchCallout = "none";
      if (bare) app.ticker.maxFPS = 15;
      else if (tier === "lite") app.ticker.maxFPS = 30;
      else if (tier === "soft") app.ticker.maxFPS = 45;

      const worldLayer = new Container();
      worldLayerRef.current = worldLayer;

      const syncRendererSize = () => {
        const w = Math.max(1, host.clientWidth || 0);
        const h = Math.max(1, host.clientHeight || 0);
        if (w < 2 || h < 2) return false;
        if (app.renderer.width !== w || app.renderer.height !== h) {
          app.renderer.resize(w, h);
        }
        return true;
      };

      const applyFit = () => {
        if (!syncRendererSize()) return;
        fitSystemsInView(
          worldLayer,
          getModel().world.systems,
          app.screen.width,
          app.screen.height,
          mode === "viewer" ? 0.08 : 0.12,
        );
        dirtyRef.current = true;
      };

      const tableFloorG = new Graphics();
      const ambientG = new Graphics();
      const territoryLayer = new Container();
      territoryLayerRef.current = territoryLayer;
      const territoryG = new Graphics();
      territoryLayer.addChild(territoryG);
      const bootGfx = resolveGraphics(bootModel, tier);
      // Soft blur when glow enabled (quality / quality_mobile)
      if (bootGfx.territoryGlow && (tier === "full" || tier === "soft")) {
        territoryLayer.filters = [
          new BlurFilter({ strength: tier === "full" ? 10 : 6, quality: 2 }),
        ];
      }
      const territoryBorderG = new Graphics();
      const sectorsG = new Graphics();
      const diplomacyG = new Graphics();
      const linksG = new Graphics();
      const systemsG = new Graphics();
      const fleetsG = new Graphics();
      const legionsG = new Graphics();
      const ordersG = new Graphics();
      const labels = new Container();
      const brushG = new Graphics();

      if (!bare) {
        await ensureMapIconsLoaded();
      }
      if (cancelled) {
        safeDestroy();
        return;
      }

      const iconOverlay = bare ? null : new MapIconOverlay();
      const battleFx = bare ? null : new BattleParticleField(Texture.WHITE);
      battleFx?.setEnabled(
        (tier === "full" || tier === "soft") && bootGfx.battleFx,
      );
      iconOverlayRef.current = iconOverlay;
      battleFxRef.current = battleFx;

      tableFloorGRef.current = tableFloorG;
      ambientGRef.current = ambientG;
      territoryGRef.current = territoryG;
      territoryBorderGRef.current = territoryBorderG;
      sectorsGRef.current = sectorsG;
      diplomacyGRef.current = diplomacyG;
      linksGRef.current = linksG;
      systemsGRef.current = systemsG;
      fleetsGRef.current = fleetsG;
      legionsGRef.current = legionsG;
      ordersGRef.current = ordersG;
      labelsRef.current = labels;
      brushGRef.current = brushG;

      worldLayer.addChild(
        tableFloorG,
        ambientG,
        territoryLayer,
        territoryBorderG,
        sectorsG,
        linksG,
        diplomacyG,
        ordersG,
        systemsG,
      );
      if (iconOverlay) worldLayer.addChild(iconOverlay.root);
      if (battleFx) worldLayer.addChild(battleFx.container);
      worldLayer.addChild(fleetsG, legionsG, labels, brushG);
      app.stage.addChild(worldLayer);

      applyFit();
      requestAnimationFrame(() => {
        applyFit();
        requestAnimationFrame(() => {
          applyFit();
          redrawAll();
        });
      });

      const ro = new ResizeObserver(() => {
        const prevW = app.screen.width;
        const prevH = app.screen.height;
        if (!syncRendererSize()) return;
        // Re-fit only when host gains real size from 0 (mobile flex settle)
        if ((prevW < 8 || prevH < 8) && app.screen.width >= 8) {
          applyFit();
        }
        dirtyRef.current = true;
      });
      ro.observe(host);

      const focusSystemInView = (systemId: string) => {
        const sys = getModel().world.systems.find((s) => s.id === systemId);
        if (!sys || !worldLayerRef.current) return;
        const layer = worldLayerRef.current;
        const iso = toIso(sys.x, sys.y);
        const scale = layer.scale.x || 1;
        layer.position.set(
          app.screen.width / 2 - iso.x * scale,
          app.screen.height / 2 - iso.y * scale,
        );
        dirtyRef.current = true;
      };

      const api: MapCanvasApi = {
        zoomBy: (factor) => {
          zoomAtScreen(app.screen.width / 2, app.screen.height / 2, factor);
        },
        resetView: () => {
          applyFit();
        },
        focusSystem: focusSystemInView,
      };
      if (apiRefInternal.current) apiRefInternal.current.current = api;

      /** Pointer → logical map coords (pre-iso). */
      const toWorld = (e: FederatedPointerEvent): Point => {
        const local = worldLayer.toLocal(e.global);
        return fromIso(local.x, local.y);
      };

      /** Grow hitboxes in iso-space when zoomed out so fingers can still hit. */
      const isoHitR = (base: number, minPx = MIN_TOUCH_HIT_PX) => {
        const scale = worldLayer.scale.x || 1;
        return Math.max(base, minPx / Math.max(scale, 0.08));
      };

      const clearLongPress = () => {
        const lp = longPressRef.current;
        if (lp?.timer) window.clearTimeout(lp.timer);
        longPressRef.current = null;
      };

      const releaseUnitPointer = () => {
        const drag = unitDragRef.current;
        if (drag?.pointerId != null) {
          try {
            if (app.canvas.hasPointerCapture?.(drag.pointerId)) {
              app.canvas.releasePointerCapture(drag.pointerId);
            }
          } catch {
            /* ignore */
          }
        }
      };

      const captureUnitPointer = (e: FederatedPointerEvent) => {
        const native = e.nativeEvent as PointerEvent | undefined;
        const pid = native?.pointerId;
        if (pid == null || !app.canvas.setPointerCapture) return null;
        try {
          app.canvas.setPointerCapture(pid);
          return pid;
        } catch {
          return null;
        }
      };

      const buildViewerPick = (
        e: FederatedPointerEvent,
        worldPos: Point,
        model: MapViewModel,
      ): MapContextPick => {
        const fleetHit = findFleetAt(worldPos, model);
        const legionHit = findLegionAt(worldPos, model);
        const hit = findSystemAt(worldPos, model.world.systems);
        const rect = app.canvas.getBoundingClientRect();
        return {
          screenX: rect.left + e.global.x,
          screenY: rect.top + e.global.y,
          worldX: worldPos.x,
          worldY: worldPos.y,
          systemId: hit?.id ?? null,
          fleetId: fleetHit,
          legionId: legionHit,
          linkId: null,
        };
      };

      const armLongPress = (e: FederatedPointerEvent, worldPos: Point) => {
        clearLongPress();
        if (mode !== "viewer") return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        const sx = e.global.x;
        const sy = e.global.y;
        const timer = window.setTimeout(() => {
          const lp = longPressRef.current;
          if (!lp || lp.fired) return;
          lp.fired = true;
          releaseUnitPointer();
          unitDragRef.current = null;
          panRef.current.active = false;
          onViewerContextMenuRef.current?.(
            buildViewerPick(e, worldPos, getModel()),
          );
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
          dirtyRef.current = true;
        }, LONG_PRESS_MS);
        longPressRef.current = { timer, sx, sy, fired: false };
      };

      const findSystemAt = (
        p: Point,
        systems: StarSystem[],
        hitR?: number,
      ): StarSystem | null => {
        const r = hitR ?? isoHitR(SYSTEM_HIT_R, 40);
        const tip = toIso(p.x, p.y);
        let best: StarSystem | null = null;
        let bestD = r * r;
        for (const s of systems) {
          const sp = toIso(s.x, s.y);
          const dx = tip.x - sp.x;
          const dy = (tip.y - sp.y) * 1.6;
          const d = dx * dx + dy * dy;
          if (d <= bestD) {
            bestD = d;
            best = s;
          }
        }
        return best;
      };

      const findFleetAt = (p: Point, model: MapViewModel): string | null => {
        if (model.showFleets === false) return null;
        const tip = toIso(p.x, p.y);
        const byId = new Map(model.world.systems.map((s) => [s.id, s]));
        const bySystem = new Map<string, typeof model.world.fleets>();
        for (const f of model.world.fleets) {
          const list = bySystem.get(f.systemId) ?? [];
          list.push(f);
          bySystem.set(f.systemId, list);
        }
        let bestId: string | null = null;
        let bestD = isoHitR(FLEET_HIT_R) ** 2;
        const anim = animRef.current;
        for (const [sysId, fleets] of bySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          for (const slot of layoutFleetsAroundSystem(
            sys,
            fleets,
            anim,
            model.selectedFleetId,
          )) {
            const d = (slot.x - tip.x) ** 2 + (slot.y - tip.y) ** 2;
            if (d <= bestD) {
              bestD = d;
              // Prefer explicitly selected fleet in stack if present
              bestId =
                (model.selectedFleetId &&
                slot.fleetIds?.includes(model.selectedFleetId)
                  ? model.selectedFleetId
                  : null) ?? slot.fleet.id;
            }
          }
        }
        return bestId;
      };

      const findLegionAt = (p: Point, model: MapViewModel): string | null => {
        if (model.showLegions === false) return null;
        const tip = toIso(p.x, p.y);
        const byId = new Map(model.world.systems.map((s) => [s.id, s]));
        const bySystem = new Map<string, typeof model.world.legions>();
        for (const l of model.world.legions) {
          const list = bySystem.get(l.systemId) ?? [];
          list.push(l);
          bySystem.set(l.systemId, list);
        }
        let bestId: string | null = null;
        let bestD = isoHitR(LEGION_HIT_R) ** 2;
        const anim = animRef.current;
        for (const [sysId, legs] of bySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          for (const slot of layoutLegionsAroundSystem(sys, legs, anim)) {
            const d = (slot.x - tip.x) ** 2 + (slot.y - tip.y) ** 2;
            if (d <= bestD) {
              bestD = d;
              bestId = slot.legion.id;
            }
          }
        }
        return bestId;
      };

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      if (interactive) {
        app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
          const worldPos = toWorld(e);
          const model = getModel();

          // Middle mouse always pans; Shift+empty also pans (Shift+system = fleet route)
          if (e.button === 1) {
            panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            return;
          }

          // RMB: native contextmenu handler below (Pixi button===2 is flaky)
          if (e.button === 2) {
            return;
          }

          if (mode === "viewer") {
            const fid = playerFactionIdRef.current;
            const fleetId = findFleetAt(worldPos, model);
            if (fleetId) {
              const fleet = model.world.fleets.find((f) => f.id === fleetId);
              // Defer click until pointerup — drag must not open the sheet.
              if (fleet && fid && fleet.factionId === fid) {
                const pointerId = captureUnitPointer(e);
                unitDragRef.current = {
                  kind: "fleet",
                  id: fleetId,
                  moved: false,
                  startX: worldPos.x,
                  startY: worldPos.y,
                  startScreenX: e.global.x,
                  startScreenY: e.global.y,
                  pointerId,
                };
                lastPointerWorldRef.current = worldPos;
                onUnitDragStartRef.current?.("fleet", fleetId);
                armLongPress(e, worldPos);
                dirtyRef.current = true;
              } else {
                onFleetClickRef.current?.(fleetId);
                armLongPress(e, worldPos);
              }
              return;
            }
            const legionId = findLegionAt(worldPos, model);
            if (legionId) {
              const legion = model.world.legions.find((l) => l.id === legionId);
              if (legion && fid && legion.factionId === fid) {
                const pointerId = captureUnitPointer(e);
                unitDragRef.current = {
                  kind: "legion",
                  id: legionId,
                  moved: false,
                  startX: worldPos.x,
                  startY: worldPos.y,
                  startScreenX: e.global.x,
                  startScreenY: e.global.y,
                  pointerId,
                };
                lastPointerWorldRef.current = worldPos;
                onUnitDragStartRef.current?.("legion", legionId);
                armLongPress(e, worldPos);
                dirtyRef.current = true;
              } else {
                onLegionClickRef.current?.(legionId);
                armLongPress(e, worldPos);
              }
              return;
            }
            const hit = findSystemAt(worldPos, model.world.systems);
            if (hit) {
              armLongPress(e, worldPos);
              const now = performance.now();
              const last = lastClickRef.current;
              // Double-tap open — only for mouse; touch uses long-press menu / explicit dive.
              if (
                e.pointerType === "mouse" &&
                last &&
                last.id === hit.id &&
                now - last.t < 380
              ) {
                onSystemOpenRef.current?.(hit.id);
                lastClickRef.current = null;
              } else {
                lastClickRef.current = { id: hit.id, t: now };
                // Defer system click to pointerup for touch (avoid fighting drag/pan).
                if (e.pointerType === "touch" || e.pointerType === "pen") {
                  panRef.current = {
                    active: true,
                    lx: e.global.x,
                    ly: e.global.y,
                    pendingSystemId: hit.id,
                    startX: e.global.x,
                    startY: e.global.y,
                  };
                } else {
                  onSystemClickRef.current?.(hit.id);
                }
              }
            } else {
              clearLongPress();
              lastClickRef.current = null;
              onSystemClickRef.current?.(null);
              panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            }
            return;
          }

          const state = useWorldStore.getState();
          state.setContextMenu(null);
          // Hit-test against the same sliced view the canvas draws (FoW).
          const viewSystems = getModel().world.systems;
          const viewLinks = getModel().world.links;

          if (state.pendingUnitOrder) {
            const target = findSystemAt(worldPos, viewSystems);
            if (target) {
              state.applyPendingUnitOrder(target.id);
              return;
            }
            // empty click cancels targeting
            state.clearPendingUnitOrder();
            return;
          }

          if (state.pendingFleetCloneId) {
            const target = findSystemAt(worldPos, viewSystems);
            if (target) {
              state.cloneFleetToSystem(target.id);
              return;
            }
            state.clearPendingFleetClone();
            return;
          }

          if (state.showQuests) {
            for (const s of viewSystems) {
              const qs = questsAtSystem(state.world, s.id);
              if (
                (qs.length > 0 || s.questId || s.poiType === "quest") &&
                questMarkerHit(worldPos.x, worldPos.y, s)
              ) {
                const qid = s.questId ?? qs[0]?.id;
                if (qid) {
                  state.setOpenQuestId(qid);
                  return;
                }
              }
            }
          }

          if (state.pendingCapitalFactionId) {
            const capitalHit = findSystemAt(worldPos, viewSystems);
            if (capitalHit) {
              state.setFactionCapital(
                state.pendingCapitalFactionId,
                capitalHit.id,
              );
              return;
            }
            panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            return;
          }

          if (state.tool === "brush") {
            drawingRef.current = true;
            strokeRef.current = [worldPos];
            return;
          }

          if (state.tool === "add_system" || state.tool === "add_corridor") {
            state.addSystemAt(worldPos.x, worldPos.y);
            return;
          }

          if (state.tool === "draw_sector") {
            if (e.detail >= 2 || e.shiftKey) {
              state.finishSectorDraft();
              return;
            }
            state.pushSectorDraftPoint(worldPos.x, worldPos.y);
            return;
          }

          const hit = findSystemAt(worldPos, viewSystems);
          const fleetHit = findFleetAt(worldPos, getModel());
          const legionHit = findLegionAt(worldPos, getModel());
          const linkHit = findLinkAt(worldPos, viewLinks, viewSystems);

          if (state.tool === "add_link") {
            if (hit) {
              if (!state.linkDraftFromId) {
                state.setLinkDraftFrom(hit.id);
                state.selectSystem(hit.id);
                state.selectLink(null);
              } else {
                state.addOrToggleLink(state.linkDraftFromId, hit.id);
              }
              return;
            }
            if (linkHit) {
              state.selectLink(linkHit.id);
              state.setLinkDraftFrom(null);
              state.selectSystem(null);
              state.selectFleet(null);
              return;
            }
            state.setLinkDraftFrom(null);
            state.selectLink(null);
            panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            return;
          }

          if (state.tool === "delete") {
            if (fleetHit) state.deleteFleet(fleetHit);
            else if (legionHit) state.deleteLegion(legionHit);
            else if (hit) {
              const ids =
                state.selectedSystemIds.includes(hit.id) &&
                state.selectedSystemIds.length > 1
                  ? state.selectedSystemIds
                  : [hit.id];
              state.deleteSystems(ids);
            } else if (linkHit) state.deleteLink(linkHit.id);
            else if (state.selectedSystemIds.length > 1)
              state.deleteSystems(state.selectedSystemIds);
            else if (state.selectedLinkId) state.deleteLink(state.selectedLinkId);
            else if (state.selectedSectorId)
              state.deleteSector(state.selectedSectorId);
            return;
          }

          if (state.tool === "paint_faction") {
            if (hit) {
              const ids =
                state.selectedSystemIds.includes(hit.id) &&
                state.selectedSystemIds.length > 1
                  ? state.selectedSystemIds
                  : [hit.id];
              state.paintFactionMany(ids);
            }
            return;
          }

          if (state.tool === "paint_coowner") {
            if (hit) {
              const ids =
                state.selectedSystemIds.includes(hit.id) &&
                state.selectedSystemIds.length > 1
                  ? state.selectedSystemIds
                  : [hit.id];
              state.paintCoOwnerMany(ids);
            }
            return;
          }

          if (state.tool === "mark_contested") {
            if (hit) {
              const ids =
                state.selectedSystemIds.includes(hit.id) &&
                state.selectedSystemIds.length > 1
                  ? state.selectedSystemIds
                  : [hit.id];
              state.toggleContestedMany(ids);
            }
            return;
          }

          if (state.tool in POI_PAINT_TOOLS) {
            if (hit) state.paintPoiWithActiveTool(hit.id);
            return;
          }

          if (state.tool === "paint_resource") {
            if (hit) state.paintResourceOnSystem(hit.id);
            return;
          }

          if (state.tool === "reveal") {
            if (hit) state.revealSystem(hit.id);
            return;
          }

          if (state.tool === "fog_paint" || state.tool === "fog_erase") {
            if (!hit) return;
            const fac = state.activeFactionId;
            if (!fac) return;
            const token =
              (
                window as unknown as { __GMAP_MASTER_TOKEN?: string }
              ).__GMAP_MASTER_TOKEN || "master2142";
            void fetch("/api/fog/paint", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Master-Token": token,
              },
              body: JSON.stringify({
                factionId: fac,
                systemIds: [hit.id],
                mode: state.tool === "fog_erase" ? "erase" : "paint",
              }),
            }).then(async (res) => {
              if (!res.ok) return;
              const data = (await res.json()) as {
                fog?: { masks?: Record<string, string[]> };
              };
              useWorldStore.getState().setFogMaskPreview(
                data.fog?.masks?.[fac] ?? [],
              );
            });
            return;
          }

          if (state.tool === "consequence_paint") {
            if (!hit) return;
            const presetId =
              useWorldStore.getState().activeConsequencePresetId;
            if (!presetId) return;
            const token =
              (
                window as unknown as { __GMAP_MASTER_TOKEN?: string }
              ).__GMAP_MASTER_TOKEN || "master2142";
            const ids =
              state.selectedSystemIds.includes(hit.id) &&
              state.selectedSystemIds.length > 1
                ? state.selectedSystemIds
                : [hit.id];
            void fetch("/api/narrative/paint", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Master-Token": token,
              },
              body: JSON.stringify({ presetId, systemIds: ids }),
            }).then(async (res) => {
              if (!res.ok) return;
              // Also stamp local draft for immediate feedback
              const st = useWorldStore.getState();
              for (const id of ids) {
                if (presetId.includes("refugee") || presetId === "evac_camp") {
                  st.applySystemPoi(id, "refugees");
                } else if (presetId === "psi_lock" || presetId === "locked_world") {
                  st.applySystemPoi(id, "quarantine");
                } else if (presetId === "front_depot") {
                  st.applySystemPoi(id, "depot");
                } else if (presetId === "propaganda_push") {
                  st.applySystemPoi(id, "propaganda");
                } else if (
                  presetId === "after_battle" ||
                  presetId === "scar_ruin" ||
                  presetId === "war_scar"
                ) {
                  st.applySystemPoi(id, "debris");
                }
              }
            });
            return;
          }

          if (state.tool === "place_fleet") {
            if (hit) state.placeFleetOnSystem(hit.id);
            return;
          }

          if (state.tool === "place_legion") {
            if (hit) state.placeLegionOnSystem(hit.id);
            return;
          }

          // Fleet / legion: click to select, drag onto another system → relocates in world data
          if (state.tool === "select" && fleetHit) {
            state.selectFleet(fleetHit);
            state.selectLegion(null);
            state.selectLink(null);
            state.selectSystem(
              state.world.fleets.find((f) => f.id === fleetHit)?.systemId ?? null,
            );
            unitDragRef.current = {
              kind: "fleet",
              id: fleetHit,
              moved: false,
              startX: worldPos.x,
              startY: worldPos.y,
              startScreenX: e.global.x,
              startScreenY: e.global.y,
              pointerId: captureUnitPointer(e),
            };
            lastPointerWorldRef.current = worldPos;
            dirtyRef.current = true;
            return;
          }

          if (state.tool === "select" && legionHit) {
            state.selectLegion(legionHit);
            state.selectFleet(null);
            state.selectLink(null);
            state.selectSystem(
              state.world.legions.find((l) => l.id === legionHit)?.systemId ??
                null,
            );
            unitDragRef.current = {
              kind: "legion",
              id: legionHit,
              moved: false,
              startX: worldPos.x,
              startY: worldPos.y,
              startScreenX: e.global.x,
              startScreenY: e.global.y,
              pointerId: captureUnitPointer(e),
            };
            lastPointerWorldRef.current = worldPos;
            dirtyRef.current = true;
            return;
          }

          if (hit) {
            if (state.selectedFleetId && e.shiftKey) {
              state.setFleetRouteHop(state.selectedFleetId, hit.id);
              return;
            }
            const additive = e.ctrlKey || e.metaKey;
            if (additive) {
              state.selectSystem(hit.id, "toggle");
              state.selectLink(null);
              state.selectSector(null);
              state.selectFleet(null);
              state.selectLegion(null);
            } else if (
              state.selectedSystemIds.length > 1 &&
              state.selectedSystemIds.includes(hit.id)
            ) {
              multiDragRef.current = {
                ids: [...state.selectedSystemIds],
                lastX: worldPos.x,
                lastY: worldPos.y,
              };
              state.selectLink(null);
              state.selectSector(null);
            } else {
              state.selectSystem(hit.id, "replace");
              state.selectLink(null);
              state.selectSector(null);
              state.selectFleet(null);
              state.selectLegion(null);
              draggingIdRef.current = hit.id;
            }
            const now = performance.now();
            const last = lastClickRef.current;
            if (
              !additive &&
              last &&
              last.id === hit.id &&
              now - last.t < 380
            ) {
              state.setDossierSystem(hit.id);
              lastClickRef.current = null;
            } else {
              lastClickRef.current = { id: hit.id, t: now };
            }
          } else if (linkHit && state.tool === "select") {
            state.selectLink(linkHit.id);
            state.clearSystemSelection();
            state.selectFleet(null);
            state.selectLegion(null);
            state.selectSector(null);
          } else if (state.tool === "select") {
            if (e.shiftKey) {
              panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            } else {
              const tip = toIso(worldPos.x, worldPos.y);
              marqueeRef.current = {
                active: true,
                x0: tip.x,
                y0: tip.y,
                x1: tip.x,
                y1: tip.y,
                additive: e.ctrlKey || e.metaKey,
              };
              if (!(e.ctrlKey || e.metaKey)) {
                state.clearSystemSelection();
                state.selectFleet(null);
                state.selectLegion(null);
                state.selectLink(null);
                state.selectSector(null);
              }
              dirtyRef.current = true;
            }
          } else {
            panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
          }
        });

        app.stage.on("pointermove", (e: FederatedPointerEvent) => {
          const lp = longPressRef.current;
          if (lp && !lp.fired) {
            if (
              Math.hypot(e.global.x - lp.sx, e.global.y - lp.sy) > DRAG_START_PX
            ) {
              clearLongPress();
            }
          }

          if (unitDragRef.current) {
            const p = toWorld(e);
            lastPointerWorldRef.current = p;
            const d = unitDragRef.current;
            if (
              !d.moved &&
              Math.hypot(
                e.global.x - d.startScreenX,
                e.global.y - d.startScreenY,
              ) > DRAG_START_PX
            ) {
              d.moved = true;
              clearLongPress();
              panRef.current.active = false;
            }
            dirtyRef.current = true;
            return;
          }

          if (panRef.current.active && worldLayerRef.current) {
            const dx = e.global.x - panRef.current.lx;
            const dy = e.global.y - panRef.current.ly;
            panRef.current.lx = e.global.x;
            panRef.current.ly = e.global.y;
            // Finger slid — cancel pending system tap.
            if (
              panRef.current.pendingSystemId &&
              panRef.current.startX != null &&
              panRef.current.startY != null &&
              Math.hypot(
                e.global.x - panRef.current.startX,
                e.global.y - panRef.current.startY,
              ) > DRAG_START_PX
            ) {
              panRef.current.pendingSystemId = null;
              clearLongPress();
            }
            worldLayerRef.current.x += dx;
            worldLayerRef.current.y += dy;
            return;
          }

          if (mode !== "editor") return;

          if (multiDragRef.current) {
            const p = toWorld(e);
            const md = multiDragRef.current;
            const dx = p.x - md.lastX;
            const dy = p.y - md.lastY;
            if (dx !== 0 || dy !== 0) {
              useWorldStore.getState().moveSystemsBy(md.ids, dx, dy);
              md.lastX = p.x;
              md.lastY = p.y;
            }
            return;
          }

          if (marqueeRef.current?.active) {
            const p = toWorld(e);
            const tip = toIso(p.x, p.y);
            marqueeRef.current.x1 = tip.x;
            marqueeRef.current.y1 = tip.y;
            dirtyRef.current = true;
            return;
          }

          if (drawingRef.current) {
            const p = toWorld(e);
            const stroke = strokeRef.current;
            const last = stroke[stroke.length - 1];
            if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 4) {
              stroke.push(p);
              redrawBrushPreview(stroke);
            }
            return;
          }

          if (draggingIdRef.current) {
            const p = toWorld(e);
            useWorldStore.getState().moveSystem(draggingIdRef.current, p.x, p.y);
          }
        });

        const endPointer = (_e?: FederatedPointerEvent) => {
          const longFired = !!longPressRef.current?.fired;
          clearLongPress();

          if (unitDragRef.current) {
            const drag = unitDragRef.current;
            releaseUnitPointer();
            unitDragRef.current = null;
            if (drag.moved && !longFired) {
              const modelNow = getModel();
              const target = findSystemAt(
                lastPointerWorldRef.current,
                modelNow.world.systems,
                isoHitR(SYSTEM_DROP_R, 56),
              );
              if (target) {
                const unit =
                  drag.kind === "fleet"
                    ? modelNow.world.fleets.find((f) => f.id === drag.id)
                    : modelNow.world.legions.find((l) => l.id === drag.id);
                const fromSystemId = unit?.systemId ?? "";
                const hops = hopDistance(
                  modelNow.world,
                  fromSystemId,
                  target.id,
                );
                if (mode === "viewer") {
                  if (
                    fromSystemId &&
                    fromSystemId !== target.id &&
                    Number.isFinite(hops)
                  ) {
                    onUnitDropRef.current?.({
                      kind: drag.kind,
                      unitId: drag.id,
                      fromSystemId,
                      toSystemId: target.id,
                      hops,
                    });
                  }
                } else {
                  const st = useWorldStore.getState();
                  if (drag.kind === "fleet") {
                    st.relocateFleet(drag.id, target.id);
                  } else {
                    st.relocateLegion(drag.id, target.id);
                  }
                }
              }
            } else if (mode === "viewer" && !longFired) {
              // Tap without drag → select
              if (drag.kind === "fleet") onFleetClickRef.current?.(drag.id);
              else onLegionClickRef.current?.(drag.id);
            }
            dirtyRef.current = true;
          } else if (
            mode === "viewer" &&
            !longFired &&
            panRef.current.pendingSystemId
          ) {
            const sid = panRef.current.pendingSystemId;
            panRef.current.pendingSystemId = null;
            const now = performance.now();
            const last = lastClickRef.current;
            if (last && last.id === sid && now - last.t < 420) {
              onSystemOpenRef.current?.(sid);
              lastClickRef.current = null;
            } else {
              lastClickRef.current = { id: sid, t: now };
              onSystemClickRef.current?.(sid);
            }
          }

          multiDragRef.current = null;

          if (marqueeRef.current?.active) {
            const mq = marqueeRef.current;
            marqueeRef.current = null;
            const minX = Math.min(mq.x0, mq.x1);
            const maxX = Math.max(mq.x0, mq.x1);
            const minY = Math.min(mq.y0, mq.y1);
            const maxY = Math.max(mq.y0, mq.y1);
            const area = (maxX - minX) * (maxY - minY);
            const st = useWorldStore.getState();
            if (area > 36) {
              const picked = getModel()
                .world.systems.filter((s) => {
                  const ip = toIso(s.x, s.y);
                  return (
                    ip.x >= minX &&
                    ip.x <= maxX &&
                    ip.y >= minY &&
                    ip.y <= maxY
                  );
                })
                .map((s) => s.id);
              if (mq.additive) {
                const set = new Set([...st.selectedSystemIds, ...picked]);
                st.setSelectedSystems([...set]);
              } else {
                st.setSelectedSystems(picked);
              }
            }
            brushGRef.current?.clear();
            dirtyRef.current = true;
          }

          if (drawingRef.current) {
            drawingRef.current = false;
            const stroke = strokeRef.current;
            strokeRef.current = [];
            brushGRef.current?.clear();
            if (stroke.length > 2) {
              useWorldStore.getState().applyBrushStroke(stroke);
            }
          }
          draggingIdRef.current = null;
          panRef.current.active = false;
          panRef.current.pendingSystemId = null;
        };

        app.stage.on("pointerup", endPointer);
        app.stage.on("pointerupoutside", endPointer);

        const openContextMenu = (ev: MouseEvent) => {
          ev.preventDefault();
          const layer = worldLayerRef.current;
          if (!layer) return;
          const rect = app.canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const local = layer.toLocal({ x: sx, y: sy });
          const worldPos = fromIso(local.x, local.y);
          const model = getModel();
          const fleetHit = findFleetAt(worldPos, model);
          const legionHit = findLegionAt(worldPos, model);
          const hit = findSystemAt(worldPos, model.world.systems);
          const linkHit = findLinkAt(
            worldPos,
            model.world.links,
            model.world.systems,
          );
          const pick: MapContextPick = {
            screenX: ev.clientX,
            screenY: ev.clientY,
            worldX: worldPos.x,
            worldY: worldPos.y,
            systemId: hit?.id ?? null,
            fleetId: fleetHit,
            legionId: legionHit,
            linkId:
              !fleetHit && !legionHit && !hit ? (linkHit?.id ?? null) : null,
          };
          if (mode === "viewer") {
            onViewerContextMenuRef.current?.(pick);
            return;
          }
          const state = useWorldStore.getState();
          state.setContextMenu(pick);
          if (fleetHit) {
            state.selectFleet(fleetHit);
            state.selectSystem(
              state.world.fleets.find((f) => f.id === fleetHit)?.systemId ??
                null,
            );
          } else if (legionHit) {
            state.selectLegion(legionHit);
            state.selectSystem(
              state.world.legions.find((l) => l.id === legionHit)?.systemId ??
                null,
            );
          } else if (hit) {
            state.selectSystem(hit.id);
            state.selectFleet(null);
            state.selectLegion(null);
            state.selectLink(null);
          } else if (linkHit) {
            state.selectLink(linkHit.id);
            state.selectSystem(null);
            state.selectFleet(null);
            state.selectLegion(null);
          }
        };
        app.canvas.addEventListener("contextmenu", openContextMenu);
        (
          host as HTMLDivElement & { __gmapCtxCleanup?: () => void }
        ).__gmapCtxCleanup = () => {
          app.canvas.removeEventListener("contextmenu", openContextMenu);
        };
      } else {
        app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
          panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
        });
        app.stage.on("pointermove", (e: FederatedPointerEvent) => {
          if (panRef.current.active && worldLayerRef.current) {
            const dx = e.global.x - panRef.current.lx;
            const dy = e.global.y - panRef.current.ly;
            panRef.current.lx = e.global.x;
            panRef.current.ly = e.global.y;
            worldLayerRef.current.x += dx;
            worldLayerRef.current.y += dy;
          }
        });
        app.stage.on("pointerup", () => {
          panRef.current.active = false;
        });
      }

      app.canvas.addEventListener(
        "wheel",
        (ev) => {
          ev.preventDefault();
          zoomAtScreen(ev.offsetX, ev.offsetY, ev.deltaY > 0 ? 0.9 : 1.1);
        },
        { passive: false },
      );

      const touchDist = (a: Touch, b: Touch) =>
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

      const onTouchStart = (ev: TouchEvent) => {
        if (ev.touches.length === 2) {
          panRef.current.active = false;
          panRef.current.pendingSystemId = null;
          clearLongPress();
          releaseUnitPointer();
          unitDragRef.current = null;
          const a = ev.touches[0]!;
          const b = ev.touches[1]!;
          const rect = app.canvas.getBoundingClientRect();
          pinchRef.current = {
            dist: touchDist(a, b),
            scale: worldLayer.scale.x,
            midX: (a.clientX + b.clientX) / 2 - rect.left,
            midY: (a.clientY + b.clientY) / 2 - rect.top,
          };
        }
      };

      const onTouchMove = (ev: TouchEvent) => {
        if (ev.touches.length !== 2 || !pinchRef.current) return;
        ev.preventDefault();
        const a = ev.touches[0]!;
        const b = ev.touches[1]!;
        const rect = app.canvas.getBoundingClientRect();
        const dist = touchDist(a, b);
        const midX = (a.clientX + b.clientX) / 2 - rect.left;
        const midY = (a.clientY + b.clientY) / 2 - rect.top;
        const factor =
          pinchRef.current.dist > 0 ? dist / pinchRef.current.dist : 1;
        const target = Math.min(
          4.5,
          Math.max(0.12, pinchRef.current.scale * factor),
        );
        const cur = worldLayer.scale.x;
        if (cur === 0) return;
        zoomAtScreen(midX, midY, target / cur);
        pinchRef.current = {
          dist,
          scale: worldLayer.scale.x,
          midX,
          midY,
        };
      };

      const onTouchEnd = (ev: TouchEvent) => {
        if (ev.touches.length < 2) {
          pinchRef.current = null;
          // Pinch finished — rebuild LOD once
          if (zoomGestureRef.current) endZoomGesture();
        }
      };

      app.canvas.addEventListener("touchstart", onTouchStart, {
        passive: true,
      });
      app.canvas.addEventListener("touchmove", onTouchMove, {
        passive: false,
      });
      app.canvas.addEventListener("touchend", onTouchEnd);
      app.canvas.addEventListener("touchcancel", onTouchEnd);

      app.ticker.add((ticker) => {
        const tier = perfTierRef.current;
        const dt = ticker.deltaMS / 1000;
        lastDtRef.current = dt;
        const gfx = resolveGraphics(getModel(), tier);

        // During pinch/wheel zoom: only container scale moves — no full rebuild.
        if (zoomGestureRef.current && !gfx.liveZoomRebuild) {
          if (gfx.animations && tier !== "bare") {
            animRef.current = makeAnim(animRef.current.t + dt);
          }
          return;
        }

        // Mobile / quality_mobile: pan moves container; rebuild only when dirty.
        if (tier === "bare" || tier === "lite" || tier === "soft") {
          if (tier === "bare" || !gfx.animations) {
            animRef.current = STATIC_ANIM;
          } else {
            animRef.current = makeAnim(animRef.current.t + dt);
          }
          if (!dirtyRef.current) return;
          dirtyRef.current = false;
          lastRedrawMsRef.current = performance.now();
          redrawAll();
          return;
        }

        // Desktop quality: continuous redraw for FX, but still skip while zooming.
        if (gfx.animations) {
          animRef.current = makeAnim(animRef.current.t + dt);
        } else {
          animRef.current = STATIC_ANIM;
        }
        redrawAll();
      });

      redrawAll();

      (host as HTMLDivElement & {
        __gmapTouchCleanup?: () => void;
      }).__gmapTouchCleanup = () => {
          ro.disconnect();
          app.canvas.removeEventListener("touchstart", onTouchStart);
          app.canvas.removeEventListener("touchmove", onTouchMove);
          app.canvas.removeEventListener("touchend", onTouchEnd);
          app.canvas.removeEventListener("touchcancel", onTouchEnd);
          (
            host as HTMLDivElement & { __gmapCtxCleanup?: () => void }
          ).__gmapCtxCleanup?.();
          if (apiRefInternal.current) apiRefInternal.current.current = null;
        };
      } catch (err) {
        console.error("[GMap] MapCanvas init failed", err);
      }
    })();

    const unsub =
      onModelSubscribeRef.current?.(() => {
        markDirty();
        redrawAll();
      }) ??
      useWorldStore.subscribe(() => {
        markDirty();
        redrawAll();
      });

    function redrawBrushPreview(stroke: Point[]) {
      const g = brushGRef.current;
      if (!g || stroke.length < 2) return;
      g.clear();
      const first = toIso(stroke[0]!.x, stroke[0]!.y);
      g.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.length; i++) {
        const p = toIso(stroke[i]!.x, stroke[i]!.y);
        g.lineTo(p.x, p.y);
      }
      g.stroke({ width: 22, color: 0x4cc9f0, alpha: 0.18 });
      g.moveTo(first.x, first.y);
      for (let i = 1; i < stroke.length; i++) {
        const p = toIso(stroke[i]!.x, stroke[i]!.y);
        g.lineTo(p.x, p.y);
      }
      g.stroke({ width: 2, color: 0x7bdff2, alpha: 0.75 });
    }

    function redrawAll() {
      const stFocus = useWorldStore.getState();
      const focusId = stFocus.cameraFocusSystemId;
      if (focusId && worldLayerRef.current && app.renderer) {
        const sys = stFocus.world.systems.find((s) => s.id === focusId);
        useWorldStore.setState({ cameraFocusSystemId: null });
        if (sys) {
          const layer = worldLayerRef.current;
          const iso = toIso(sys.x, sys.y);
          const scale = layer.scale.x;
          layer.position.set(
            app.screen.width / 2 - iso.x * scale,
            app.screen.height / 2 - iso.y * scale,
          );
        }
      }

      const model = getModel();
      const tableFloorG = tableFloorGRef.current;
      const ambientG = ambientGRef.current;
      const territoryG = territoryGRef.current;
      const territoryBorderG = territoryBorderGRef.current;
      const sectorsG = sectorsGRef.current;
      const diplomacyG = diplomacyGRef.current;
      const linksG = linksGRef.current;
      const systemsG = systemsGRef.current;
      const fleetsG = fleetsGRef.current;
      const legionsG = legionsGRef.current;
      const ordersG = ordersGRef.current;
      const labels = labelsRef.current;
      if (
        !linksG ||
        !systemsG ||
        !fleetsG ||
        !legionsG ||
        !ordersG ||
        !labels ||
        !ambientG ||
        !tableFloorG ||
        !territoryG ||
        !territoryBorderG ||
        !sectorsG ||
        !diplomacyG
      )
        return;

      dirtyRef.current = false;

      const {
        world,
        selectedSystemId,
        selectedFleetId,
        selectedLegionId,
        selectedLinkId,
        selectedSectorId,
        linkDraftFromId,
        sectorDraftPoints,
        showLinks,
        showOwnership,
        showTerritory,
        showSectors,
        showFactionLabels,
        showLabels,
        showFleets,
        showLegions,
        showOrders,
        showDiplomacy,
        showFogPreview,
        gmOmniscientView = true,
        fogMaskPreview,
        showJumpRange,
        showSupply,
        showCaravans,
        showBlockades,
        showDeadZones,
        showTraffic,
        showQuests,
        activeFactionId,
        perfMode,
      } = model;

      const tier = resolvePerfTier(mode, perfMode);
      perfTierRef.current = tier;
      const bare = tier === "bare";
      const gfx = resolveGraphics(model, tier);
      const anim =
        bare || !gfx.animations ? STATIC_ANIM : animRef.current;

      const tLayer = territoryLayerRef.current;
      if (tLayer) {
        const wantGlow =
          gfx.territoryGlow && (tier === "full" || tier === "soft");
        const hasBlur = !!(tLayer.filters && tLayer.filters.length > 0);
        if (wantGlow && !hasBlur) {
          tLayer.filters = [
            new BlurFilter({
              strength: tier === "full" ? 10 : 6,
              quality: 2,
            }),
          ];
        } else if (!wantGlow && hasBlur) {
          tLayer.filters = [];
        }
      }

      if (bare || !gfx.tableFx) {
        tableFloorG.clear();
        ambientG.clear();
      } else {
        drawTableFloor(tableFloorG, anim, tier === "lite");
        drawStarfield(ambientG, anim, tier === "lite");
      }

      const factionFill = new Map(
        world.factions.map((f) => [
          f.id,
          parseFactionColor(resolveFactionFill(f)),
        ]),
      );
      const factionBorder = new Map(
        world.factions.map((f) => [
          f.id,
          parseFactionColor(resolveFactionBorder(f)),
        ]),
      );
      const factionSystem = new Map(
        world.factions.map((f) => [
          f.id,
          parseFactionColor(resolveFactionSystemColor(f)),
        ]),
      );
      const byId = new Map(world.systems.map((s) => [s.id, s]));
      // When omniscient is off, `world` is already faction-sliced (no veil needed).
      // With omniscient + fog preview, dim systems the active faction cannot see.
      const fogVisible =
        mode === "editor" &&
        gmOmniscientView &&
        showFogPreview &&
        activeFactionId
          ? getVisibleSystemIds(useWorldStore.getState().world, activeFactionId)
          : null;
      const maskSet =
        fogMaskPreview && fogMaskPreview.length > 0
          ? new Set(fogMaskPreview)
          : null;

      const worldScale = worldLayerRef.current?.scale.x ?? 1;
      const lod = resolveMapLod(worldScale);
      const labelScale = resolveLabelScale(worldScale, lod);

      if (showTerritory) {
        const fp =
          territoryFingerprint(world) +
          (bare ? ":bare" : "") +
          (gfx.territoryGlow ? ":glow" : ":flat");
        if (fp !== territoryFpRef.current) {
          territoryFpRef.current = fp;
          if (bare) {
            territoryG.clear();
          } else {
            drawTerritoryGlow(territoryG, world, factionFill);
          }
          drawTerritoryBorders(territoryBorderG, world, factionBorder, anim);
        }
        territoryG.visible = !bare;
        territoryBorderG.visible = true;
      } else {
        territoryG.clear();
        territoryBorderG.clear();
        territoryFpRef.current = "";
        territoryG.visible = false;
        territoryBorderG.visible = false;
      }

      if (showSectors || sectorDraftPoints.length > 0) {
        drawSectors(
          sectorsG,
          world,
          selectedSectorId,
          sectorDraftPoints,
        );
      } else {
        sectorsG.clear();
      }

      linksG.clear();
      if (showLinks) {
        for (const link of world.links) {
          const a = byId.get(link.fromId);
          const b = byId.get(link.toId);
          if (!a || !b) continue;
          const selected = link.id === selectedLinkId;
          if (
            !drawSpecialLink(
              linksG,
              link,
              a.x,
              a.y,
              b.x,
              b.y,
              anim,
              selected,
            )
          ) {
            drawLink(
              linksG,
              a.x,
              a.y,
              b.x,
              b.y,
              link.type,
              anim,
              selected,
              linkHasTraffic(a, b, world),
            );
          }
        }
        if (linkDraftFromId) {
          const from = byId.get(linkDraftFromId);
          if (from) {
            const tip = toIso(from.x, from.y);
            linksG.circle(tip.x, tip.y, 10);
            linksG.stroke({ width: 2, color: 0xffe08a, alpha: 0.85 });
          }
        }
      }

      if (!bare && tier === "full") {
        if (showTraffic) {
          drawTrafficDensity(linksG, world, anim);
        }
        if (showSupply && mode !== "viewer") {
          drawSupplyChains(linksG, world, activeFactionId ?? null, anim);
        }
        if (showCaravans) {
          drawCaravans(linksG, world, world.caravans ?? [], anim);
        }
        drawTradeLanes(linksG, world, anim);
      } else if (!bare && showSupply && mode !== "viewer" && tier === "soft") {
        drawSupplyChains(linksG, world, activeFactionId ?? null, anim);
      }

      if (showDiplomacy && !bare && tier !== "lite") {
        drawDiplomacyLines(diplomacyG, world, anim);
      } else {
        diplomacyG.clear();
      }

      ordersG.clear();

      const fleetsBySystem = new Map<string, typeof world.fleets>();
      for (const f of world.fleets) {
        const list = fleetsBySystem.get(f.systemId) ?? [];
        list.push(f);
        fleetsBySystem.set(f.systemId, list);
      }
      const legionsBySystem = new Map<string, typeof world.legions>();
      for (const l of world.legions ?? []) {
        const list = legionsBySystem.get(l.systemId) ?? [];
        list.push(l);
        legionsBySystem.set(l.systemId, list);
      }

      if (showOrders) {
        for (const order of world.orders) {
          if (order.status !== "pending") continue;
          let fromId = order.fromSystemId ?? null;
          if (!fromId && order.fleetId) {
            fromId =
              world.fleets.find((f) => f.id === order.fleetId)?.systemId ??
              null;
          }
          if (!fromId && order.legionId) {
            fromId =
              world.legions.find((l) => l.id === order.legionId)?.systemId ??
              null;
          }
          const from = fromId ? byId.get(fromId) : null;
          const to = order.toSystemId ? byId.get(order.toSystemId) : null;
          if (!from || !to) continue;
          const color =
            order.type === "attack_system"
              ? 0xe85d4c
              : order.type === "claim_system"
                ? 0xf0c14a
                : 0x4cc9f0;
          if (
            order.type === "move_fleet" ||
            order.type === "move_legion"
          ) {
            const path = hopPath(world, from.id, to.id);
            if (path.length >= 2) {
              for (let i = 0; i < path.length - 1; i++) {
                const a = byId.get(path[i]!);
                const b = byId.get(path[i + 1]!);
                if (!a || !b) continue;
                drawOrderArrow(ordersG, a.x, a.y, b.x, b.y, color, anim);
              }
              continue;
            }
          }
          drawOrderArrow(ordersG, from.x, from.y, to.x, to.y, color, anim);
        }

        for (const fleet of world.fleets) {
          if (!fleet.route?.length) continue;
          const startSys = byId.get(fleet.systemId);
          if (!startSys) continue;
          const here = fleetsBySystem.get(fleet.systemId) ?? [fleet];
          const slots = layoutFleetsAroundSystem(
            startSys,
            here,
            anim,
            fleet.id,
          );
          const slot =
            slots.find(
              (s) =>
                s.fleet.id === fleet.id ||
                (s.fleetIds?.includes(fleet.id) ?? false),
            ) ?? slots[0];
          const startIso = slot
            ? { x: slot.x, y: slot.y }
            : toIso(startSys.x, startSys.y);
          const col =
            ORDER_ARROW_COLORS[fleet.stance] ??
            ORDER_ARROW_COLORS.move ??
            0x4cc9f0;
          let prevIso = startIso;
          for (const hopId of fleet.route) {
            const hop = byId.get(hopId);
            if (!hop) continue;
            const hopIso = toIso(hop.x, hop.y);
            drawOrderArrowIso(
              ordersG,
              prevIso.x,
              prevIso.y,
              hopIso.x,
              hopIso.y,
              col,
              anim,
            );
            prevIso = hopIso;
          }
        }

        for (const legion of world.legions ?? []) {
          const route = legion.route ?? [];
          if (!route.length) continue;
          const startSys = byId.get(legion.systemId);
          if (!startSys) continue;
          const here = legionsBySystem.get(legion.systemId) ?? [legion];
          const slots = layoutLegionsAroundSystem(startSys, here, anim);
          const slot =
            slots.find((s) => s.legion.id === legion.id) ?? slots[0];
          const startIso = slot
            ? { x: slot.x, y: slot.y }
            : toIso(startSys.x, startSys.y);
          const col =
            ORDER_ARROW_COLORS[legion.status] ??
            ORDER_ARROW_COLORS.move ??
            0x4cc9f0;
          let prevIso = startIso;
          for (const hopId of route) {
            const hop = byId.get(hopId);
            if (!hop) continue;
            const hopIso = toIso(hop.x, hop.y);
            drawOrderArrowIso(
              ordersG,
              prevIso.x,
              prevIso.y,
              hopIso.x,
              hopIso.y,
              col,
              anim,
            );
            prevIso = hopIso;
          }
        }
      }

      systemsG.clear();
      const seen = new Set<string>();
      // fleetsBySystem / legionsBySystem already built above

      // Y-sort is expensive on phones — skip for lite/bare
      const sorted =
        bare || tier === "lite"
          ? world.systems
          : [...world.systems].sort((a, b) => {
              return toIso(a.x, a.y).y - toIso(b.x, b.y).y;
            });

      const battleMarkerIds = new Set<string>();
      const battleSites: { id: string; x: number; y: number }[] = [];
      const selectedIds =
        model.selectedSystemIds ??
        (selectedSystemId ? [selectedSystemId] : []);
      const unitSlots: UnitSpriteSlot[] = [];
      const useUnitSprites = mapIconsReady();

      for (const s of sorted) {
        seen.add(s.id);
        const selected = selectedIds.includes(s.id);
        const here = fleetsBySystem.get(s.id) ?? [];
        const contested = new Set(here.map((f) => f.factionId)).size > 1;
        const ip = toIso(s.x, s.y);
        const fogged = !!(
          (fogVisible && !fogVisible.has(s.id)) ||
          (maskSet && maskSet.has(s.id))
        );

        if (showOwnership && s.ownerFactionId) {
          const owner = world.factions.find((f) => f.id === s.ownerFactionId);
          const coIds = s.coOwnerFactionIds ?? [];
          const shareColors =
            coIds.length > 0
              ? [
                  factionSystem.get(s.ownerFactionId) ?? 0x888888,
                  ...coIds.map((id) => factionSystem.get(id) ?? 0x888888),
                ]
              : undefined;
          if (isStatePolity(owner) || (shareColors && shareColors.length >= 2)) {
            drawOwnershipAura(
              systemsG,
              s,
              factionSystem.get(s.ownerFactionId) ?? 0x888888,
              anim,
              shareColors,
            );
          }
        }

        if (
          activeFactionId &&
          (s.visibleToFactionIds ?? []).includes(activeFactionId)
        ) {
          drawIntelRing(systemsG, s, anim);
        }

        if (contested && showFleets) {
          drawContestedRing(systemsG, s, anim);
        } else if (s.activity === "battle" && !mapIconsReady()) {
          const bp = toIso(s.x, s.y);
          drawCrossedSwords(systemsG, bp.x, bp.y - 34 - anim.pulse * 0.6, 0.75, anim);
        }

        const inBattle = s.activity === "battle" || contested;
        if (inBattle && gfx.battleFx && tier === "full") {
          drawBattleFx(systemsG, s, anim);
          battleSites.push({ id: s.id, x: s.x, y: s.y });
        } else if (inBattle && gfx.battleFx && (tier === "soft" || tier === "lite")) {
          battleSites.push({ id: s.id, x: s.x, y: s.y });
        }
        const objs = s.spaceObjects || (s.poiType && s.poiType !== "none" ? [s.poiType] : []);
        if (
          gfx.scarFx &&
          !inBattle &&
          (objs.includes("debris") || objs.includes("ruin")) &&
          (tier === "full" || tier === "soft")
        ) {
          battleSites.push({ id: `scar:${s.id}`, x: s.x, y: s.y });
        }
        if ((contested && showFleets) || s.activity === "battle") {
          battleMarkerIds.add(s.id);
        }

        if (showDeadZones && (s.scannerDeadZone || hasSpaceObject(s, "dead_zone"))) {
          drawDeadZone(systemsG, s, anim);
        }
        if (s.anomalyMotion || hasSpaceObject(s, "anomaly")) {
          drawAnomalyField(systemsG, s, anim);
        }
        drawContestedClaim(systemsG, s, anim);

        {
          const coIds = s.coOwnerFactionIds ?? [];
          const shareColors =
            s.ownerFactionId && coIds.length > 0
              ? [
                  factionSystem.get(s.ownerFactionId) ?? 0x888888,
                  ...coIds.map((id) => factionSystem.get(id) ?? 0x888888),
                ]
              : undefined;
          drawSystemGlyph(
            systemsG,
            s,
            selected,
            anim,
            s.ownerFactionId
              ? factionSystem.get(s.ownerFactionId)
              : undefined,
            undefined,
            shareColors,
          );
        }
        drawActivityBadge(systemsG, s, anim);

        if (showBlockades && s.blockaded) {
          drawBlockadeRing(systemsG, s, anim);
        }
        const systemQuests = showQuests
          ? questsAtSystem(world, s.id)
          : [];
        if (showQuests && lod !== "far") {
          drawQuestMarker(systemsG, s, systemQuests, anim);
        }

        if (fogged) {
          drawFogVeil(systemsG, s);
        }

        if (selected) {
          drawSelectionBrackets(systemsG, s, anim);
        }

        const hasQuest = systemQuests.length > 0;
        const inhabited =
          s.isCapital || censusPlanets(s.planets ?? []).inhabited > 0;
        const showSystemLabel =
          !!showLabels &&
          (selected ||
            lod === "near" ||
            (lod === "mid" && (inhabited || hasQuest)));

        if (showSystemLabel) {
          let label = labelMapRef.current.get(s.id);
          const tag = isCorridorSystem(s) ? "◇ " : s.isCapital ? "★ " : "";
          const fill = isCorridorSystem(s)
            ? 0xc9a227
            : s.isCapital
              ? 0xe8c547
              : inhabited
                ? 0xdce4f0
                : 0xb8c2d0;
          const fontSize = lod === "mid" ? 12 : 11;
          const weight = inhabited || s.isCapital ? "700" : "600";
          if (!label) {
            label = new Text({
              text: tag + s.name,
              style: {
                fontSize,
                fill,
                fontFamily: "Rajdhani, Segoe UI, sans-serif",
                fontWeight: weight,
                letterSpacing: 0.4,
                stroke: { color: 0x05070c, width: 3.5, join: "round" },
                ...(bare || tier === "lite" || !gfx.labelShadows
                  ? {}
                  : {
                      dropShadow: {
                        color: 0x000000,
                        alpha: 0.35,
                        blur: 2,
                        distance: 1,
                        angle: Math.PI / 2,
                      },
                    }),
              },
            });
            labelMapRef.current.set(s.id, label);
            labels.addChild(label);
          }
          label.text = tag + s.name;
          label.style.fill = fill;
          label.style.fontSize = fontSize;
          label.style.fontWeight = weight;
          label.visible = true;
          label.scale.set(labelScale);
          label.position.set(ip.x + 18 * labelScale, ip.y - 28 * labelScale);
          label.alpha = fogged
            ? 0.22
            : lod === "mid"
              ? 0.78 + anim.pulse * 0.04
              : 0.88 + anim.pulse * 0.04;
        } else {
          const label = labelMapRef.current.get(s.id);
          if (label) label.visible = false;
        }
      }

      if (showJumpRange) {
        const jumpSys =
          (selectedFleetId
            ? byId.get(
                world.fleets.find((f) => f.id === selectedFleetId)?.systemId ??
                  "",
              )
            : null) ??
          (selectedSystemId ? byId.get(selectedSystemId) : null);
        if (jumpSys) drawJumpRange(systemsG, jumpSys, undefined, anim);
      }

      // System markers synced after unit slots are collected below
      if (!bare) {
        const enableBattle =
          (gfx.battleFx || gfx.scarFx) && (tier === "full" || tier === "soft");
        battleFxRef.current?.setEnabled(enableBattle);
        battleFxRef.current?.sync(
          enableBattle ? battleSites : [],
          lastDtRef.current,
        );
      }

      if (showFactionLabels) {
        drawFactionLabels(
          labels,
          world,
          anim,
          labelMapRef.current,
          emblemMapRef.current,
          emblemLoadingRef.current,
          labelScale * (lod === "far" ? 1.0 : lod === "mid" ? 0.92 : 0.85),
        );
        if (lod !== "far") {
          drawCapitalEmblems(
            labels,
            world,
            anim,
            emblemMapRef.current,
            emblemLoadingRef.current,
          );
        } else {
          for (const [key, sprite] of emblemMapRef.current) {
            if (key.startsWith("capemb:")) sprite.visible = false;
          }
        }
      } else {
        for (const [key, label] of labelMapRef.current) {
          if (key.startsWith("fac:")) label.visible = false;
        }
        for (const sprite of emblemMapRef.current.values()) {
          sprite.visible = false;
        }
      }

      fleetsG.clear();
      const seenFleetStacks = new Set<string>();
      const drag = unitDragRef.current;
      const dragIso = drag?.moved
        ? toIso(lastPointerWorldRef.current.x, lastPointerWorldRef.current.y)
        : null;

      let dropTarget: StarSystem | null = null;
      if (drag?.moved && dragIso) {
        const tip = dragIso;
        let bestD = SYSTEM_DROP_R * SYSTEM_DROP_R;
        for (const s of world.systems) {
          const sp = toIso(s.x, s.y);
          const dx = tip.x - sp.x;
          const dy = (tip.y - sp.y) * 1.6;
          const d = dx * dx + dy * dy;
          if (d <= bestD) {
            bestD = d;
            dropTarget = s;
          }
        }
      }

      if (dropTarget && drag) {
        const unit =
          drag.kind === "fleet"
            ? world.fleets.find((x) => x.id === drag.id)
            : world.legions.find((x) => x.id === drag.id);
        const hops = hopDistance(world, unit?.systemId, dropTarget.id);
        const path = hopPath(world, unit?.systemId, dropTarget.id);
        const reachable = Number.isFinite(hops) && hops > 0;
        const same = hops === 0;
        const ring = reachable ? 0xc9a227 : same ? 0x7a8899 : 0xe85d4c;
        const ringSoft = reachable ? 0xffe08a : same ? 0x9aa8b8 : 0xff8a7a;
        if (path.length >= 2) {
          for (let pass = 0; pass < 2; pass++) {
            for (let i = 0; i < path.length - 1; i++) {
              const a = byId.get(path[i]!);
              const b = byId.get(path[i + 1]!);
              if (!a || !b) continue;
              const ai = toIso(a.x, a.y);
              const bi = toIso(b.x, b.y);
              fleetsG.moveTo(ai.x, ai.y);
              fleetsG.lineTo(bi.x, bi.y);
            }
            fleetsG.stroke(
              pass === 0
                ? { width: 5, color: 0x05070c, alpha: 0.55 }
                : {
                    width: 2.4,
                    color: ring,
                    alpha: reachable ? 0.92 : 0.55,
                  },
            );
          }
        }
        const dp = toIso(dropTarget.x, dropTarget.y);
        fleetsG.circle(dp.x, dp.y, 28);
        fleetsG.stroke({
          width: 2.2,
          color: ring,
          alpha: 0.9,
        });
        fleetsG.circle(dp.x, dp.y, 20);
        fleetsG.stroke({
          width: 1,
          color: ringSoft,
          alpha: 0.45,
        });
        const hint = same
          ? "уже здесь"
          : reachable
            ? formatHopTurns(hops)
            : "нет пути";
        let tip = dragHintLabelRef.current;
        if (!tip) {
          tip = new Text({
            text: hint,
            style: {
              fontSize: 14,
              fill: 0xffe8a8,
              fontFamily: "Rajdhani, Segoe UI, sans-serif",
              fontWeight: "700",
              stroke: { color: 0x05070c, width: 3.5 },
            },
          });
          tip.anchor.set(0.5, 1);
          dragHintLabelRef.current = tip;
          labels.addChild(tip);
        }
        tip.text = hint;
        tip.style.fill = reachable ? 0xffe8a8 : same ? 0xc8d0dc : 0xffb0a4;
        tip.visible = true;
        tip.position.set(dp.x, dp.y - 32);
      } else if (dragHintLabelRef.current) {
        dragHintLabelRef.current.visible = false;
      }

      if (showFleets) {
        const fleetDraw: {
          y: number;
          slot: ReturnType<typeof layoutFleetsAroundSystem>[number];
          col: number;
        }[] = [];
        for (const [sysId, fleets] of fleetsBySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          if (fogVisible && !fogVisible.has(sysId)) continue;
          const visibleFleets =
            drag?.kind === "fleet" && drag.moved
              ? fleets.filter((f) => f.id !== drag.id)
              : fleets;
          if (visibleFleets.length === 0) continue;
          for (const slot of layoutFleetsAroundSystem(
            sys,
            visibleFleets,
            anim,
            selectedFleetId,
          )) {
            fleetDraw.push({
              y: slot.y,
              slot,
              col: factionSystem.get(slot.fleet.factionId) ?? 0xcccccc,
            });
          }
        }
        fleetDraw.sort((a, b) => a.y - b.y);
        for (const item of fleetDraw) {
          const selected =
            item.slot.fleet.id === selectedFleetId ||
            (item.slot.fleetIds?.includes(selectedFleetId ?? "") ?? false);
          if (useUnitSprites) {
            unitSlots.push({
              key: `fleet:${item.slot.fleet.id}`,
              x: item.slot.x,
              y: item.slot.y,
              icon: fleetSlotIcon(item.slot.fleet.kind),
              tint: item.col,
              size: selected ? FLEET_ICON_SIZE_SEL : FLEET_ICON_SIZE,
              selected,
              stackCount: item.slot.stackCount,
            });
            drawFleetStanceBadge(
              fleetsG,
              item.slot.x,
              item.slot.y,
              item.slot.fleet.stance,
              selected,
              item.slot.stackCount ?? 1,
            );
          } else {
            drawFleetGlyph(
              fleetsG,
              item.slot.x,
              item.slot.y,
              item.col,
              selected,
              item.slot.fleet.stance,
              anim,
              item.slot.fleet.kind ?? "combat",
              item.slot.stackCount ?? 1,
            );
          }
          const stackKey = `${item.slot.fleet.systemId}:${item.slot.fleet.factionId}`;
          if ((item.slot.stackCount ?? 1) > 1) {
            seenFleetStacks.add(stackKey);
            let stackLabel = fleetStackLabelMapRef.current.get(stackKey);
            if (!stackLabel) {
              stackLabel = new Text({
                text: `×${item.slot.stackCount}`,
                style: {
                  fontSize: 10,
                  fill: 0xa8e4ef,
                  fontFamily: "Rajdhani, Segoe UI, sans-serif",
                  fontWeight: "700",
                  stroke: { color: 0x05070c, width: 2 },
                },
              });
              stackLabel.anchor.set(0.5);
              fleetStackLabelMapRef.current.set(stackKey, stackLabel);
              labels.addChild(stackLabel);
            }
            stackLabel.text = `×${item.slot.stackCount}`;
            stackLabel.visible = true;
            stackLabel.position.set(item.slot.x - 10, item.slot.y - 10);
          }
        }

        if (drag?.kind === "fleet" && drag.moved && dragIso) {
          const f = world.fleets.find((x) => x.id === drag.id);
          if (f) {
            const col = factionSystem.get(f.factionId) ?? 0xcccccc;
            if (useUnitSprites) {
              unitSlots.push({
                key: `fleet-drag:${f.id}`,
                x: dragIso.x,
                y: dragIso.y,
                icon: fleetSlotIcon(f.kind),
                tint: col,
                size: FLEET_ICON_SIZE_SEL,
                selected: true,
              });
              drawFleetStanceBadge(fleetsG, dragIso.x, dragIso.y, f.stance, true, 1);
            } else {
              drawFleetGlyph(
                fleetsG,
                dragIso.x,
                dragIso.y,
                col,
                true,
                f.stance,
                anim,
                f.kind ?? "combat",
                1,
              );
            }
          }
        }
      }
      for (const [key, stackLabel] of fleetStackLabelMapRef.current) {
        if (!seenFleetStacks.has(key)) {
          labels.removeChild(stackLabel);
          stackLabel.destroy();
          fleetStackLabelMapRef.current.delete(key);
        }
      }

      legionsG.clear();
      if (showLegions) {
        for (const [sysId, legs] of legionsBySystem) {
          const sys = byId.get(sysId);
          if (!sys) continue;
          if (fogVisible && !fogVisible.has(sysId)) continue;
          const visibleLegs =
            drag?.kind === "legion" && drag.moved
              ? legs.filter((l) => l.id !== drag.id)
              : legs;
          for (const slot of layoutLegionsAroundSystem(sys, visibleLegs, anim)) {
            const selected = slot.legion.id === selectedLegionId;
            const col = factionSystem.get(slot.legion.factionId) ?? 0xcccccc;
            if (useUnitSprites) {
              unitSlots.push({
                key: `legion:${slot.legion.id}`,
                x: slot.x,
                y: slot.y,
                icon: legionSlotIcon(slot.legion.status),
                tint: col,
                size: selected ? LEGION_ICON_SIZE_SEL : LEGION_ICON_SIZE,
                selected,
              });
              drawLegionStanceBadge(
                legionsG,
                slot.x,
                slot.y,
                slot.legion.status,
                selected,
              );
            } else {
              drawLegionGlyph(
                legionsG,
                slot.x,
                slot.y,
                col,
                selected,
                slot.legion.status,
                anim,
              );
            }
          }
        }
        if (drag?.kind === "legion" && drag.moved && dragIso) {
          const l = world.legions.find((x) => x.id === drag.id);
          if (l) {
            const col = factionSystem.get(l.factionId) ?? 0xcccccc;
            if (useUnitSprites) {
              unitSlots.push({
                key: `legion-drag:${l.id}`,
                x: dragIso.x,
                y: dragIso.y,
                icon: legionSlotIcon(l.status),
                tint: col,
                size: LEGION_ICON_SIZE_SEL,
                selected: true,
              });
              drawLegionStanceBadge(legionsG, dragIso.x, dragIso.y, l.status, true);
            } else {
              drawLegionGlyph(
                legionsG,
                dragIso.x,
                dragIso.y,
                col,
                true,
                l.status,
                anim,
              );
            }
          }
        }
      }

      if (!bare) {
        iconOverlayRef.current?.sync(sorted, anim, {
          battleMarkerIds,
          unitSlots,
        });
      }

      for (const [id, label] of labelMapRef.current) {
        if (id.startsWith("fac:")) continue;
        if (!seen.has(id)) {
          labels.removeChild(label);
          label.destroy();
          labelMapRef.current.delete(id);
        } else if (!showLabels) {
          label.visible = false;
        }
      }

      const brushG = brushGRef.current;
      const mq = marqueeRef.current;
      if (brushG && mq?.active && !drawingRef.current) {
        brushG.clear();
        const x = Math.min(mq.x0, mq.x1);
        const y = Math.min(mq.y0, mq.y1);
        const w = Math.abs(mq.x1 - mq.x0);
        const h = Math.abs(mq.y1 - mq.y0);
        brushG.rect(x, y, w, h);
        brushG.fill({ color: 0xc9a227, alpha: 0.08 });
        brushG.rect(x, y, w, h);
        brushG.stroke({ width: 1.5, color: 0xe8c547, alpha: 0.85 });
      }
    }

    return () => {
      cancelled = true;
      unsub();
      registerMapPngExporter(null);
      const cleanup = (
        host as HTMLDivElement & { __gmapTouchCleanup?: () => void }
      ).__gmapTouchCleanup;
      cleanup?.();
      for (const label of labelMapRef.current.values()) {
        label.destroy();
      }
      labelMapRef.current.clear();
      for (const label of fleetStackLabelMapRef.current.values()) {
        label.destroy();
      }
      fleetStackLabelMapRef.current.clear();
      for (const sprite of emblemMapRef.current.values()) {
        sprite.destroy();
      }
      emblemMapRef.current.clear();
      emblemLoadingRef.current.clear();
      try {
        const canvas = app.renderer ? app.canvas : null;
        if (canvas?.parentElement === host) {
          host.removeChild(canvas);
        }
      } catch {
        /* app may be uninitialized if effect cleaned up early */
      }
      safeDestroy();
    };
  }, [mode, interactive]);

  return <div className="map-host" ref={hostRef} />;
}
