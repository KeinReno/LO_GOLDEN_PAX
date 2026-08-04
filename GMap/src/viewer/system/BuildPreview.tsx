import {
  ECO_CATEGORY_COLORS,
  ECO_CATEGORY_NAMES,
} from "../economyFlowTypes";
import { ResourceCostRow } from "../../ui/ResourceCostRow";
import type { BuildPreviewResult } from "./types";

const CATS = ["A", "B", "C", "D", "E", "F"];

type Props = {
  preview: BuildPreviewResult | null;
  loading?: boolean;
  stocks?: Record<string, number>;
  onConfirm?: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
};

export function BuildPreview({
  preview,
  loading,
  stocks,
  onConfirm,
  onCancel,
  confirmLabel = "Построить",
}: Props) {
  if (loading) {
    return (
      <div className="sys-build-preview" aria-busy="true">
        <p className="hint">Считаем эффекты…</p>
      </div>
    );
  }
  if (!preview?.ok || !preview.building) return null;

  const { building, delta, buildTurns } = preview;
  const changed = CATS.filter((c) => Math.abs(delta?.[c]?.delta ?? 0) > 0.001);

  return (
    <div className="sys-build-preview" aria-label="Превью строительства">
      <header className="sys-build-preview__head">
        <strong>Превью: {building.name}</strong>
        {building.category ? (
          <span
            className="sys-build-preview__cat"
            style={{
              color:
                ECO_CATEGORY_COLORS[building.category] ?? "var(--text-muted)",
            }}
          >
            {building.category}{" "}
            {ECO_CATEGORY_NAMES[building.category] ?? ""}
            {building.tier != null ? ` · T${building.tier}` : ""}
          </span>
        ) : null}
      </header>

      <div className="sys-build-preview__cost">
        <ResourceCostRow cost={building.cost ?? {}} stocks={stocks} size={12} />
        <span className="hint tabular">
          {building.ap} AP · {buildTurns ?? 1} ход
        </span>
      </div>

      {changed.length === 0 ? (
        <p className="hint">Потоки A–F не изменятся (или эффект через слоты).</p>
      ) : (
        <ul className="sys-build-preview__deltas">
          {changed.map((cat) => {
            const d = delta![cat];
            const sign = d.delta > 0 ? "+" : "";
            return (
              <li key={cat}>
                <span
                  style={{ color: ECO_CATEGORY_COLORS[cat] }}
                  className="tabular"
                >
                  {cat}
                </span>
                <span className="hint">
                  {ECO_CATEGORY_NAMES[cat]}:{" "}
                  <span className="tabular">{d.before.toFixed(0)}</span>
                  {" → "}
                  <span className="tabular">{d.after.toFixed(0)}</span>
                  <strong className="tabular">
                    {" "}
                    ({sign}
                    {d.delta.toFixed(0)}/ход)
                  </strong>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {(onConfirm || onCancel) && (
        <div className="sys-build-preview__actions">
          {onCancel ? (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Отмена
            </button>
          ) : null}
          {onConfirm ? (
            <button type="button" className="btn primary" onClick={onConfirm}>
              {confirmLabel}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
