import { useEffect, useState, type ReactNode } from "react";
import { getCachedContent } from "../../../state/contentCatalog";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import { useWorldStore } from "../../../state/worldStore";
import { FloatingRpWindow } from "../../../editors/FloatingRpWindow";
import {
  closeViewerMapOverlays,
  navigateViewerRoom,
} from "../rooms-router/navigateViewerRoom";
import {
  ViewerQuestDossier,
  visiblePlayerQuests,
} from "../../ViewerQuestPanel";
import {
  decideEraAdvance,
  eraSeenStorageKey,
  maxTechEra,
} from "./eraAdvance";
import {
  questChoiceAppliedNote,
  questDiceNote,
} from "./questActionCopy";
import type { QuestActionResult } from "../../hooks/useViewerQuestActions";

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  chronicleRoom: ReactNode;
  onFocusSystem: (systemId: string) => void;
  submitQuestAction: (
    action: string,
    extra?: Record<string, unknown>,
  ) => Promise<QuestActionResult>;
};

export function ViewerPlayFloats({
  payload,
  mobile,
  chronicleRoom,
  onFocusSystem,
  submitQuestAction,
}: Props) {
  const viewMode = useViewerSessionStore((s) => s.viewMode);
  const setViewMode = useViewerSessionStore((s) => s.setViewMode);
  const rpFloatOpen = useViewerChromeStore((s) => s.rpFloatOpen);
  const rpUnread = useViewerChromeStore((s) => s.rpUnread);
  const setRpFloatOpen = useViewerChromeStore((s) => s.setRpFloatOpen);
  const setRpUnread = useViewerChromeStore((s) => s.setRpUnread);
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);
  const openQuestId = useWorldStore((s) => s.openQuestId);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const [eraBanner, setEraBanner] = useState<number | null>(null);

  const playerQuests = visiblePlayerQuests(payload.world);
  const openQuest =
    openQuestId != null
      ? playerQuests.find((q) => q.id === openQuestId) ?? null
      : null;

  useEffect(() => {
    if (openQuestId == null) return;
    if (!playerQuests.some((q) => q.id === openQuestId)) {
      setOpenQuestId(null);
    }
  }, [playerQuests, openQuestId, setOpenQuestId]);

  useEffect(() => {
    if (!payload.factionId) return;
    const techs = getCachedContent()?.technologies || {};
    const maxEra = maxTechEra(techs, payload.economy?.unlockedTechs);
    const key = eraSeenStorageKey(payload.factionId);
    let prev = 1;
    try {
      prev = Number(sessionStorage.getItem(key) || "0") || 0;
    } catch {
      prev = 0;
    }
    const decision = decideEraAdvance(prev, maxEra);
    if (decision.kind === "skip") return;
    try {
      sessionStorage.setItem(key, String(decision.era));
    } catch {
      /* ignore */
    }
    if (decision.kind === "seed") return;
    setEraBanner(decision.era);
    const t = window.setTimeout(() => setEraBanner(null), 4200);
    return () => window.clearTimeout(t);
  }, [payload.factionId, payload.economy?.unlockedTechs]);

  return (
    <>
      {!mobile && (
        <FloatingRpWindow
          open={viewMode === "rp" || rpFloatOpen}
          onOpenChange={(o) => {
            if (o) {
              navigateViewerRoom("rp");
              setRpUnread(0);
              return;
            }
            setRpFloatOpen(false);
            if (viewMode === "rp") {
              setViewMode("map");
              closeViewerMapOverlays();
            }
          }}
          unread={rpUnread}
          storageKey={`gmap-rp-float-geom-player-${payload.factionId}`}
          title="RP"
        >
          {chronicleRoom}
        </FloatingRpWindow>
      )}

      {openQuest && (
        <ViewerQuestDossier
          quest={openQuest}
          world={payload.world}
          stocks={payload.economy?.stocks}
          onClose={() => setOpenQuestId(null)}
          onFocusSystem={(systemId) => {
            setOpenQuestId(null);
            onFocusSystem(systemId);
          }}
          onOpenCourt={() => {
            setOpenQuestId(null);
            navigateViewerRoom("court");
          }}
          onResolveChoice={async (questId, choiceId) => {
            const res = await submitQuestAction("resolve_quest_choice", {
              questId,
              choiceId,
            });
            if (res.ok) setOrderMsg(questChoiceAppliedNote());
            return res.ok;
          }}
          onResolveDice={async (questId, specIndex, choiceId) => {
            const res = await submitQuestAction("resolve_quest_dice", {
              questId,
              specIndex,
              choiceId,
            });
            if (!res.ok) return { ok: false };
            setOrderMsg(questDiceNote(res.message));
            return {
              ok: true,
              rolls: res.rolls,
              success: res.success,
              message: res.message,
            };
          }}
        />
      )}

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
    </>
  );
}
