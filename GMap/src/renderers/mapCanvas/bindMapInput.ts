import type { MutableRefObject } from "react";
import type { Application, Container, FederatedPointerEvent } from "pixi.js";
import type { Point } from "../../generators/brushGenerator";
import type { StarSystem } from "../../state/types";
import { useWorldStore } from "../../state/worldStore";
import { fromIso, toIso } from "../iso";
import { questMarkerHit } from "../drawMapFeatures";
import { questsAtSystem } from "../../state/mapFeatures";
import { POI_PAINT_TOOLS } from "../../state/types";
import { hopDistance } from "../../state/pathfinding";
import { canAttackHostileUnit } from "../../state/combatEligibility";
import { findLinkAt } from "./geometry";
import { resolveDropIntent } from "./dropIntent";
import {
  SYSTEM_DROP_R,
  DRAG_START_PX,
  DOUBLE_TAP_MS,
} from "./constants";
import type {
  HostileUnitDropTarget,
  MapContextPick,
  MapViewModel,
} from "./types";

export type MapInputBindCtx = {
  mode: "editor" | "viewer";
  app: Application;
  host: HTMLDivElement;
  worldLayer: Container;
  getModel: () => MapViewModel;
  toWorld: (e: FederatedPointerEvent) => Point;
  isoHitR: (base: number, minPx?: number) => number;
  findSystemAt: (
    p: Point,
    systems: StarSystem[],
    hitR?: number,
  ) => StarSystem | null;
  findFleetAt: (
    p: Point,
    model: MapViewModel,
    excludeFleetId?: string | null,
    expandHit?: boolean,
  ) => string | null;
  findLegionAt: (
    p: Point,
    model: MapViewModel,
    excludeLegionId?: string | null,
    expandHit?: boolean,
  ) => string | null;
  findHostileUnitAt: (
    p: Point,
    model: MapViewModel,
    playerFid: string | null,
    dragKind: "fleet" | "legion",
    dragId: string,
  ) => HostileUnitDropTarget | null;
  clearLongPress: () => void;
  armLongPress: (
    e: FederatedPointerEvent,
    worldPos: Point,
    systemId?: string | null,
  ) => void;
  releaseUnitPointer: () => void;
  captureUnitPointer: (e: FederatedPointerEvent) => number | null;
  zoomAtScreen: (sx: number, sy: number, factor: number) => void;
  endZoomGesture: () => void;
  redrawBrushPreview: (stroke: Point[]) => void;
  applyHoverTipRef: MutableRefObject<any>;
  brushGRef: MutableRefObject<any>;
  dirtyRef: MutableRefObject<any>;
  draggingIdRef: MutableRefObject<any>;
  drawingRef: MutableRefObject<any>;
  hoveredSystemIdRef: MutableRefObject<any>;
  interactiveRef: MutableRefObject<any>;
  lastClickRef: MutableRefObject<any>;
  lastPointerWorldRef: MutableRefObject<any>;
  longPressRef: MutableRefObject<any>;
  marqueeRef: MutableRefObject<any>;
  multiDragRef: MutableRefObject<any>;
  onFleetClickRef: MutableRefObject<any>;
  onLegionClickRef: MutableRefObject<any>;
  onSystemClickRef: MutableRefObject<any>;
  onSystemOpenRef: MutableRefObject<any>;
  onUnitDragStartRef: MutableRefObject<any>;
  onUnitDropRef: MutableRefObject<any>;
  onUnitDropRejectRef: MutableRefObject<any>;
  onViewerContextMenuRef: MutableRefObject<any>;
  panCullAtRef: MutableRefObject<any>;
  panRef: MutableRefObject<any>;
  pinchRef: MutableRefObject<any>;
  playerFactionIdRef: MutableRefObject<any>;
  strokeRef: MutableRefObject<any>;
  unitDragRef: MutableRefObject<any>;
  unitDropHoverRef: MutableRefObject<any>;
  worldLayerRef: MutableRefObject<any>;
  zoomGestureRef: MutableRefObject<any>;
};

