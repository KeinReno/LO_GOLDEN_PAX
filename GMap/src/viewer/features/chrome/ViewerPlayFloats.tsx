import { useEffect, useState } from "react";
import { getCachedContent } from "../../../state/contentCatalog";
import type { ViewerPayload } from "../../../state/types";
import { useWorldStore } from "../../../state/worldStore";
import { navigateViewerRoom } from "../rooms-router/navigateViewerRoom";
import { visiblePlayerQuests } from "../../ViewerQuestPanel";
import { useQuestsState } from "../../quests/useQuestsState";
import {
  decideEraAdvance,
  eraSeenStorageKey,
  maxTechEra,
} from "./eraAdvance";

type Props = {
  payload: ViewerPayload;
};

export function ViewerPlayFloats({ payload }: Props) {
  const openQuestId = useWorldStore((s) => s.openQuestId);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const [eraBanner, setEraBanner] = useState<number | null>(null);

  const playerQuests = visiblePlayerQuests(payload.world, payload.factionId);

  useEffect(() => {
    if (openQuestId == null) return;
    if (!playerQuests.some((q) => q.id === openQuestId)) {
      setOpenQuestId(null);
      return;
    }
    useQuestsState.getState().selectQuest(openQuestId);
    navigateViewerRoom("quests");
    setOpenQuestId(null);
  }, [openQuestId, playerQuests, setOpenQuestId]);

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

  if (eraBanner == null) return null;

  return (
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
  );
}
