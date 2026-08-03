import { useWorldStore } from "../state/worldStore";

/** Quest dossier opened from map quest marker. */
export function QuestPanel() {
  const world = useWorldStore((s) => s.world);
  const openQuestId = useWorldStore((s) => s.openQuestId);
  const setOpenQuestId = useWorldStore((s) => s.setOpenQuestId);
  const upsertQuest = useWorldStore((s) => s.upsertQuest);
  const removeQuest = useWorldStore((s) => s.removeQuest);
  const focusCameraOnSystem = useWorldStore((s) => s.focusCameraOnSystem);

  const quest = world.quests.find((q) => q.id === openQuestId) ?? null;
  if (!quest) return null;

  const system = quest.systemId
    ? world.systems.find((s) => s.id === quest.systemId)
    : null;

  return (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={() => setOpenQuestId(null)}
    >
      <div
        className="dossier-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">Квест</p>
            <h2>{quest.name}</h2>
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => setOpenQuestId(null)}
          >
            Закрыть
          </button>
        </header>
        <div className="dossier-body">
          <p className="quest-summary">{quest.summary}</p>
          {quest.detail && (
            <div className="quest-detail">
              {quest.detail.split("\n").map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
          <p className="hint">
            Статус:{" "}
            {quest.status === "active"
              ? "активен"
              : quest.status === "done"
                ? "завершён"
                : quest.status === "expired"
                  ? "истёк"
                  : "скрыт"}
            {system ? ` · ${system.name}` : ""}
          </p>
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
              {quest.status === "done" ? "Вернуть в активные" : "Отметить выполненным"}
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (confirm(`Удалить квест «${quest.name}»?`)) {
                  removeQuest(quest.id);
                }
              }}
            >
              Удалить квест
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
