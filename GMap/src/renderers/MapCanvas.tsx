import { useEffect, useRef } from "react";
import {
  Application,
  Container,
  Graphics,
  Text,
  Sprite,
  Texture,
  FederatedPointerEvent,
} from "pixi.js";
import { useWorldStore } from "../state/worldStore";
import { playStaffCue } from "../audio/staffSfx";
import type { Point } from "../generators/brushGenerator";
import type { StarSystem } from "../state/types";
import { makeAnim, type AnimClock } from "./drawMapIcons";
import { drawStarfield, drawTableFloor, TABLE } from "./drawTableFx";
import { fromIso, toIso } from "./iso";
import {
  getVisibleSystemIdsWithFog,
  resolveEditorViewWorld,
} from "../state/fog";
import { type MapStyleId } from "./styles";
import { clearHoloPlaqueCache } from "./styles/holoTheme";
import { clearImperialPlaqueCache } from "./styles/imperialTheme";
import { ensureMapIconsLoaded } from "./mapIconAssets";
import { MapIconOverlay } from "./mapIconSprites";
import { BattleParticleField } from "./battleParticles";
import { MapFxOverlay, type MapFxKind } from "./mapFxOverlay";
import {
  registerMapPngExporter,
  type MapPngExportOptions,
} from "../io/mapExportBridge";

import {
  LONG_PRESS_MS,
  UNIT_TRANSIT_MS,
  MIN_TOUCH_HIT_PX,
} from "./mapCanvas/constants";
import { fitSystemsInView } from "./mapCanvas/geometry";
import { resolveDropIntent } from "./mapCanvas/dropIntent";
import {
  resolvePerfTier,
  resolveGraphics,
  STATIC_ANIM,
} from "./mapCanvas/perf";
import {
  findSystemAt as hitSystemAt,
  findFleetAt as hitFleetAt,
  findLegionAt as hitLegionAt,
  findHostileUnitAt as hitHostileUnitAt,
  fleetHitRadius,
  legionHitRadius,
  systemHitRadius,
} from "./mapCanvas/hitTest";
import { redrawAll as runRedrawAll } from "./mapCanvas/redrawAll";
import { bindMapInput } from "./mapCanvas/bindMapInput";

import type {
  MapViewModel,
  MapCanvasApi,
  MapCanvasProps,
  MapUnitDropPayload,
  MapContextPick,
  SystemHoverTip,
  UnitDropIntent,
  HostileUnitDropTarget,
  PerfTier,
} from "./mapCanvas/types";

export type {
  MapViewModel,
  MapCanvasApi,
  MapUnitDropPayload,
  MapContextPick,
  SystemHoverTip,
  UnitDropIntent,
  HostileUnitDropTarget,
};
export { resolveDropIntent };

