import type { SystemHistoryEntry } from "../../state/types";

const TYPE_LABEL: Record<SystemHistoryEntry["type"], string> = {
  build: "Строительство",
  demolish: "Снос",
  colonize: "Колонизация",
  capture: "Захват",
};

type Props = {
  history?: SystemHistoryEntry[] | null;
  defaultOpen?: boolean;
};

export function SystemHistory({ history, defaultOpen = false }: Props) {
  const rows = [...(history ?? [])].sort((a, b) => b.turn - a.turn).slice(0, 16);

  return (
    <details className="sys-history" open={defaultOpen}>
      <summary>
        История системы
        <span className="hint">{rows.length ? `${rows.length}` : "пусто"}</span>
      </summary>
      {rows.length === 0 ? (
        <p className="hint">Пока нет записей о строительстве или захвате.</p>
      ) : (
        <ol className="sys-history__list" aria-label="Хроника системы">
          {rows.map((ev, i) => (
            <li key={`${ev.turn}-${ev.type}-${i}`}>
              <span className="tabular">Ход {ev.turn}</span>
              <span className="sys-history__type">
                {TYPE_LABEL[ev.type] ?? ev.type}
              </span>
              <span>{ev.description}</span>
            </li>
          ))}
        </ol>
      )}
    </details>
  );
}
