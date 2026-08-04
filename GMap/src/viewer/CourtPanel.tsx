import { useMemo, useState } from "react";
import type { CourtEvent, ViewerPayload } from "../state/types";
import { ChroniclePanel } from "./ChroniclePanel";
import { NpcCard } from "./NpcCard";
import { RpChat, type RpChatProps } from "../editors/RpChat";

export type CourtPanelProps = {
  payload: ViewerPayload;
  password: string;
  onMsg?: (m: string | null) => void;
  /** Submit intent.give_npc_task */
  onGiveNpcTask?: (
    npcId: string,
    opts: { taskLabel: string; etaTurn: number; linkedQuestId?: string },
  ) => void | Promise<boolean | void>;
  /** After messages load (unread badges). */
  onMessagesLoaded?: RpChatProps["onMessagesLoaded"];
  factionColor?: string;
  avatarUrl?: string | null;
  layout?: "panel" | "fill";
};

type CourtView =
  | { kind: "court" }
  | { kind: "chat"; chapterId: string; episodeId: string; readOnly: boolean };

/** Main RP Court screen: timeline · NPC portraits · chronicle. */
export function CourtPanel({
  payload,
  password,
  onMsg,
  onGiveNpcTask,
  onMessagesLoaded,
  factionColor,
  avatarUrl,
  layout = "fill",
}: CourtPanelProps) {
  const [view, setView] = useState<CourtView>({ kind: "court" });
  const [taskBusy, setTaskBusy] = useState(false);

  const fac = payload.world.factions.find((f) => f.id === payload.factionId);
  const npcs = useMemo(
    () =>
      (fac?.npcs ?? []).filter(
        (n) => n.status !== "hidden" && n.status !== "dead",
      ),
    [fac?.npcs],
  );

  const timeline = useMemo(() => {
    const all = (payload.world.courtEvents ?? []) as CourtEvent[];
    return all
      .filter((e) => !e.factionId || e.factionId === payload.factionId)
      .slice()
      .reverse()
      .slice(0, 40);
  }, [payload.world.courtEvents, payload.factionId]);

  const headers = useMemo(
    (): Record<string, string> => ({
      "X-Faction-Id": payload.factionId,
      "X-Faction-Password": password,
    }),
    [payload.factionId, password],
  );

  const giveTask = async (
    npcId: string,
    opts: { taskLabel: string; etaTurn: number; linkedQuestId?: string },
  ) => {
    if (!onGiveNpcTask) return false;
    setTaskBusy(true);
    try {
      const result = await onGiveNpcTask(npcId, opts);
      return result !== false;
    } finally {
      setTaskBusy(false);
    }
  };

  if (view.kind === "chat") {
    return (
      <div className={`court-panel court-panel--chat court-panel--${layout}`}>
        <RpChat
          mode="player"
          layout={layout}
          factionId={payload.factionId}
          password={password}
          factionColor={factionColor ?? fac?.color}
          avatarUrl={avatarUrl ?? fac?.avatarUrl}
          systems={payload.world.systems.map((s) => ({
            id: s.id,
            name: s.name,
          }))}
          onMsg={onMsg}
          onMessagesLoaded={onMessagesLoaded}
          initialChapterId={view.chapterId}
          initialEpisodeId={view.episodeId}
          onBackToCourt={() => setView({ kind: "court" })}
          forceReadOnly={view.readOnly}
        />
      </div>
    );
  }

  return (
    <div className={`court-panel court-panel--${layout}`} aria-label="Двор">
      <header className="court-panel-head">
        <h2>Двор</h2>
        <p className="hint">
          Хроника и поручения · ход {payload.world.meta.turn}
        </p>
      </header>

      <div className="court-layout">
        <aside className="court-col court-col--npcs" aria-label="Двор державы">
          <h3 className="court-col-title">Лица двора</h3>
          {npcs.length === 0 ? (
            <p className="hint">Нет известных лиц двора.</p>
          ) : (
            <div className="court-npc-stack">
              {npcs.map((n) => (
                <NpcCard
                  key={n.id}
                  npc={n}
                  payload={payload}
                  accent={fac?.color}
                  busy={taskBusy}
                  compact
                  onGiveTask={onGiveNpcTask ? giveTask : undefined}
                />
              ))}
            </div>
          )}
        </aside>

        <section className="court-col court-col--timeline" aria-label="События двора">
          <h3 className="court-col-title">Лента двора</h3>
          {timeline.length === 0 ? (
            <div className="court-timeline-empty">
              <p className="hint">
                Пока тихо. Дайте поручение советнику или дождитесь гонца.
              </p>
            </div>
          ) : (
            <ol className="court-timeline">
              {timeline.map((ev) => (
                <li key={ev.id} className="court-timeline-item">
                  <span className="court-timeline-turn">Ход {ev.turn}</span>
                  <p>{ev.text}</p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <aside className="court-col court-col--chronicle" aria-label="Хроника">
          <ChroniclePanel
            headers={headers}
            mode="player"
            onMsg={onMsg}
            onOpenEpisode={(chapterId, episodeId, readOnly) =>
              setView({ kind: "chat", chapterId, episodeId, readOnly })
            }
          />
        </aside>
      </div>
    </div>
  );
}
