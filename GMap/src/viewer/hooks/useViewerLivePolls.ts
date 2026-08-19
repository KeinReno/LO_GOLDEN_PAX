import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { ViewerPayload } from "../../state/types";
import { playStaffCue } from "../../audio/staffSfx";
import { hasPlayerToken } from "../../state/playerAuth";
import {
  fetchEngagements,
  getPlayerJson,
  postPlayerJson,
} from "../../state/playerActionClient";
import { useWorldStore } from "../../state/worldStore";
import { useViewerBattleSessionStore } from "../../state/viewerBattleSessionStore";
import { useViewerChromeStore } from "../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../state/viewerSessionStore";
import type { ActionApPayload } from "../features/order-orchestrator/orderApMerge";
import {
  fieldsFromAction,
  patchViewerPayload,
} from "../features/order-orchestrator/viewerSessionPatch";
import type { ViewerEngagement } from "../PlayerEngagementPanel";
import type { EconomyFlowBreakdown } from "../economyFlowTypes";
import { readRpSeenAt } from "../viewerNavTypes";
import {
  boardRefreshCue,
  countRpUnread,
  engagementPollMs,
  mapVersionStamp,
  pickRpHomeEpisode,
  rpSceneIsOpen,
} from "./viewerLivePolls";

type Creds = { factionId: string; password: string };

type Opts = {
  payload: ViewerPayload | null;
  password: string;
  credsRef: MutableRefObject<Creds>;
  mapStampRef: MutableRefObject<string | null>;
  setPayload: Dispatch<SetStateAction<ViewerPayload | null>>;
  commitApFromAction: (data: ActionApPayload) => void;
  bump: () => void;
};

