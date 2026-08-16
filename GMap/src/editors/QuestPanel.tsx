import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import { ConfirmModal } from "../viewer/shared/ConfirmModal";
import { mapStatus } from "../viewer/quests/adaptQuest";
import { QuestDossierView } from "../viewer/quests/QuestDossierView";

/** Quest dossier opened from map quest marker. */
export function QuestPanel() {
  const world = useWorldStore((s) => s.world);
  const openQuestId = useWorldStore((s) => s.openQuestId);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const upsertQuest = useWorldStore((s) => s.upsertQuest);
  const removeQuest = useWorldStore((s) => s.removeQuest);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const quest = (world.quests ?? []).find((q) => q.id === openQuestId) ?? null;
  if (!quest) return null;

  const system = quest.systemId
    ? world.systems.find((s) => s.id === quest.systemId)
    : null;

  return (
    <>
      <QuestDossierView
        kicker="Квест"
        title={quest.name}
        status={mapStatus(quest.status)}
        systemName={system?.name}
        expiresTurn={quest.expiresTurn}
        onClose={() => setOpenQuestId(null)}
      >
        <p className="quest-summary">{quest.summary}</p>
        {quest.detail && (
          <div className="quest-detail">
            {quest.detail.split("\n").map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}
        <div className="btn-col">
          {system && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setOpenQuestId(null);
                focusCameraOnSystem(system.id);
              }}
            >
              На карте к системе
            </button>
          )}
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              upsertQuest({
                ...quest,
                status: quest.status === "done" ? "active" : "done",
              })
            }
          >
            {quest.status === "done"
              ? "Вернуть в активные"
              : "Отметить выполненным"}
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => setConfirmDelete(true)}
          >
            Удалить квест
          </button>
        </div>
      </QuestDossierView>
      <ConfirmModal
        open={confirmDelete}
        title={`Удалить квест «${quest.name}»?`}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          removeQuest(quest.id);
          setConfirmDelete(false);
          setOpenQuestId(null);
        }}
        confirmLabel="Удалить"
        confirmClassName="btn danger"
      >
        <p className="hint">Квест будет удалён с доски. Это нельзя отменить.</p>
      </ConfirmModal>
    </>
  );
}
