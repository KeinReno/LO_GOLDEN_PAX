import { useMemo, useState } from "react";
import type { ViewerPayload } from "../../state/types";
import { TaxDragStrip } from "./components/TaxDragStrip";
import {
  DOCTRINE_PRESETS,
  loadTaxSlots,
  previewDoctrine,
  type DoctrinePreset,
} from "./policyData";
import { fmtInt } from "../../state/numberFormat";
import { EmptyState } from "./components/EmptyState";
import { EcoTip } from "./components/EcoTip";
import { ConfirmModal } from "../shared/ConfirmModal";
type Props = {
  payload: ViewerPayload;
  onSetTax?: (taxSlot: string, tierId: string) => void;
  onSetDoctrine?: (policyId: string) => void;
  busy?: boolean;
  statusMsg?: string | null;
};

export function PoliciesSection({
  payload,
  onSetTax,
  onSetDoctrine,
  busy,
  statusMsg,
}: Props) {
  const eco = payload.economy;
  const slots = useMemo(() => loadTaxSlots(), []);
  const [confirmDoctrine, setConfirmDoctrine] = useState<DoctrinePreset | null>(
    null,
  );

  if (!eco) {    return (
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
      {statusMsg ? (
        <p className="eco-policies__status" role="status">
          {statusMsg}
        </p>
      ) : null}
      <section className="eco-policies__taxes" aria-label="Налоги">
        <header className="eco-chart-block__head">
          <h4>Налоги</h4>
          <span className="hint">
            давление {fmtInt(eco.pressure ?? 0)} · кнопка ставки → очередь на
            следующий ход
          </span>
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
          <p className="hint">
            Активных законов нет. Принятие законов — в следующих фазах.
          </p>
        ) : (
          <ul className="eco-laws-list">
            {laws.map((id) => (
              <li key={id}>
                {String(id)
                  .replace(/^law\./, "")
                  .replace(/_/g, " ")}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={!!confirmDoctrine && !!doctrinePreview}
        title={confirmDoctrine?.label ?? ""}
        onClose={() => setConfirmDoctrine(null)}
        onConfirm={() => {
          if (!confirmDoctrine) return;
          onSetDoctrine?.(confirmDoctrine.id);
          setConfirmDoctrine(null);
        }}
        confirmLabel="Применить (1 ОД)"
        busy={busy}
      >
        {confirmDoctrine && doctrinePreview ? (
          <>
            <p className="hint">{confirmDoctrine.blurb}</p>
            <ul className="eco-doctrine-modal__lines">
              {doctrinePreview.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="hint">
              Давление (оценка):{" "}
              <strong>
                {fmtInt((eco.pressure ?? 0) + doctrinePreview.pressureDelta)}
              </strong>{" "}
              (сейчас {fmtInt(eco.pressure ?? 0)}
              {doctrinePreview.pressureDelta !== 0
                ? `, изменение ${
                    doctrinePreview.pressureDelta > 0 ? "+" : ""
                  }${fmtInt(doctrinePreview.pressureDelta)}`
                : ""}
              )
            </p>
          </>
        ) : null}
      </ConfirmModal>    </div>
  );
}
