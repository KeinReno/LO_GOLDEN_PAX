import { useEffect, useRef, useState } from "react";
import { Application, Container, Graphics } from "pixi.js";
import { useWorldStore } from "../state/worldStore";
import { systemsWithinMoveRange } from "../state/movementRange";
import { drawLinksLayer } from "./layers/linksLayer";
import { drawSystemsLayer } from "./layers/systemsLayer";
import { drawForcesLayer } from "./layers/forcesLayer";
import { drawMoveRangeLayer } from "./layers/moveRangeLayer";
import { fitMapToScreen, pickMapTarget, screenToIso } from "./mapPick";

const LONG_PRESS_MS = 500;

export function MapStage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<Container | null>(null);
  const layerStateRef = useRef({ x: 0, y: 0, scale: 1 });
  const fittedCampaignRef = useRef<string | null>(null);
  const paintRef = useRef<() => void>(() => {});
  const [stageReady, setStageReady] = useState(false);

  const view = useWorldStore((s) => s.view);
  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);
  const selectedForceId = useWorldStore((s) => s.selectedForceId);
  const moveForceId = useWorldStore((s) => s.moveForceId);
  const setSelectedSystemId = useWorldStore((s) => s.setSelectedSystemId);
  const setSelectedForceId = useWorldStore((s) => s.setSelectedForceId);
  const setMoveForceId = useWorldStore((s) => s.setMoveForceId);
  const setActionRing = useWorldStore((s) => s.setActionRing);
  const moveForce = useWorldStore((s) => s.moveForce);

  const linksGRef = useRef<Graphics | null>(null);
  const rangeGRef = useRef<Graphics | null>(null);
  const systemsGRef = useRef<Graphics | null>(null);
  const forcesGRef = useRef<Graphics | null>(null);

  const dragRef = useRef<{
    mode: "pan" | "force" | null;
    forceId?: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    longPressTimer?: ReturnType<typeof setTimeout>;
    longPressForceId?: string;
  }>({ mode: null, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    const app = new Application();
    appRef.current = app;

    app
      .init({ resizeTo: host, backgroundColor: 0x05060a, antialias: true })
      .then(() => {
        if (disposed) {
          app.destroy(true, { children: true });
          return;
        }
        host.appendChild(app.canvas);

        const world = new Container();
        worldRef.current = world;
        app.stage.addChild(world);

        const linksG = new Graphics();
        const rangeG = new Graphics();
        const systemsG = new Graphics();
        const forcesG = new Graphics();
        linksGRef.current = linksG;
        rangeGRef.current = rangeG;
        systemsGRef.current = systemsG;
        forcesGRef.current = forcesG;
        world.addChild(linksG, rangeG, systemsG, forcesG);

        function applyTransform(x: number, y: number, scale: number) {
          const prevScale = layerStateRef.current.scale;
          layerStateRef.current = { x, y, scale };
          world.position.set(x, y);
          world.scale.set(scale);
          if (prevScale !== scale) paint();
        }

        function tryFit() {
          const v = useWorldStore.getState().view;
          if (!v?.systems.length) return;
          const w = app.screen.width;
          const h = app.screen.height;
          if (w < 40 || h < 40) return;
          if (fittedCampaignRef.current === v.campaign.id) return;
          const fit = fitMapToScreen(v.systems, w, h);
          fittedCampaignRef.current = v.campaign.id;
          applyTransform(fit.x, fit.y, fit.scale);
        }

        function paint() {
          const current = useWorldStore.getState();
          const v = current.view;
          if (!v || !linksGRef.current || !systemsGRef.current || !forcesGRef.current || !rangeGRef.current) return;
          const scale = layerStateRef.current.scale;
          const factionColors: Record<string, string> = {};
          if (v.self.faction.colorHex) factionColors[v.self.faction.id] = v.self.faction.colorHex;
          for (const o of v.others) factionColors[o.id] = o.colorHex;

          const visible = new Set(v.visibleSystemIds.length ? v.visibleSystemIds : v.systems.map((s) => s.id));
          const systems = v.systems.filter((s) => visible.has(s.id));
          const systemsById = new Map(systems.map((s) => [s.id, s]));

          drawLinksLayer(linksGRef.current, v.links, systemsById, visible, scale);
          drawSystemsLayer(systemsGRef.current, systems, factionColors, current.selectedSystemId, scale);

          const selfId = v.viewer.role === "player" ? v.viewer.factionId : null;
          const activeMoveId = current.moveForceId ?? current.selectedForceId;
          drawForcesLayer(
            forcesGRef.current,
            v.forces,
            systemsById,
            factionColors,
            selfId,
            current.selectedForceId,
            activeMoveId,
            scale,
          );

          const moving = activeMoveId ? v.forces.find((f) => f.id === activeMoveId) : null;
          if (moving?.systemId) {
            const mode = moving.kind === "legion" ? "legion" : "fleet";
            const reachable = systemsWithinMoveRange({ links: v.links }, moving.systemId, mode);
            drawMoveRangeLayer(rangeGRef.current, systems, reachable, scale);
          } else {
            rangeGRef.current.clear();
          }
        }

        paintRef.current = () => {
          tryFit();
          paint();
        };

        const canvas = app.canvas;
        const onPointerDown = (e: PointerEvent) => handlePointerDown(e);
        const onPointerMove = (e: PointerEvent) => handlePointerMove(e);
        const onPointerUp = (e: PointerEvent) => handlePointerUp(e);
        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const { x, y, scale } = layerStateRef.current;
          const factor = e.deltaY > 0 ? 0.9 : 1.1;
          const next = Math.min(8, Math.max(0.02, scale * factor));
          const ix = (sx - x) / scale;
          const iy = (sy - y) / scale;
          applyTransform(sx - ix * next, sy - iy * next, next);
        };
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointerleave", onPointerUp);
        canvas.addEventListener("wheel", onWheel, { passive: false });

        function handlePointerDown(e: PointerEvent) {
          const currentView = useWorldStore.getState().view;
          if (!worldRef.current || !currentView) return;

          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;
          const { x, y, scale } = layerStateRef.current;
          const { ix, iy } = screenToIso(sx, sy, x, y, scale);

          const systems = currentView.systems;
          const systemsById = new Map(systems.map((s) => [s.id, s]));
          const target = pickMapTarget(systems, currentView.forces, systemsById, ix, iy, scale);
          const selfId = currentView.viewer.role === "player" ? currentView.viewer.factionId : null;

          dragRef.current.startX = sx;
          dragRef.current.startY = sy;
          dragRef.current.originX = x;
          dragRef.current.originY = y;

          if (target?.type === "force" && selfId && target.force.factionId === selfId) {
            dragRef.current.mode = "force";
            dragRef.current.forceId = target.force.id;
            dragRef.current.longPressForceId = target.force.id;
            dragRef.current.longPressTimer = setTimeout(() => {
              setActionRing({ x: e.clientX, y: e.clientY, forceId: target.force.id });
            }, LONG_PRESS_MS);
            setSelectedForceId(target.force.id);
            setMoveForceId(target.force.id);
            canvas.setPointerCapture(e.pointerId);
            return;
          }

          dragRef.current.mode = "pan";
          canvas.setPointerCapture(e.pointerId);
        }

        function handlePointerMove(e: PointerEvent) {
          const drag = dragRef.current;
          if (!drag.mode) return;
          const rect = canvas.getBoundingClientRect();
          const sx = e.clientX - rect.left;
          const sy = e.clientY - rect.top;

          if (drag.mode === "pan") {
            const dx = sx - drag.startX;
            const dy = sy - drag.startY;
            applyTransform(drag.originX + dx, drag.originY + dy, layerStateRef.current.scale);
          } else if (drag.mode === "force") {
            const moved = Math.hypot(sx - drag.startX, sy - drag.startY);
            if (moved > 8 && drag.longPressTimer) {
              clearTimeout(drag.longPressTimer);
              drag.longPressTimer = undefined;
            }
          }
        }

        async function handlePointerUp(e: PointerEvent) {
          const drag = dragRef.current;
          if (drag.longPressTimer) {
            clearTimeout(drag.longPressTimer);
            drag.longPressTimer = undefined;
          }

          const currentView = useWorldStore.getState().view;
          const { scale } = layerStateRef.current;
          if (drag.mode === "force" && currentView && drag.forceId) {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const { x, y } = layerStateRef.current;
            const { ix, iy } = screenToIso(sx, sy, x, y, scale);
            const systemsById = new Map(currentView.systems.map((s) => [s.id, s]));
            const sys = pickMapTarget(currentView.systems, [], systemsById, ix, iy, scale);
            if (sys?.type === "system") {
              const force = currentView.forces.find((f) => f.id === drag.forceId);
              if (force?.systemId) {
                const graph = { links: currentView.links };
                const mode = force.kind === "legion" ? "legion" : "fleet";
                const reachable = systemsWithinMoveRange(graph, force.systemId, mode);
                if (reachable.has(sys.system.id)) {
                  await moveForce(drag.forceId, sys.system.id);
                }
              }
            }
          } else if (drag.mode === "pan" && currentView) {
            const rect = canvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const moved = Math.hypot(sx - drag.startX, sy - drag.startY);
            if (moved < 6) {
              const { x, y } = layerStateRef.current;
              const { ix, iy } = screenToIso(sx, sy, x, y, scale);
              const systemsById = new Map(currentView.systems.map((s) => [s.id, s]));
              const target = pickMapTarget(currentView.systems, currentView.forces, systemsById, ix, iy, scale);
              if (target?.type === "system") {
                setSelectedSystemId(target.system.id);
              } else if (target?.type === "force") {
                setSelectedForceId(target.force.id);
              }
            }
          }

          dragRef.current.mode = null;
          dragRef.current.forceId = undefined;
          try {
            canvas.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }

        const ro = new ResizeObserver(() => {
          if (fittedCampaignRef.current) return;
          paintRef.current();
        });
        ro.observe(host);

        setStageReady(true);
        paintRef.current();

        (canvas as HTMLCanvasElement & { __gpDispose?: () => void }).__gpDispose = () => {
          ro.disconnect();
          canvas.removeEventListener("pointerdown", onPointerDown);
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerup", onPointerUp);
          canvas.removeEventListener("pointerleave", onPointerUp);
          canvas.removeEventListener("wheel", onWheel);
        };
      });

    return () => {
      disposed = true;
      setStageReady(false);
      fittedCampaignRef.current = null;
      const canvas = app.canvas as (HTMLCanvasElement & { __gpDispose?: () => void }) | undefined;
      canvas?.__gpDispose?.();
      if (app.renderer) app.destroy(true, { children: true });
      appRef.current = null;
      worldRef.current = null;
    };
  }, [moveForce, setActionRing, setSelectedForceId, setSelectedSystemId, setMoveForceId]);

  useEffect(() => {
    if (!stageReady || !view) return;
    if (fittedCampaignRef.current && fittedCampaignRef.current !== view.campaign.id) {
      fittedCampaignRef.current = null;
    }
    paintRef.current();
  }, [stageReady, view, selectedSystemId, selectedForceId, moveForceId]);

  if (!view) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500">
        No map data
      </div>
    );
  }

  return <div ref={hostRef} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