export function MapCanvas({
  mode = "editor",
  readModel,
  onModelSubscribe,
  onSystemClick,
  onFleetClick,
  onLegionClick,
  playerFactionId = null,
  onUnitDrop,
  onUnitDropReject,
  onUnitDragStart,
  onViewerContextMenu,
  onSystemHold,
  onHoldProgress,
  onSystemOpen,
  interactive = true,
  hostClassName,
  apiRef,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Imperative tip — never setState from Pixi redraw (avoids remount/crash). */
  const tipElRef = useRef<HTMLDivElement>(null);
  const lastHoverTipRef = useRef<SystemHoverTip | null>(null);

  const applyHoverTipRef = useRef<(tip: SystemHoverTip | null) => void>(
    () => {},
  );
  applyHoverTipRef.current = (tip: SystemHoverTip | null) => {
    const el = tipElRef.current;
    if (!el) return;
    if (!tip) {
      el.hidden = true;
      el.replaceChildren();
      lastHoverTipRef.current = null;
      return;
    }
    const prev = lastHoverTipRef.current;
    const sameBody =
      prev &&
      prev.systemId === tip.systemId &&
      prev.name === tip.name &&
      prev.lines.length === tip.lines.length &&
      prev.lines.every((l, i) => l === tip.lines[i]);
    if (!sameBody) {
      el.replaceChildren();
      const name = document.createElement("div");
      name.className = "map-system-tip__name";
      name.textContent = tip.name;
      el.appendChild(name);
      for (const line of tip.lines) {
        const row = document.createElement("div");
        row.className = "map-system-tip__line";
        row.textContent = line;
        el.appendChild(row);
      }
    }
    el.style.left = `${tip.screenX}px`;
    el.style.top = `${tip.screenY}px`;
    el.hidden = false;
    lastHoverTipRef.current = tip;
  };
  const worldLayerRef = useRef<Container | null>(null);
  const tableFloorGRef = useRef<Graphics | null>(null);
  /** Holo structural grid — separate from tableFloor so idle floor ticks don't wipe it. */
  const tableGridGRef = useRef<Graphics | null>(null);
  const ambientGRef = useRef<Graphics | null>(null);
  /** Per-frame soft pulse under systems (idle life without full redraw). */
  const breathGRef = useRef<Graphics | null>(null);
  const breathSitesRef = useRef<
    { ix: number; iy: number; color: number }[]
  >([]);
  const territoryGRef = useRef<Graphics | null>(null);
  const territoryBorderGRef = useRef<Graphics | null>(null);
  const sectorsGRef = useRef<Graphics | null>(null);
  const territoryFpRef = useRef<string>("");
  const lastMapStyleRef = useRef<MapStyleId>("classic");
  const diplomacyGRef = useRef<Graphics | null>(null);
  const linksGRef = useRef<Graphics | null>(null);
  const systemsGRef = useRef<Graphics | null>(null);
  const fleetsGRef = useRef<Graphics | null>(null);
  const legionsGRef = useRef<Graphics | null>(null);
  const ordersGRef = useRef<Graphics | null>(null);
  const labelsRef = useRef<Container | null>(null);
  const labelPlatesGRef = useRef<Graphics | null>(null);
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
  const unitDropHoverRef = useRef<HostileUnitDropTarget | null>(null);
  const longPressRef = useRef<{
    timer: number;
    progressRaf?: number;
    sx: number;
    sy: number;
    screenX: number;
    screenY: number;
    fired: boolean;
    systemId?: string | null;
    worldPos?: Point;
    pointerEvent?: FederatedPointerEvent;
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
  /** Fleet/legion move animation: last known system + screen pos per unit
   * key, and any in-flight transit tween between them (ticked every frame,
   * independent of dirty-only redraws — see tickFxLayers). */
  const unitLastSystemRef = useRef<Map<string, string>>(new Map());
  const unitLastPosRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const unitTransitRef = useRef<
    Map<
      string,
      { fromX: number; fromY: number; toX: number; toY: number; startedAt: number }
    >
  >(new Map());
  const battleFxRef = useRef<BattleParticleField | null>(null);
  const mapFxRef = useRef<MapFxOverlay | null>(null);
  /** One-shot order-outcome flashes (move/attack/claim), pruned by expireAt
   * where fxSites is built each redraw. */
  const transientFxRef = useRef<
    { id: string; kind: MapFxKind; x: number; y: number; expireAt: number }[]
  >([]);
  /** Last battle sites for per-frame particle tick without full redraw. */
  const battleSitesRef = useRef<{ id: string; x: number; y: number }[]>([]);
  /** Throttle cull-rebuild while panning when zoomed in. */
  const panCullAtRef = useRef(0);
  /** Soft hover preview on galaxy systems (pointer, not touch-drag). */
  const hoveredSystemIdRef = useRef<string | null>(null);
  const dragHintLabelRef = useRef<Text | null>(null);
  const readModelRef = useRef(readModel);
  const onSystemClickRef = useRef(onSystemClick);
  const onFleetClickRef = useRef(onFleetClick);
  const onLegionClickRef = useRef(onLegionClick);
  const onUnitDropRef = useRef(onUnitDrop);
  const onUnitDropRejectRef = useRef(onUnitDropReject);
  const onUnitDragStartRef = useRef(onUnitDragStart);
  const onViewerContextMenuRef = useRef(onViewerContextMenu);
  const onSystemHoldRef = useRef(onSystemHold);
  const onHoldProgressRef = useRef(onHoldProgress);
  const onSystemOpenRef = useRef(onSystemOpen);
  const playerFactionIdRef = useRef(playerFactionId);
  const interactiveRef = useRef(interactive);
  const onModelSubscribeRef = useRef(onModelSubscribe);
  const apiRefInternal = useRef(apiRef);
  readModelRef.current = readModel;
  onSystemClickRef.current = onSystemClick;
  onFleetClickRef.current = onFleetClick;
  onLegionClickRef.current = onLegionClick;
  onUnitDropRef.current = onUnitDrop;
  onUnitDropRejectRef.current = onUnitDropReject;
  onUnitDragStartRef.current = onUnitDragStart;
  onViewerContextMenuRef.current = onViewerContextMenu;
  onSystemHoldRef.current = onSystemHold;
  onHoldProgressRef.current = onHoldProgress;
  onSystemOpenRef.current = onSystemOpen;
  playerFactionIdRef.current = playerFactionId;
  interactiveRef.current = interactive;
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
            fogMask: s.fogMaskPreview,
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
      showLoyalty: s.showLoyalty,
      activeFactionId: s.activeFactionId,
      graphics: s.editorGraphics,
      perfMode: s.editorGraphics.cinematic ? "cinematic" : "quality",
      mapStyle: s.mapStyle,
    };
  };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let ready = false;
    let ro: ResizeObserver | null = null;
    let onTick: ((ticker: { deltaMS: number }) => void) | null = null;
    const app = new Application();
    const getModel = () => readModelRef.current?.() ?? defaultRead();

    const safeDestroy = () => {
      if (ro) {
        ro.disconnect();
        ro = null;
      }
      if (zoomSettleTimerRef.current) {
        clearTimeout(zoomSettleTimerRef.current);
        zoomSettleTimerRef.current = null;
      }
      zoomGestureRef.current = false;
      ready = false;
      try {
        if (onTick) app.ticker.remove(onTick);
        app.ticker.stop();
      } catch {
        /* ignore */
      }
      onTick = null;
      // Destroy overlays while the scene graph is still intact.
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
      try {
        mapFxRef.current?.destroy();
      } catch {
        /* ignore */
      }
      iconOverlayRef.current = null;
      battleFxRef.current = null;
      mapFxRef.current = null;
      try {
        if (app.renderer) {
          app.destroy(true, { children: true });
        }
      } catch {
        /* ignore */
      }
      worldLayerRef.current = null;
      territoryLayerRef.current = null;
      tableFloorGRef.current = null;
      tableGridGRef.current = null;
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
      labelPlatesGRef.current = null;
      brushGRef.current = null;
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
      else app.ticker.maxFPS = 60;
      // Keep rAF alive while idle — otherwise some GPUs skip presents until the layer moves.
      app.ticker.minFPS = bare ? 8 : 24;
      if (!app.ticker.started) app.ticker.start();

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
      const tableGridG = new Graphics();
      tableGridG.eventMode = "none";
      const ambientG = new Graphics();
      const breathG = new Graphics();
      breathG.eventMode = "none";
      const territoryLayer = new Container();
      territoryLayerRef.current = territoryLayer;
      const territoryG = new Graphics();
      territoryLayer.addChild(territoryG);
      const bootGfx = resolveGraphics(bootModel, tier);
      const territoryBorderG = new Graphics();
      const sectorsG = new Graphics();
      const diplomacyG = new Graphics();
      const linksG = new Graphics();
      const systemsG = new Graphics();
      const fleetsG = new Graphics();
      const legionsG = new Graphics();
      const ordersG = new Graphics();
      const labels = new Container();
      const labelPlatesG = new Graphics();
      labelPlatesG.eventMode = "none";
      const brushG = new Graphics();

      if (!bare) {
        await ensureMapIconsLoaded();
      }
      if (cancelled) {
        for (const g of [
          tableFloorG,
          tableGridG,
          ambientG,
          breathG,
          territoryG,
          territoryBorderG,
          sectorsG,
          diplomacyG,
          linksG,
          systemsG,
          fleetsG,
          legionsG,
          ordersG,
          labelPlatesG,
          brushG,
        ]) {
          try {
            g.destroy();
          } catch {
            /* ignore */
          }
        }
        try {
          labels.destroy({ children: true });
          territoryLayer.destroy({ children: true });
        } catch {
          /* ignore */
        }
        safeDestroy();
        return;
      }

      const iconOverlay = bare ? null : new MapIconOverlay();
      const battleFx = bare ? null : new BattleParticleField(Texture.WHITE);
      const mapFx = bare ? null : new MapFxOverlay();
      battleFx?.setEnabled(
        (tier === "full" || tier === "soft") && bootGfx.battleFx,
      );
      mapFx?.setEnabled(tier === "full" || tier === "soft");
      iconOverlayRef.current = iconOverlay;
      battleFxRef.current = battleFx;
      mapFxRef.current = mapFx;

      tableFloorGRef.current = tableFloorG;
      tableGridGRef.current = tableGridG;
      ambientGRef.current = ambientG;
      breathGRef.current = breathG;
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
      labelPlatesGRef.current = labelPlatesG;
      brushGRef.current = brushG;

      worldLayer.addChild(
        tableFloorG,
        tableGridG,
        ambientG,
        territoryLayer,
        territoryBorderG,
        sectorsG,
        linksG,
        diplomacyG,
        ordersG,
        systemsG,
        breathG,
      );
      if (iconOverlay) worldLayer.addChild(iconOverlay.root);
      if (mapFx) worldLayer.addChild(mapFx.root);
      if (battleFx) worldLayer.addChild(battleFx.container);
      worldLayer.addChild(fleetsG, legionsG, labelPlatesG, labels, brushG);
      app.stage.addChild(worldLayer);

      if (cancelled) {
        safeDestroy();
        return;
      }

      applyFit();
      requestAnimationFrame(() => {
        applyFit();
        requestAnimationFrame(() => {
          applyFit();
          redrawAll();
        });
      });

      ro = new ResizeObserver(() => {
        if (cancelled || !ready || !app.renderer) return;
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
        hitTestSystemAtClient: (clientX, clientY) => {
          const rect = app.canvas.getBoundingClientRect();
          const local = worldLayer.toLocal({
            x: clientX - rect.left,
            y: clientY - rect.top,
          });
          const worldPos = fromIso(local.x, local.y);
          return findSystemAt(worldPos, getModel().world.systems);
        },
        flashSystem: (systemId, kind) => {
          const sys = getModel().world.systems.find((s) => s.id === systemId);
          if (!sys) return;
          playStaffCue("token_drop");
          const fxKind: MapFxKind =
            kind === "attack" ? "battle" : kind === "claim" ? "intel" : "selection";
          const id = `flash:${systemId}`;
          const expireAt = performance.now() + 1200;
          transientFxRef.current = [
            ...transientFxRef.current.filter(
              (t) => !(t.id === id && t.kind === fxKind),
            ),
            { id, kind: fxKind, x: sys.x, y: sys.y, expireAt },
          ];
          dirtyRef.current = true;
          window.setTimeout(() => {
            dirtyRef.current = true;
          }, 1250);
        },
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
        if (lp?.progressRaf != null) window.cancelAnimationFrame(lp.progressRaf);
        longPressRef.current = null;
        onHoldProgressRef.current?.(null);
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
          fromFleetHit: !!fleetHit,
          fromLegionHit: !!legionHit,
        };
      };

      const armLongPress = (
        e: FederatedPointerEvent,
        worldPos: Point,
        systemId?: string | null,
      ) => {
        clearLongPress();
        if (mode !== "viewer") return;
        if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
        const sx = e.global.x;
        const sy = e.global.y;
        const rect = app.canvas.getBoundingClientRect();
        const screenX = rect.left + sx;
        const screenY = rect.top + sy;
        const holdStart = performance.now();
        const tickHoldProgress = () => {
          const lp = longPressRef.current;
          if (!lp || lp.fired) return;
          const progress = Math.min(
            1,
            (performance.now() - holdStart) / LONG_PRESS_MS,
          );
          onHoldProgressRef.current?.({ x: screenX, y: screenY, progress });
          if (progress < 1) {
            lp.progressRaf = window.requestAnimationFrame(tickHoldProgress);
          }
        };
        const progressRaf = window.requestAnimationFrame(tickHoldProgress);
        const timer = window.setTimeout(() => {
          const lp = longPressRef.current;
          if (!lp || lp.fired) return;
          lp.fired = true;
          if (lp.progressRaf != null) {
            window.cancelAnimationFrame(lp.progressRaf);
          }
          onHoldProgressRef.current?.(null);
          releaseUnitPointer();
          unitDragRef.current = null;
          panRef.current.active = false;
          const pick = buildViewerPick(
            lp.pointerEvent ?? e,
            lp.worldPos ?? worldPos,
            getModel(),
          );
          const heldSystem = lp.systemId ?? pick.systemId;
          const handled =
            heldSystem &&
            onSystemHoldRef.current?.(heldSystem, screenX, screenY);
          if (!handled) {
            onViewerContextMenuRef.current?.(pick);
          }
          try {
            navigator.vibrate?.(10);
          } catch {
            /* ignore */
          }
          dirtyRef.current = true;
        }, LONG_PRESS_MS);
        longPressRef.current = {
          timer,
          progressRaf,
          sx,
          sy,
          screenX,
          screenY,
          fired: false,
          systemId: systemId ?? null,
          worldPos,
          pointerEvent: e,
        };
      };

      const findSystemAt = (
        p: Point,
        systems: StarSystem[],
        hitR?: number,
      ): StarSystem | null =>
        hitSystemAt(p, systems, systemHitRadius(isoHitR, hitR));

      const findFleetAt = (
        p: Point,
        model: MapViewModel,
        excludeFleetId?: string | null,
        expandHit = false,
      ): string | null =>
        hitFleetAt(p, model, animRef.current, {
          excludeFleetId,
          expandHit,
          hitR: fleetHitRadius(isoHitR, expandHit),
        });

      const findLegionAt = (
        p: Point,
        model: MapViewModel,
        excludeLegionId?: string | null,
        expandHit = false,
      ): string | null =>
        hitLegionAt(p, model, animRef.current, {
          excludeLegionId,
          expandHit,
          hitR: legionHitRadius(isoHitR, expandHit),
        });

      const findHostileUnitAt = (
        p: Point,
        model: MapViewModel,
        playerFid: string | null,
        dragKind: "fleet" | "legion",
        dragId: string,
      ): HostileUnitDropTarget | null => {
        const excludeFleet =
          dragKind === "fleet" && unitDragRef.current?.moved ? dragId : null;
        const excludeLegion =
          dragKind === "legion" && unitDragRef.current?.moved ? dragId : null;
        return hitHostileUnitAt(
          p,
          model,
                playerFid,
          dragKind,
          animRef.current,
          excludeFleet,
          excludeLegion,
          isoHitR,
        );
      };

      const unbindMapInput = bindMapInput({
        mode,
        app,
        host,
        worldLayer,
        getModel,
        toWorld,
        isoHitR,
        findSystemAt,
        findFleetAt,
        findLegionAt,
        findHostileUnitAt,
        clearLongPress,
        armLongPress,
        releaseUnitPointer,
        captureUnitPointer,
        zoomAtScreen,
        endZoomGesture,
        redrawBrushPreview,
        applyHoverTipRef,
        brushGRef,
        dirtyRef,
        draggingIdRef,
        drawingRef,
        hoveredSystemIdRef,
        interactiveRef,
        lastClickRef,
        lastPointerWorldRef,
        longPressRef,
        marqueeRef,
        multiDragRef,
        onFleetClickRef,
        onLegionClickRef,
        onSystemClickRef,
        onSystemOpenRef,
        onUnitDragStartRef,
        onUnitDropRef,
        onUnitDropRejectRef,
        onViewerContextMenuRef,
        panCullAtRef,
        panRef,
        pinchRef,
        playerFactionIdRef,
        strokeRef,
        unitDragRef,
        unitDropHoverRef,
        worldLayerRef,
        zoomGestureRef,
      });

      let fxFrame = 0;
      const tickFxLayers = (
        dt: number,
        gfx: ReturnType<typeof resolveGraphics>,
        tierNow: PerfTier,
      ) => {
        if (!gfx.animations || tierNow === "bare") {
          const breath = breathGRef.current;
          if (breath) breath.clear();
          return;
        }
        const anim = animRef.current;
        const lite = tierNow === "lite";
        const cinematicBoost = gfx.cinematic && tierNow === "full";
        fxFrame += 1;

        // Whole-map "alive" feel: ambient only (~120 stars + table), not 777 systems.
        if (gfx.tableFx) {
          const ambient = ambientGRef.current;
          if (ambient) {
            drawStarfield(ambient, anim, {
              lite,
              cinematic: cinematicBoost,
            });
            // Nudge transform so WebGL presents even when the camera is still.
            ambient.rotation = (fxFrame & 1) * 1e-6;
          }
          // Floor is heavier — pulse every other frame.
          const floor = tableFloorGRef.current;
          if (floor && (fxFrame & 1) === 0) {
            drawTableFloor(floor, anim, lite);
          }
        }

        // Soft system halos — visible idle motion without rebaking glyphs.
        const breath = breathGRef.current;
        if (breath) {
          breath.clear();
          const sites = breathSitesRef.current;
          const cap = cinematicBoost ? 220 : 140;
          const n = Math.min(sites.length, cap);
          for (let i = 0; i < n; i++) {
            const s = sites[i]!;
            const rx = 15 + anim.pulse * 2.2;
            const ry = 7.5 + anim.pulse * 1.1;
            breath.ellipse(s.ix, s.iy, rx, ry);
            breath.stroke({
              width: 1.15,
              color: s.color,
              alpha: 0.1 + anim.pulse * 0.14,
            });
          }
        }

        mapFxRef.current?.tick(anim);

        const borderG = territoryBorderGRef.current;
        if (borderG?.visible) {
          borderG.alpha = 0.88 + anim.pulse * 0.12;
        }
        const labels = labelsRef.current;
        if (labels) {
          const breatheAmp = cinematicBoost ? 0.14 : 0.08;
          const breathe = 0.92 + anim.pulse * breatheAmp;
          for (const child of labels.children) {
            if (!child.visible) continue;
            const base = (child as { __baseAlpha?: number }).__baseAlpha;
            if (base != null) child.alpha = base * breathe;
          }
        }
        if ((gfx.battleFx || gfx.scarFx) && battleFxRef.current) {
          battleFxRef.current.sync(battleSitesRef.current, dt);
        }
        // Unit/battle sprite bob — pool transforms only, no systemsG clear.
        if (gfx.animations) {
          iconOverlayRef.current?.tickBob(anim);
          if (unitTransitRef.current.size > 0) {
            const now = performance.now();
            const overrides = new Map<string, { x: number; y: number }>();
            for (const [key, tr] of unitTransitRef.current) {
              const t = Math.min(1, (now - tr.startedAt) / UNIT_TRANSIT_MS);
              if (t >= 1) {
                unitTransitRef.current.delete(key);
                continue;
              }
              const eased = 1 - Math.pow(1 - t, 3);
              overrides.set(key, {
                x: tr.fromX + (tr.toX - tr.fromX) * eased,
                y: tr.fromY + (tr.toY - tr.fromY) * eased,
              });
            }
            if (overrides.size > 0) {
              iconOverlayRef.current?.overridePositions(overrides);
            }
          }
        }
      };

      onTick = (ticker: { deltaMS: number }) => {
        if (cancelled || !ready || !app.renderer) return;
        const tier = perfTierRef.current;
        const dt = Math.min(0.05, ticker.deltaMS / 1000);
        lastDtRef.current = dt;
        const gfx = resolveGraphics(getModel(), tier);

        if (tier === "bare" || !gfx.animations) {
          animRef.current = STATIC_ANIM;
        } else {
          animRef.current = makeAnim(animRef.current.t + dt);
        }

        // Geometry only when dirty (pan/zoom/store). Idle life = breath + sprite bob.
        if (
          dirtyRef.current &&
          !(zoomGestureRef.current && !gfx.liveZoomRebuild)
        ) {
          dirtyRef.current = false;
          lastRedrawMsRef.current = performance.now();
          try {
            redrawAll(false);
          } catch (err) {
            // Swallow mid-teardown; log real theme/draw failures once.
            if (!(err instanceof Error && /destroyed|disposed/i.test(err.message))) {
              console.warn("[GMap] redrawAll failed", err);
            }
          }
        }

        // Ambient + marker pulse every frame — works with a still camera.
        try {
          tickFxLayers(dt, gfx, tier);
        } catch {
          /* mid-teardown */
        }

        if (tier !== "bare" && app.renderer && gfx.animations) {
          // Explicit present: some GPUs skip frames until a layer moves.
          try {
            app.renderer.render(app.stage);
          } catch {
            /* renderer torn down mid-tick */
          }
        }
      };
      app.ticker.add(onTick);

      redrawAll();

      (host as HTMLDivElement & {
        __gmapTouchCleanup?: () => void;
      }).__gmapTouchCleanup = () => {
          if (ro) {
            ro.disconnect();
            ro = null;
          }
          try {
            unbindMapInput();
          } catch {
            /* canvas already detached */
          }
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

    const waitFrames = (n = 2) =>
      new Promise<void>((resolve) => {
        let left = n;
        const step = () => {
          left -= 1;
          if (left <= 0) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

    /** @param pulseOnly skip territory/links/floor — idle glyph breathe only */
    function redrawAll(pulseOnly = false) {
      runRedrawAll(
        {
          mode,
          app,
          getModel,
          ambientGRef,
          animRef,
          applyHoverTipRef,
          battleFxRef,
          battleSitesRef,
          breathSitesRef,
          brushGRef,
          diplomacyGRef,
          dirtyRef,
          dragHintLabelRef,
          drawingRef,
          emblemLoadingRef,
          emblemMapRef,
          fleetsGRef,
          fleetStackLabelMapRef,
          hoveredSystemIdRef,
          iconOverlayRef,
          labelMapRef,
          labelPlatesGRef,
          labelsRef,
          lastDtRef,
          lastHoverTipRef,
          lastMapStyleRef,
          lastPointerWorldRef,
          legionsGRef,
          linksGRef,
          mapFxRef,
          marqueeRef,
          ordersGRef,
          panRef,
          perfTierRef,
          playerFactionIdRef,
          sectorsGRef,
          systemsGRef,
          tableFloorGRef,
          tableGridGRef,
          territoryBorderGRef,
          territoryFpRef,
          territoryGRef,
          territoryLayerRef,
          transientFxRef,
          unitDragRef,
          unitDropHoverRef,
          unitLastPosRef,
          unitLastSystemRef,
          unitTransitRef,
          worldLayerRef,
        },
        pulseOnly,
      );
    }

    registerMapPngExporter(async (opts?: MapPngExportOptions) => {
      if (!ready || !app.renderer?.extract) return null;
      const extract = app.renderer.extract;
      const scope = opts?.scope ?? "viewport";
      const layer = worldLayerRef.current;
      if (!layer) return null;

      const ensureRendererSize = () => {
        const w = Math.max(1, host.clientWidth || 0);
        const h = Math.max(1, host.clientHeight || 0);
        if (w < 2 || h < 2) return false;
        if (app.renderer.width !== w || app.renderer.height !== h) {
          app.renderer.resize(w, h);
        }
        return true;
      };

      const captureStage = async () => {
        try {
          dirtyRef.current = true;
          redrawAll(false);
          app.renderer.render(app.stage);
          await waitFrames(1);
          const dataUrl = await extract.base64({
            target: app.stage,
            format: "png",
          });
          return dataUrl || null;
        } catch (err) {
          console.warn("[GMap] extract.base64 failed", err);
          return null;
        }
      };

      if (scope !== "playerVisible") {
        return captureStage();
      }

      const st = useWorldStore.getState();
      const factionId = opts?.factionId ?? st.activeFactionId;
      if (!factionId) return null;

      const visible = getVisibleSystemIdsWithFog(
        st.world,
        factionId,
        st.fogMaskPreview,
      );
      const visibleSystems = st.world.systems.filter((s) => visible.has(s.id));
      if (visibleSystems.length === 0) return null;

      const saved = {
        gmOmniscientView: st.gmOmniscientView,
        showFogPreview: st.showFogPreview,
        activeFactionId: st.activeFactionId,
        layerX: layer.x,
        layerY: layer.y,
        layerScale: layer.scale.x,
      };

      try {
        useWorldStore.setState({
          gmOmniscientView: false,
          showFogPreview: false,
          activeFactionId: factionId,
        });
        await waitFrames(2);
        if (!ensureRendererSize()) return null;
        fitSystemsInView(
          layer,
          visibleSystems,
          app.screen.width,
          app.screen.height,
          0.14,
        );
        return await captureStage();
      } finally {
        useWorldStore.setState({
          gmOmniscientView: saved.gmOmniscientView,
          showFogPreview: saved.showFogPreview,
          activeFactionId: saved.activeFactionId,
        });
        layer.position.set(saved.layerX, saved.layerY);
        layer.scale.set(saved.layerScale);
        dirtyRef.current = true;
        redrawAll(false);
      }
    });

    return () => {
      cancelled = true;
      ready = false;
      applyHoverTipRef.current(null);
      unsub();
      registerMapPngExporter(null);
      const cleanup = (
        host as HTMLDivElement & { __gmapTouchCleanup?: () => void }
      ).__gmapTouchCleanup;
      cleanup?.();
      const labels = labelsRef.current;
      if (labels) {
        const tagged = labels as Container & { __embGen?: number };
        tagged.__embGen = (tagged.__embGen ?? 0) + 1;
        clearImperialPlaqueCache(labels);
        clearHoloPlaqueCache(labels);
      }
      // Clear pools only — DisplayObjects die with app.destroy({ children: true }).
      labelMapRef.current.clear();
      fleetStackLabelMapRef.current.clear();
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
  }, [mode]);

  return (
    <div
      className={hostClassName ? `map-host ${hostClassName}` : "map-host"}
      ref={hostRef}
    >
      <div
        ref={tipElRef}
        className="map-system-tip"
        role="tooltip"
        hidden
      />
    </div>
  );
}