/** Wire Pixi stage + canvas pointer/touch/wheel. Returns cleanup. */
export function bindMapInput(ctx: MapInputBindCtx): () => void {
  const {
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
  } = ctx;

      app.stage.eventMode = "static";
      app.stage.hitArea = app.screen;

      {
        // Keep Pixi app alive across interactive toggles; gate via ref.
        app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
          if (!interactiveRef.current) {
            panRef.current = { active: true, lx: e.global.x, ly: e.global.y };
            return;
          }
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
                  wasSelected: model.selectedFleetId === fleetId,
                };
                lastPointerWorldRef.current = worldPos;
                onUnitDragStartRef.current?.("fleet", fleetId);
                armLongPress(e, worldPos);
                dirtyRef.current = true;
              } else {
                onFleetClickRef.current?.(fleetId, {
                  x: e.global.x,
                  y: e.global.y,
                });
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
                  wasSelected: model.selectedLegionId === legionId,
                };
                lastPointerWorldRef.current = worldPos;
                onUnitDragStartRef.current?.("legion", legionId);
                armLongPress(e, worldPos);
                dirtyRef.current = true;
              } else {
                onLegionClickRef.current?.(legionId, {
                  x: e.global.x,
                  y: e.global.y,
                });
                armLongPress(e, worldPos);
              }
              return;
            }
            const hit = findSystemAt(worldPos, model.world.systems);
            if (hit) {
              armLongPress(e, worldPos, hit.id);
              const now = performance.now();
              const last = lastClickRef.current;
              // Double-tap open — only for mouse; touch uses long-press menu / explicit dive.
              if (
                e.pointerType === "mouse" &&
                last &&
                last.id === hit.id &&
                now - last.t < DOUBLE_TAP_MS
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
          const fullWorld = state.world;
          const viewSystems = getModel().world.systems;
          const viewLinks = getModel().world.links;
          const fogTool =
            state.tool === "fog_paint" || state.tool === "fog_erase";
          const hitPool = fogTool ? fullWorld.systems : viewSystems;

          // Alt + Click quick express inspector
          if (e.altKey) {
            const hitSys = findSystemAt(worldPos, viewSystems);
            const hitFleet = findFleetAt(worldPos, model);
            const hitLegion = findLegionAt(worldPos, model);
            const hitLink = findLinkAt(worldPos, viewLinks, viewSystems);
            if (hitSys || hitFleet || hitLegion || hitLink) {
              state.setAltInspector({
                screenX: e.global.x,
                screenY: e.global.y,
                systemId: hitSys?.id ?? null,
                fleetId: hitFleet ?? null,
                legionId: hitLegion ?? null,
                linkId: hitLink?.id ?? null,
              });
              return;
            }
          }
          state.setAltInspector(null);

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

          const hit = findSystemAt(worldPos, hitPool);
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
            const token = (
              window as unknown as { __GMAP_MASTER_TOKEN?: string }
            ).__GMAP_MASTER_TOKEN;
            const sync = (
              window as unknown as { __GMAP_SYNC_MSG?: (msg: string) => void }
            ).__GMAP_SYNC_MSG;
            const ids =
              state.selectedSystemIds.includes(hit.id) &&
              state.selectedSystemIds.length > 1
                ? state.selectedSystemIds
                : [hit.id];
            const mode = state.tool === "fog_erase" ? "erase" : "paint";
            void state
              .paintFogBrush(ids, mode, token ?? "")
              .then((result) => {
                dirtyRef.current = true;
                if (!sync) return;
                if (result.ok) {
                  const names = ids
                    .map(
                      (id) =>
                        fullWorld.systems.find((s) => s.id === id)?.name ?? id,
                    )
                    .join(", ");
                  sync(
                    `Туман${mode === "erase" ? "−" : "+"} · ${names} (${ids.length})`,
                  );
                } else {
                  sync(result.error ?? "Ошибка тумана");
                }
              });
            return;
          }

          if (state.tool === "consequence_paint") {
            if (!hit) return;
            const presetId =
              useWorldStore.getState().activeConsequencePresetId;
            if (!presetId) return;
            const token = (
              window as unknown as { __GMAP_MASTER_TOKEN?: string }
            ).__GMAP_MASTER_TOKEN;
            if (!token) return;
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
              (state.world.legions ?? []).find((l) => l.id === legionHit)?.systemId ??
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
            if (d.moved && mode === "viewer") {
              const hover = findHostileUnitAt(
                p,
                getModel(),
                playerFactionIdRef.current,
                d.kind,
                d.id,
              );
              if (
                hover &&
                playerFactionIdRef.current &&
                !canAttackHostileUnit(
                  getModel().world,
                  playerFactionIdRef.current,
                  hover.targetKind === "fleet"
                    ? getModel().world.fleets.find(
                        (f) => f.id === hover.targetId,
                      )!.factionId
                    : getModel().world.legions.find(
                        (l) => l.id === hover.targetId,
                      )!.factionId,
                  hover.systemId,
                )
              ) {
                unitDropHoverRef.current = null;
              } else {
                unitDropHoverRef.current = hover;
              }
            } else {
              unitDropHoverRef.current = null;
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
            // Zoomed-in cull leaves empty edges unless we rebuild while panning.
            const sc = worldLayerRef.current.scale.x || 1;
            if (sc >= 0.62) {
              const now = performance.now();
              if (now - panCullAtRef.current > 90) {
                panCullAtRef.current = now;
                dirtyRef.current = true;
              }
            }
            if (hoveredSystemIdRef.current) {
              hoveredSystemIdRef.current = null;
              dirtyRef.current = true;
              applyHoverTipRef.current(null);
            }
            return;
          }

          // Soft hover ring (mouse); skip while pointer is coarse/touching
          if (e.pointerType === "mouse" || e.pointerType === "pen") {
            const worldPos = toWorld(e);
            const hit = findSystemAt(worldPos, getModel().world.systems);
            const nextId = hit?.id ?? null;
            if (nextId !== hoveredSystemIdRef.current) {
              hoveredSystemIdRef.current = nextId;
              dirtyRef.current = true;
              if (!nextId) applyHoverTipRef.current(null);
            }
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
            unitDropHoverRef.current = null;
            if (drag.moved && !longFired) {
              const modelNow = getModel();
              const playerFid = playerFactionIdRef.current;
              let dropHandled = false;
              const hostile = findHostileUnitAt(
                lastPointerWorldRef.current,
                modelNow,
                playerFid,
                drag.kind,
                drag.id,
              );
              if (hostile && mode === "viewer" && playerFid) {
                const unit =
                  drag.kind === "fleet"
                    ? modelNow.world.fleets.find((f) => f.id === drag.id)
                    : (modelNow.world.legions ?? []).find((l) => l.id === drag.id);
                const fromSystemId = unit?.systemId ?? "";
                const travelMode =
                  drag.kind === "fleet" ? "fleet" : "legion";
                const hops = hopDistance(
                  modelNow.world,
                  fromSystemId,
                  hostile.systemId,
                  travelMode,
                );
                const targetFac =
                  hostile.targetKind === "fleet"
                    ? modelNow.world.fleets.find(
                        (f) => f.id === hostile.targetId,
                      )?.factionId
                    : (modelNow.world.legions ?? []).find(
                        (l) => l.id === hostile.targetId,
                      )?.factionId;
                const attackOk =
                  !!targetFac &&
                  canAttackHostileUnit(
                    modelNow.world,
                    playerFid,
                    targetFac,
                    hostile.systemId,
                  ) &&
                  Number.isFinite(hops) &&
                  hops >= 0;
                if (attackOk && fromSystemId) {
                  onUnitDropRef.current?.({
                    kind: drag.kind,
                    unitId: drag.id,
                    fromSystemId,
                    toSystemId: hostile.systemId,
                    hops,
                    intent: "attack",
                    targetUnitKind: hostile.targetKind,
                    targetUnitId: hostile.targetId,
                    targetFactionId: targetFac,
                  });
                  dropHandled = true;
                } else if (hostile) {
                  onUnitDropRejectRef.current?.(
                    "Нельзя атаковать эту цель (нет войны или прав)",
                  );
                }
              }

              if (!dropHandled) {
              const target = findSystemAt(
                lastPointerWorldRef.current,
                modelNow.world.systems,
                isoHitR(SYSTEM_DROP_R, 56),
              );
              if (target) {
                const unit =
                  drag.kind === "fleet"
                    ? modelNow.world.fleets.find((f) => f.id === drag.id)
                    : (modelNow.world.legions ?? []).find((l) => l.id === drag.id);
                const fromSystemId = unit?.systemId ?? "";
                const travelMode =
                  drag.kind === "fleet" ? "fleet" : "legion";
                const hops = hopDistance(
                  modelNow.world,
                  fromSystemId,
                  target.id,
                  travelMode,
                );
                if (mode === "viewer") {
                  const intent = resolveDropIntent(
                    target,
                    playerFactionIdRef.current,
                    modelNow.world,
                  );
                  const sameSystem = fromSystemId === target.id;
                  const canDrop =
                    fromSystemId &&
                    Number.isFinite(hops) &&
                    hops >= 0 &&
                    (!sameSystem || intent === "attack");
                  if (canDrop && (hops > 0 || (sameSystem && intent === "attack"))) {
                    onUnitDropRef.current?.({
                      kind: drag.kind,
                      unitId: drag.id,
                      fromSystemId,
                      toSystemId: target.id,
                      hops,
                      intent,
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
              }
            } else if (mode === "viewer" && !longFired) {
              // Tap without drag → select
              const screen = {
                x: drag.startScreenX,
                y: drag.startScreenY,
              };
              const retain = !drag.wasSelected;
              if (drag.kind === "fleet") onFleetClickRef.current?.(drag.id, screen, retain);
              else onLegionClickRef.current?.(drag.id, screen, retain);
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
            if (last && last.id === sid && now - last.t < DOUBLE_TAP_MS) {
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
          if (!interactiveRef.current) return;
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
            fromFleetHit: !!fleetHit,
            fromLegionHit: !!legionHit,
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
              (state.world.legions ?? []).find((l) => l.id === legionHit)?.systemId ??
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
          try {
            app.canvas?.removeEventListener("contextmenu", openContextMenu);
          } catch {
            /* canvas already detached */
          }
        };
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


  return () => {
    try {
      app.stage.removeAllListeners();
    } catch {
      /* ignore */
    }
    try {
      app.canvas?.removeEventListener("touchstart", onTouchStart);
      app.canvas?.removeEventListener("touchmove", onTouchMove);
      app.canvas?.removeEventListener("touchend", onTouchEnd);
      app.canvas?.removeEventListener("touchcancel", onTouchEnd);
    } catch {
      /* ignore */
    }
    try {
      (
        host as HTMLDivElement & { __gmapCtxCleanup?: () => void }
      ).__gmapCtxCleanup?.();
    } catch {
      /* ignore */
    }
  };
}