export function useViewerLivePolls({
  payload,
  password,
  credsRef,
  mapStampRef,
  setPayload,
  commitApFromAction,
  bump,
}: Opts) {
  const [syncHint, setSyncHint] = useState<string | null>(null);
  const [boardRefreshToast, setBoardRefreshToast] = useState<string | null>(
    null,
  );
  const [isStale, setIsStale] = useState(false);
  const consecutiveFailuresRef = useRef(0);
  const engagementsPrimedRef = useRef(false);

  const loadWorld = useWorldStore((s) => s.loadWorld);
  const rpFloatOpen = useViewerChromeStore((s) => s.rpFloatOpen);
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);
  const cardBattleId = useViewerBattleSessionStore((s) => s.cardBattleId);
  const cardBattleMinimized = useViewerBattleSessionStore(
    (s) => s.cardBattleMinimized,
  );

  useEffect(() => {
    if (!boardRefreshToast) return;
    const t = window.setTimeout(() => setBoardRefreshToast(null), 12000);
    return () => window.clearTimeout(t);
  }, [boardRefreshToast]);

  useEffect(() => {
    if (!payload) {
      consecutiveFailuresRef.current = 0;
      setIsStale(false);
      return;
    }
    let cancelled = false;
    const markFailure = () => {
      if (cancelled) return;
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) setIsStale(true);
    };
    const markOk = () => {
      consecutiveFailuresRef.current = 0;
      setIsStale(false);
    };
    const tick = async () => {
      try {
        const verRes = await getPlayerJson("/api/map-version");
        if (cancelled) return;
        if (!verRes.ok) {
          markFailure();
          return;
        }
        markOk();
        const ver = verRes.data as {
          updatedAt?: string | null;
          turn?: number;
          tableRevision?: number;
        };
        const stamp = mapVersionStamp(ver);
        if (!mapStampRef.current) {
          mapStampRef.current = stamp;
          return;
        }
        if (stamp === mapStampRef.current) return;
        const { factionId: fid, password: pw } = credsRef.current;
        if (!fid || !(pw || hasPlayerToken())) return;
        const r2 = await postPlayerJson(
          "/api/view-refresh",
          pw ? { factionId: fid, password: pw } : { factionId: fid },
        );
        if (!r2.ok || cancelled || !r2.data.world) return;
        const data = r2.data;
        const world = data.world as ViewerPayload["world"];
        const turn = world.meta.turn ?? ver.turn ?? "?";
        const rev =
          data.tableRevision ??
          world.meta.tableRevision ??
          ver.tableRevision ??
          "?";
        mapStampRef.current = stamp;
        setPayload((prev) => {
          if (!prev) {
            return {
              world,
              factionId: data.factionId ?? fid,
              visibleSystemIds: data.visibleSystemIds ?? [],
              knownFactionIds: data.knownFactionIds,
              tradePartnerIds: data.tradePartnerIds,
              diploOffers: data.diploOffers as ViewerPayload["diploOffers"],
              updatedAt: data.updatedAt ?? ver.updatedAt,
              tableRevision: data.tableRevision ?? ver.tableRevision,
              economy: data.economy as ViewerPayload["economy"],
              briefing: data.briefing as ViewerPayload["briefing"],
              apMax: data.apMax,
              reservedAp: data.reservedAp,
              forceApMax: data.forceApMax,
              reservedForceAp: data.reservedForceAp,
              intel: data.intel as ViewerPayload["intel"],
            };
          }
          return patchViewerPayload(prev, {
            ...fieldsFromAction(data),
            updatedAt: data.updatedAt ?? ver.updatedAt ?? prev.updatedAt,
            tableRevision: data.tableRevision ?? ver.tableRevision,
          });
        });
        commitApFromAction(data);
        loadWorld(world);
        const boardCue = boardRefreshCue(turn, rev);
        setBoardRefreshToast(boardCue);
        setSyncHint(boardCue);
        bump();
      } catch {
        markFailure();
      }
    };
    const id = window.setInterval(() => void tick(), 4000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [payload?.factionId, password, loadWorld, bump]);

  useEffect(() => {
    if (!payload?.factionId) {
      setRpUnread(0);
      return;
    }
    if (rpSceneIsOpen(viewMode, rpFloatOpen)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const headers: Record<string, string> = {
          "X-Faction-Id": payload.factionId,
        };
        if (password) headers["X-Faction-Password"] = password;
        const idxRes = await getPlayerJson("/api/rp", headers);
        if (!idxRes.ok || cancelled) return;
        const idx = idxRes.data as Parameters<typeof pickRpHomeEpisode>[0];
        const home = pickRpHomeEpisode(idx);
        if (!home || cancelled) return;
        const q = new URLSearchParams({
          chapterId: home.chapterId,
          episodeId: home.episodeId,
        });
        const msgRes = await getPlayerJson(`/api/rp/messages?${q}`, headers);
        if (!msgRes.ok || cancelled) return;
        const data = msgRes.data as {
          messages?: { id: string; at: string; authorFactionId?: string }[];
        };
        const msgs = data.messages || [];
        const unread = countRpUnread(msgs, readRpSeenAt(payload.factionId));
        if (!cancelled) {
          setRpUnread(unread);
          if (unread > 0) {
            const { notifyNewRpMessage } = await import("../../ui/rpNotify");
            notifyNewRpMessage(msgs, {
              selfFactionId: payload.factionId,
              quietDesktop: rpSceneIsOpen(viewMode, rpFloatOpen),
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
  }, [
    payload?.factionId,
    payload?.world.meta.turn,
    payload?.updatedAt,
    password,
    rpFloatOpen,
    viewMode,
    setRpUnread,
  ]);

  useEffect(() => {
    if (!payload?.factionId || !(password || hasPlayerToken())) {
      useViewerOrderSessionStore.getState().setFlowData(null);
      return;
    }
    let cancelled = false;
    const loadFlows = async () => {
      try {
        const { ok, data } = await getPlayerJson(
          `/api/economy/flows?factionId=${encodeURIComponent(payload.factionId)}`,
          {
            "X-Faction-Id": payload.factionId,
            ...(password ? { "X-Faction-Password": password } : {}),
          },
        );
        if (!ok || cancelled) return;
        useViewerOrderSessionStore
          .getState()
          .setFlowData(data as EconomyFlowBreakdown);
      } catch {
        /* ignore transient errors */
      }
    };
    void loadFlows();
    return () => {
      cancelled = true;
    };
  }, [
    payload?.factionId,
    payload?.world.meta.turn,
    payload?.updatedAt,
    password,
  ]);

  const refreshEngagements = useCallback(
    async (factionId: string) => {
      try {
        const { ok, data } = await fetchEngagements(factionId, password);
        if (!ok) return;
        useViewerBattleSessionStore.getState().setEngagements((prev) => {
          const next = (data.engagements as ViewerEngagement[]) || [];
          if (!engagementsPrimedRef.current) {
            engagementsPrimedRef.current = true;
            return next;
          }
          const prevActive = new Set(
            prev
              .filter((e) => e.status !== "resolved")
              .map((e) => e.id),
          );
          if (
            next.some(
              (e) => e.status !== "resolved" && !prevActive.has(e.id),
            )
          ) {
            playStaffCue("contact_alert");
          }
          return next;
        });
      } catch {
        /* ignore */
      }
    },
    [password],
  );

  useEffect(() => {
    if (!payload?.factionId) {
      engagementsPrimedRef.current = false;
      useViewerBattleSessionStore.getState().setEngagements([]);
      return;
    }
    let cancelled = false;
    void refreshEngagements(payload.factionId);
    const intervalMs = engagementPollMs(
      Boolean(cardBattleId && !cardBattleMinimized),
    );
    const id = window.setInterval(() => {
      if (!cancelled) void refreshEngagements(payload.factionId);
    }, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    payload?.factionId,
    payload?.world.meta.turn,
    payload?.updatedAt,
    cardBattleId,
    cardBattleMinimized,
    refreshEngagements,
  ]);

  return {
    syncHint,
    setSyncHint,
    boardRefreshToast,
    setBoardRefreshToast,
    refreshEngagements,
    isStale,
  };
}
