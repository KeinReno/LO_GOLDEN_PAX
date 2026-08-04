import { useMemo, useState } from "react";
import type { ViewerPayload } from "../../state/types";
import { TaxDragStrip } from "./components/TaxDragStrip";
import {
  DOCTRINE_PRESETS,
  loadTaxSlots,
  previewDoctrine,
  type DoctrinePreset,
} from "./policyData";
import { EmptyState } from "./components/EmptyState";
import { EcoTip } from "./components/EcoTip";

type Props = {
  payload: ViewerPayload;
  onSetTax?: (taxSlot: string, tierId: string) => void;
  onSetDoctrine?: (policyId: string) => void;
  busy?: boolean;
};

export function PoliciesSection({
  payload,
  onSetTax,
  onSetDoctrine,
  busy,
}: Props) {
  const eco = payload.economy;
  const slots = useMemo(() => loadTaxSlots(), []);
  const [confirmDoctrine, setConfirmDoctrine] = useState<DoctrinePreset | null>(
    null,
  );

  if (!eco) {
    return (
      <EmptyState
        title="Политики недоступны"
        body="Данные налогов появятся после входа и первого тика."
      />
    );
  }

  const activePolicy = eco.economicPolicy ?? null;
  const laws = eco.laws ?? [];
  const doctrinePreview = confirmDoctrine
    ? previewDoctrine(confirmDoctrine, slots, eco.stocks ?? {})
    : null;

  return (
    <div className="eco-policies">
      <section className="eco-policies__taxes" aria-label="Налоги">
        <header className="eco-chart-block__head">
          <h4>Налоги</h4>
          <span className="hint">давление {eco.pressure ?? 0}</span>
        </header>
        <div className="eco-tax-strips">
          {slots.map((slot) => (
            <TaxDragStrip
              key={slot.id}
              slot={slot}
              value={eco.taxes?.[slot.id] ?? "none"}
              pending={eco.pendingPolicy?.taxes?.[slot.id]}
              stock={eco.stocks?.[slot.resource ?? ""] ?? 0}
              busy={busy}
              onCommit={(tierId) => onSetTax?.(slot.id, tierId)}
            />
          ))}
        </div>
      </section>

      <section className="eco-policies__doctrines" aria-label="Доктрины">
        <header className="eco-chart-block__head">
          <h4>Доктрины</h4>
        </header>
        <ul className="eco-doctrine-grid">
          {DOCTRINE_PRESETS.map((d) => (
            <li key={d.id}>
              <EcoTip content={d.blurb}>
                <button
                  type="button"
                  className={`eco-doctrine-card ${
                    activePolicy === d.id ? "is-active" : ""
                  }`}
                  disabled={busy}
                  onClick={() => setConfirmDoctrine(d)}
                >
                  <strong>{d.label}</strong>
                  <span className="hint">{d.blurb}</span>
                </button>
              </EcoTip>
            </li>
          ))}
        </ul>
      </section>

      <section className="eco-policies__laws" aria-label="Законы">
        <header className="eco-chart-block__head">
          <h4>Законы</h4>
        </header>
        {laws.length === 0 ? (
          <p className="hint">Активных законов нет. Enact — в следующих фазах.</p>
        ) : (
          <ul className="eco-laws-list">
            {laws.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </section>

      {confirmDoctrine && doctrinePreview && (
        <div className="eco-doctrine-modal" role="dialog" aria-modal="true">
          <div className="eco-doctrine-modal__card">
            <h3>{confirmDoctrine.label}</h3>
            <p className="hint">{confirmDoctrine.blurb}</p>
            <ul className="eco-doctrine-modal__lines">
              {doctrinePreview.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="hint">
              Давление (оценка):{" "}
              <strong>
                {(eco.pressure ?? 0) + doctrinePreview.pressureDelta}
              </strong>{" "}
              (сейчас {eco.pressure ?? 0}
              {doctrinePreview.pressureDelta !== 0
                ? `, Δ ${doctrinePreview.pressureDelta > 0 ? "+" : ""}${doctrinePreview.pressureDelta}`
                : ""}
              )
            </p>
            <div className="eco-doctrine-modal__actions">
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmDoctrine(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  onSetDoctrine?.(confirmDoctrine.id);
                  setConfirmDoctrine(null);
                }}
              >
                Применить (1 AP)
              </button>
            </div>
          </div>
          <button
            type="button"
            className="eco-doctrine-modal__backdrop"
            aria-label="Закрыть"
            onClick={() => setConfirmDoctrine(null)}
          />
        </div>
      )}
    </div>
  );
}
