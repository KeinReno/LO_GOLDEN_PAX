import type { MutableRefObject } from "react";
import type { MapViewModel } from "../../renderers/MapCanvas";
import type { MapStyleId } from "../../renderers/styles/mapTheme";
import type { ViewerPayload } from "../../state/types";
import { layersForPerfChoice, writeStoredViewerLayers } from "../../ui/mapLayers";
import {
  clampPerfForDevice,
  graphicsForPerf,
  writeStoredGraphics,
} from "../../ui/viewerGraphics";
import { closeViewerMapOverlays } from "../features/rooms-router/navigateViewerRoom";
import {
  defaultStartForDevice,
  readStoredStart,
  writeStoredStart,
  type PlayerView,
} from "../viewerNavTypes";
import { toViewerMapModel } from "../viewerMapModel";
import type { PerfMode } from "../viewerSessionPrefs";
import { fetchViewerLogin } from "./useViewerAuth";
import { missingLoginCredsMsg, stripLoginQuery } from "./viewerAuthParse";
import { mapVersionStamp } from "./viewerLivePolls";

type Creds = { factionId: string; password: string };

type Opts = {
  factionId: string;
  password: string;
  loginPerf: PerfMode;
  loginMapStyle: MapStyleId;
  setFactionId: (id: string) => void;
  setPassword: (pw: string) => void;
  setError: (msg: string | null) => void;
  setIsLoggingIn: (busy: boolean) => void;
  credsRef: MutableRefObject<Creds>;
  mapStampRef: MutableRefObject<string | null>;
  applyMapStyle: (style: MapStyleId) => void;
  setPerfModeDirect: (mode: PerfMode) => void;
  commitLayers: (layers: ReturnType<typeof layersForPerfChoice>) => void;
  setGraphicsDirect: (gfx: ReturnType<typeof graphicsForPerf>) => void;
  setPayload: (data: ViewerPayload | null) => void;
  loadWorld: (world: ViewerPayload["world"]) => void;
  applyApFromApi: (data: {
    apMax: number;
    reservedAp: number;
    forceApMax: number;
    reservedForceAp: number;
  }) => void;
  setSyncHint: (hint: string | null) => void;
  clearMapSelection: () => void;
  closeShellOverlays: () => void;
  setViewMode: (mode: PlayerView) => void;
  modelRef: MutableRefObject<MapViewModel | null>;
  bump: () => void;
};

export function useViewerPlayLogin(opts: Opts) {
  const login = async (override?: { factionId?: string; password?: string }) => {
    const fid = override?.factionId ?? opts.factionId;
    const pw = override?.password ?? opts.password;
    if (!fid || !pw) {
      opts.setError(missingLoginCredsMsg());
      return;
    }
    opts.setFactionId(fid);
    opts.setPassword(pw);
    opts.setError(null);
    opts.setIsLoggingIn(true);
    try {
      const data = await fetchViewerLogin(fid, pw);
      opts.credsRef.current = { factionId: fid, password: pw };
      opts.mapStampRef.current = mapVersionStamp({
        turn: data.world.meta.turn,
        tableRevision: data.tableRevision ?? data.world.meta.tableRevision,
      });

      const chosen = clampPerfForDevice(opts.loginPerf);
      const nextLayers = layersForPerfChoice(chosen);
      const nextGfx = graphicsForPerf(chosen);
      try {
        localStorage.setItem("gmap-viewer-perf", chosen);
        writeStoredViewerLayers(nextLayers);
        writeStoredGraphics(nextGfx);
      } catch {
        /* ignore */
      }
      opts.setPerfModeDirect(chosen);
      opts.commitLayers(nextLayers);
      opts.setGraphicsDirect(nextGfx);
      opts.applyMapStyle(opts.loginMapStyle);

      opts.setPayload({
        ...data,
        updatedAt: data.updatedAt ?? data.world.meta.updatedAt,
      });
      opts.loadWorld(data.world);
      opts.applyApFromApi({
        apMax: data.apMax ?? 9,
        reservedAp: data.reservedAp ?? 0,
        forceApMax: data.forceApMax ?? 2,
        reservedForceAp: data.reservedForceAp ?? 0,
      });
      opts.setSyncHint(null);
      opts.clearMapSelection();
      opts.closeShellOverlays();
      closeViewerMapOverlays();
      {
        const start = readStoredStart() ?? defaultStartForDevice();
        opts.setViewMode(start);
        writeStoredStart(start);
      }
      opts.modelRef.current = toViewerMapModel(
        data.world,
        null,
        null,
        nextLayers,
      );
      opts.bump();
      try {
        const next = stripLoginQuery(window.location.href);
        const cur = window.location.pathname + window.location.search;
        if (next !== cur) window.history.replaceState({}, "", next);
      } catch {
        /* ignore */
      }
    } catch (e) {
      opts.setError(e instanceof Error ? e.message : String(e));
    } finally {
      opts.setIsLoggingIn(false);
    }
  };

  return { login };
}
