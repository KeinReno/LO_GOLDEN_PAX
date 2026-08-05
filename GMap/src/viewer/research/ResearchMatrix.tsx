import { useMemo, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import type { TechnologyDef, EconomyCategory } from "../../state/contentCatalog";
import type { ViewerPayload } from "../../state/types";
import { ECO_CATEGORY_NAMES } from "../economyFlowTypes";
import { TECH_DND_MIME, COGNITIO_DND_MIME, type ResearchFilter } from "./constants";
import {
  RESEARCH_ERAS,
  buildCatProgress,
  matchesResearchFilter,
  techUiState,
  type ResearchEra,
} from "./techCellState";

const CAT_COLOR: Record<string, string> = {
  A: "var(--eco-cat-a)",
  B: "var(--eco-cat-b)",
  C: "var(--eco-cat-c)",
  D: "var(--eco-cat-d)",
  E: "var(--eco-cat-e)",
  F: "var(--eco-cat-f)",
};

/**
 * Cat × Era workbench — tech chips in era columns for one branch.
 */
export function ResearchMatrix({
  cat,
  techs,
  unlocked,
  cognitio,
  selectedId,
  busy,
  filter = "all",
  search = "",
  focusEra = null,
  onFocusEra,
  queueIds,
  isTechBlocked,
  onSelect,
  onCognitioDrop,
  onTechDragStart,
  onBack,
  eco,
}: {
  cat: EconomyCategory;
  techs: TechnologyDef[];
  unlocked: Set<string>;
  cognitio: number;
  selectedId: string | null;
  busy?: boolean;
  filter?: ResearchFilter;
  search?: string;
  focusEra?: number | null;
  onFocusEra?: (era: number | null) => void;
  queueIds?: Set<string>;
  isTechBlocked?: (tech: TechnologyDef) => boolean;
  onSelect: (techId: string) => void;
  onCognitioDrop?: (techId: string) => void;
  onTechDragStart?: (techId: string) => void;
  onBack?: () => void;
  eco?: ViewerPayload["economy"];
}) {
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const color = CAT_COLOR[cat];
  const progress = useMemo(
    () =>
      buildCatProgress(
        cat,
        techs,
        unlocked,
        cognitio,
        busy,
        isTechBlocked,
        eco,
      ),
    [cat, techs, unlocked, cognitio, busy, isTechBlocked, eco],
  );

  const columns = useMemo(() => {
    return progress.eras.map((cell) => {
      const visible = cell.techs.filter((t) => {
        const st = techUiState(
          t,
          unlocked,
          cognitio,
          busy,
          queueIds,
          isTechBlocked,
          eco,
        );
        return matchesResearchFilter(t, st, filter, search);
      });
      return { ...cell, visible };
    });
  }, [
    progress.eras,
    unlocked,
    cognitio,
    busy,
    queueIds,
    isTechBlocked,
    eco,
    filter,
    search,
  ]);

  const erasToShow: ResearchEra[] =
    focusEra && RESEARCH_ERAS.includes(focusEra as ResearchEra)
      ? [focusEra as ResearchEra]
      : [...RESEARCH_ERAS];

  return (
    <div
      className="research-matrix"
      style={{ "--matrix-accent": color } as CSSProperties}
    >
      <header className="research-matrix-head">
        <div className="research-matrix-title-row">
          {onBack ? (
            <button type="button" className="btn ghost research-matrix-back" onClick={onBack}>
              ← Обзор
            </button>
          ) : null}
          <div>
            <h3 className="research-matrix-title" style={{ color }}>
              {ECO_CATEGORY_NAMES[cat]}
            </h3>
            <p className="hint">
              <span className="tabular">
                {progress.done}/{progress.total}
              </span>
              {progress.affordable > 0 ? (
                <span className="research-matrix-hot">
                  {" "}
                  · можно изучить: {progress.affordable}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="research-matrix-era-tabs" role="tablist" aria-label="Эпохи">
          <button
            type="button"
            role="tab"
            aria-selected={focusEra == null}
            className={focusEra == null ? "on" : undefined}
            onClick={() => onFocusEra?.(null)}
          >
            Все эры
          </button>
          {RESEARCH_ERAS.map((era) => {
            const cell = progress.eras[era - 1];
            return (
              <button
                key={era}
                type="button"
                role="tab"
                aria-selected={focusEra === era}
                className={[
                  focusEra === era ? "on" : "",
                  cell.affordable > 0 ? "is-hot" : "",
                  cell.total > 0 && cell.done === cell.total ? "is-done" : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
                onClick={() => onFocusEra?.(era)}
              >
                E{era}
                <span className="tabular">
                  {cell.done}/{cell.total || "–"}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      <div
        className={`research-matrix-grid ${erasToShow.length === 1 ? "is-single" : ""}`}
        style={{ ["--era-cols" as string]: String(erasToShow.length) }}
      >
        {columns
          .filter((c) => erasToShow.includes(c.era))
          .map((cell) => (
            <section
              key={cell.era}
              className={[
                "research-matrix-col",
                cell.affordable > 0 ? "is-hot" : "",
                cell.total > 0 && cell.done === cell.total ? "is-complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`Эра ${cell.era}`}
            >
              <header className="research-matrix-col-head">
                <strong>Эра {cell.era}</strong>
                <span className="tabular hint">
                  {cell.done}/{cell.total}
                </span>
                <div
                  className="research-matrix-col-bar"
                  role="progressbar"
                  aria-valuenow={cell.done}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(1, cell.total)}
                >
                  <span
                    style={{
                      width: `${cell.total ? (cell.done / cell.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </header>
              <ul className="research-matrix-list">
                {cell.visible.length === 0 ? (
                  <li className="hint">
                    {cell.total === 0 ? "Нет техов" : "Нет под фильтр"}
                  </li>
                ) : (
                  cell.visible.map((t) => {
                    const st = techUiState(
                      t,
                      unlocked,
                      cognitio,
                      busy,
                      queueIds,
                      isTechBlocked,
                      eco,
                    );
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={[
                            "research-matrix-chip",
                            selectedId === t.id ? "is-selected" : "",
                            st.done ? "is-done" : "",
                            st.locked ? "is-locked" : "",
                            st.canBuy ? "is-affordable" : "",
                            st.canQueue && !st.canBuy ? "is-queueable" : "",
                            st.inQueue ? "is-queued" : "",
                            t.isBreakthrough ? "is-breakthrough" : "",
                            dragOverId === t.id ? "is-drop" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          draggable={st.done || !!onTechDragStart}
                          onDragStart={(e) => {
                            e.dataTransfer.setData(TECH_DND_MIME, t.id);
                            e.dataTransfer.setData("text/plain", t.id);
                            e.dataTransfer.effectAllowed = "copy";
                            onTechDragStart?.(t.id);
                          }}
                          onDragOver={(e) => {
                            if (!onCognitioDrop) return;
                            if (
                              ![...e.dataTransfer.types].includes(
                                COGNITIO_DND_MIME,
                              )
                            )
                              return;
                            e.preventDefault();
                            setDragOverId(t.id);
                          }}
                          onDragLeave={() =>
                            setDragOverId((id) => (id === t.id ? null : id))
                          }
                          onDrop={(e: DragEvent) => {
                            setDragOverId(null);
                            if (
                              ![...e.dataTransfer.types].includes(
                                COGNITIO_DND_MIME,
                              )
                            )
                              return;
                            e.preventDefault();
                            onCognitioDrop?.(t.id);
                          }}
                          onClick={() => onSelect(t.id)}
                          title={t.name}
                        >
                          <span className="research-matrix-chip-name">
                            {st.locked && !st.done ? (
                              <span className="research-matrix-chip-lock" aria-hidden>
                                🔒
                              </span>
                            ) : null}
                            {t.name}
                          </span>
                          <span className="research-matrix-chip-meta tabular">
                            {st.done ? "✓" : st.locked ? "—" : st.cost}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
