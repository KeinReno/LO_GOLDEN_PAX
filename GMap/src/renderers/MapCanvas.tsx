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
import { getVisibleSystemIds } from "../state/fog";
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
import { registerMapPngExporter } from "../io/mapExportBridge";

const SYSTEM_HIT_R = 20;
const SYSTEM_DROP_R = 48;
const FLEET_HIT_R = 32;
const LEGION_HIT_R = 30;
const LINK_HIT_PX = 10;

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
  showJumpRange?: boolean;
  showSupply?: boolean;
  showCaravans?: boolean;
  showBlockades?: boolean;
  showDeadZones?: boolean;
  showTraffic?: boolean;
  showQuests?: boolean;
  activeFactionId?: string | null;
  /** ultralight(bare) | mobile(lite) | quality_mobile(soft) | quality(full) | auto */
  perfMode?:
    | "auto"
    | "quality"
    | "quality_mobile"
    | "mobile"
    | "ultralight";
  graphics?: {
    animations?: boolean;
    labelShadows?: boolean;
    tableFx?: boolean;
    battleFx?: boolean;
    territoryGlow?: boolean;
    liveZoomRebuild?: boolean;
  };
}

export interface MapCanvasApi {
  zoomBy: (factor: number) => void;
  resetView: () => void;
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
  if (pref === "quality") return "full";
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
        }
      : tier === "lite"
        ? {
            animations: false,
            labelShadows: false,
            tableFx: true,
            battleFx: false,
            territoryGlow: false,
            liveZoomRebuild: false,
          }
        : tier === "soft"
          ? {
              animations: true,
              labelShadows: false,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
            }
          : {
              animations: true,
              labelShadows: true,
              tableFx: true,
              battleFx: true,
              territoryGlow: true,
              liveZoomRebuild: false,
            };
  return {
    animations: g.animations ?? defaults.animations,
    labelShadows: g.labelShadows ?? defaults.labelShadows,
    tableFx: g.tableFx ?? defaults.tableFx,
    battleFx: g.battleFx ?? defaults.battleFx,
    territoryGlow: g.territoryGlow ?? defaults.territoryGlow,
    liveZoomRebuild: g.liveZoomRebuild ?? defaults.liveZoomRebuild,
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

interface MapCanvasProps {
  mode?: "editor" | "viewer";
  readModel?: () => MapViewModel;
  onModelSubscribe?: (cb: () => void) => () => void;
  onSystemClick?: (systemId: string | null) => void;
  onFleetClick?: (fleetId: string) => void;
  interactive?: boolean;
  apiRef?: MutableRefObject<MapCanvasApi | null>;
}

export function MapCanvas({
  mode = "editor",
  readModel,
  onModelSubscribe,
  onSystemClick,
  onFleetClick,
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
  const panRef = useRef({ active: false, lx: 0, ly: 0 });
  const labelMapRef = useRef<Map<string, Text>>(new Map());
  const fleetStackLabelMapRef = useRef<Map<string, Text>>(new Map());
  const emblemMapRef = useRef<Map<string, Sprite>>(new Map());
  const emblemLoadingRef = useRef<Set<string>>(new Set());
  const lastClickRef = useRef<{ id: string; t: number } | null>(null);
  const animRef = useRef<AnimClock>(makeAnim(0));
  const lastDtRef = useRef(0);
  const iconOverlayRef = useRef<MapIconOverlay | null>(null);
  const battleFxRef = useRef<BattleParticleField | null>(null);
  const readModelRef = useRef(readModel);
  const onSystemClickRef = useRef(onSystemClick);
  const onFleetClickRef = useRef(onFleetClick);
  const onModelSubscribeRef = useRef(onModelSubscribe);
  const apiRefInternal = useRef(apiRef);
  readModelRef.current = readModel;
  onSystemClickRef.current = onSystemClick;
  onFleetClickRef.current = onFleetClick;
  onModelSubscribeRef.current = onModelSubscribe;
  apiRefInternal.current = apiRef;

  const defaultRead = (): MapViewModel => {
    const s = useWorldStore.getState();
    return {
      world: s.world,
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

      const api: MapCanvasApi = {
        zoomBy: (factor) => {
          zoomAtScreen(app.screen.width / 2, app.screen.height / 2, factor);
        },
        resetView: () => {
          applyFit();
        },
      };
      if (apiRefInternal.current) apiRefInternal.current.current = api;

      /** Pointer → logical map coords (pre-iso). */
      const toWorld = (e: FederatedPointerEvent): Point => {
        const local = worldLayer.toLocal(e.global);
        return fromIso(local.x, local.y);
      };

      const findSystemAt = (
        p: Point,
        systems: StarSystem[],
        hitR = SYSTEM_HIT_R,
      ): StarSystem | null => {
        const tip = toIso(p.x, p.y);
        let best: StarSystem | null = null;
        let bestD = hitR * hitR;
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
        let bestD = FLEET_HIT_R * FLEET_HIT_R;
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
        let bestD = LEGION_HIT_R * LEGION_HIT_R;
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
            if (mode === "viewer") {
              panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            }
            return;
          }

          if (mode === "viewer") {
            const fleetId = findFleetAt(worldPos, model);
            if (fleetId) {
              onFleetClickRef.current?.(fleetId);
              return;
            }
            const hit = findSystemAt(worldPos, model.world.systems);
            onSystemClickRef.current?.(hit?.id ?? null);
            if (!hit) {
              panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            }
            return;
          }

          const state = useWorldStore.getState();
          state.setContextMenu(null);

          if (state.pendingUnitOrder) {
            const target = findSystemAt(worldPos, state.world.systems);
            if (target) {
              state.applyPendingUnitOrder(target.id);
              return;
            }
            // empty click cancels targeting
            state.clearPendingUnitOrder();
            return;
          }

          if (state.pendingFleetCloneId) {
            const target = findSystemAt(worldPos, state.world.systems);
            if (target) {
              state.cloneFleetToSystem(target.id);
              return;
            }
            state.clearPendingFleetClone();
            return;
          }

          if (state.showQuests) {
            for (const s of state.world.systems) {
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
            const capitalHit = findSystemAt(worldPos, state.world.systems);
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

          const hit = findSystemAt(worldPos, state.world.systems);
          const fleetHit = findFleetAt(worldPos, getModel());
          const legionHit = findLegionAt(worldPos, getModel());
          const linkHit = findLinkAt(
            worldPos,
            state.world.links,
            state.world.systems,
          );

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
          if (panRef.current.active && worldLayerRef.current) {
            const dx = e.global.x - panRef.current.lx;
            const dy = e.global.y - panRef.current.ly;
            panRef.current.lx = e.global.x;
            panRef.current.ly = e.global.y;
            worldLayerRef.current.x += dx;
            worldLayerRef.current.y += dy;
            return;
          }

          if (mode !== "editor") return;

          if (unitDragRef.current) {
            const p = toWorld(e);
            lastPointerWorldRef.current = p;
            const d = unitDragRef.current;
            if (
              !d.moved &&
              Math.hypot(p.x - d.startX, p.y - d.startY) > 6
            ) {
              d.moved = true;
            }
            dirtyRef.current = true;
            return;
          }

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
          if (unitDragRef.current) {
            const drag = unitDragRef.current;
            unitDragRef.current = null;
            if (drag.moved) {
              const target = findSystemAt(
                lastPointerWorldRef.current,
                useWorldStore.getState().world.systems,
                SYSTEM_DROP_R,
              );
              if (target) {
                const st = useWorldStore.getState();
                if (drag.kind === "fleet") {
                  st.relocateFleet(drag.id, target.id);
                } else {
                  st.relocateLegion(drag.id, target.id);
                }
              }
            }
            dirtyRef.current = true;
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
              const picked = st.world.systems
                .filter((s) => {
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
        };

        app.stage.on("pointerup", endPointer);
        app.stage.on("pointerupoutside", endPointer);

        const openContextMenu = (ev: MouseEvent) => {
          ev.preventDefault();
          if (mode !== "editor") return;
          const layer = worldLayerRef.current;
          if (!layer) return;
          const rect = app.canvas.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          const local = layer.toLocal({ x: sx, y: sy });
          const worldPos = fromIso(local.x, local.y);
          const state = useWorldStore.getState();
          const model = getModel();
          const fleetHit = findFleetAt(worldPos, model);
          const legionHit = findLegionAt(worldPos, model);
          const hit = findSystemAt(worldPos, state.world.systems);
          const linkHit = findLinkAt(
            worldPos,
            state.world.links,
            state.world.systems,
          );
          state.setContextMenu({
            screenX: ev.clientX,
            screenY: ev.clientY,
            worldX: worldPos.x,
            worldY: worldPos.y,
            systemId: hit?.id ?? null,
            fleetId: fleetHit,
            legionId: legionHit,
            linkId:
              !fleetHit && !legionHit && !hit ? (linkHit?.id ?? null) : null,
          });
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
      const fogVisible =
        showFogPreview && activeFactionId
          ? getVisibleSystemIds(world, activeFactionId)
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
        if (showSupply) {
          drawSupplyChains(linksG, world, activeFactionId ?? null, anim);
        }
        if (showCaravans) {
          drawCaravans(linksG, world, world.caravans ?? [], anim);
        }
        drawTradeLanes(linksG, world, anim);
      } else if (!bare && showSupply && tier === "soft") {
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
          const from = order.fromSystemId
            ? byId.get(order.fromSystemId)
            : null;
          const to = order.toSystemId ? byId.get(order.toSystemId) : null;
          if (!from || !to) continue;
          const color =
            order.type === "attack_system"
              ? 0xe85d4c
              : order.type === "claim_system"
                ? 0xf0c14a
                : 0x4cc9f0;
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
        const fogged = !!(fogVisible && !fogVisible.has(s.id));

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
          gfx.battleFx && (tier === "full" || tier === "soft");
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

      if (dropTarget) {
        const dp = toIso(dropTarget.x, dropTarget.y);
        fleetsG.circle(dp.x, dp.y, 22);
        fleetsG.stroke({
          width: 2,
          color: 0xc9a227,
          alpha: 0.85,
        });
        fleetsG.circle(dp.x, dp.y, 16);
        fleetsG.stroke({
          width: 1,
          color: 0xffe08a,
          alpha: 0.45,
        });
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
              size: selected ? 22 : 18,
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
                size: 22,
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
                size: selected ? 20 : 17,
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
                size: 20,
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
