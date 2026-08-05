import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ViewerEngagement } from "./PlayerEngagementPanel";
import {
  formatContactLosses,
  type ContactBattlePreview,
} from "../state/contactBattlePreview";

type Phase = "choose" | "animating" | "results";

type Props = {
  preview: ContactBattlePreview;
  busy: boolean;
  onCancel: () => void;
  onChooseAuto: () => void;
  onChooseCard: () => void;
  resultEngagement?: ViewerEngagement | null;
  error?: string | null;
};

function SideColumn({
  title,
  units,
  tone,
}: {
  title: string;
  units: ContactBattlePreview["attackerUnits"];
  tone: "attacker" | "defender";
}) {
  return (
    <div className={`contact-battle-side contact-battle-side--${tone}`}>
      <h3 className="contact-battle-side__title">{title}</h3>
      <ul className="contact-battle-roster">
        {units.map((u) => (
          <li key={u.id} className="contact-battle-roster__item">
            <span className="contact-battle-roster__name">{u.name}</span>
            <span className="contact-battle-roster__meta">
              {u.kind === "fleet" ? "флот" : "легион"}
              {u.power != null ? ` · сила ${u.power}` : ""}
              {u.stance ? ` · ${u.stance}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ContactBattleChooser({
  preview,
  busy,
  onCancel,
  onChooseAuto,
  onChooseCard,
  resultEngagement,
  error,
}: Props) {
  const [phase, setPhase] = useState<Phase>("choose");

  useEffect(() => {
    if (busy && phase === "choose") setPhase("animating");
  }, [busy, phase]);

  useEffect(() => {
    if (resultEngagement?.status === "resolved" && phase === "animating") {
      const t = window.setTimeout(() => setPhase("results"), 1200);
      return () => window.clearTimeout(t);
    }
  }, [resultEngagement, phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy && phase === "choose") {
        e.preventDefault();
        onCancel();
      }
      if (phase === "choose" && !busy) {
        if (e.key === "1") {
          e.preventDefault();
          onChooseAuto();
        }
        if (e.key === "2") {
          e.preventDefault();
          onChooseCard();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, onChooseAuto, onChooseCard, phase]);

  const theaterLabel =
    preview.theater === "ground" ? "Наземный бой" : "Космический бой";

  const outcomeLine = useMemo(() => {
    if (!resultEngagement?.result) return null;
    const r = resultEngagement.result;
    const mine = preview.attackerFactionId;
    const won =
      r.outcome === "win_a"
        ? resultEngagement.sides[0]?.factionId === mine
        : r.outcome === "win_b"
          ? resultEngagement.sides[1]?.factionId === mine
          : null;
    if (won === true) return "Победа";
    if (won === false) return "Поражение";
    return "Ничья";
  }, [resultEngagement, preview.attackerFactionId]);

  const myLosses = useMemo(() => {
    if (!resultEngagement?.result || !resultEngagement.sides.length) return "—";
    const idx = resultEngagement.sides.findIndex(
      (s) => s.factionId === preview.attackerFactionId,
    );
    if (idx === 0) return formatContactLosses(resultEngagement.result.lossesA);
    if (idx === 1) return formatContactLosses(resultEngagement.result.lossesB);
    return "—";
  }, [resultEngagement, preview.attackerFactionId]);

  return (
    <div
      className="contact-battle-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy && phase === "choose") {
          onCancel();
        }
      }}
    >
      <motion.div
        className="contact-battle-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-battle-title"
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.2 }}
      >
        <header className="contact-battle-modal__head">
          <div>
            <h2 id="contact-battle-title">Контактный бой</h2>
            <p className="hint">
              {preview.systemName} · {theaterLabel}
            </p>
          </div>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={onCancel}
          >
            Закрыть Esc
          </button>
        </header>

        <div className="contact-battle-faceoff">
          <SideColumn
            title={preview.attackerLabel}
            units={preview.attackerUnits}
            tone="attacker"
          />
          <div className="contact-battle-vs" aria-hidden>
            <AnimatePresence mode="wait">
              {phase === "animating" ? (
                <motion.div
                  key="clash"
                  className="contact-battle-clash"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: [1, 1.15, 1], opacity: 1 }}
                  transition={{ duration: 1.1, repeat: Infinity }}
                >
                  ⚔
                </motion.div>
              ) : (
                <motion.span key="vs" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  VS
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <SideColumn
            title={preview.defenderLabel}
            units={preview.defenderUnits}
            tone="defender"
          />
        </div>

        {error && <p className="error contact-battle-error">{error}</p>}

        {phase === "results" && resultEngagement && (
          <div className="contact-battle-results" role="status">
            <p className="contact-battle-results__headline">
              {outcomeLine ?? "Бой завершён"}
            </p>
            <p className="hint">Ваши потери: {myLosses}</p>
            <button type="button" className="btn primary" onClick={onCancel}>
              Закрыть
            </button>
          </div>
        )}

        {phase === "choose" && (
          <footer className="contact-battle-actions">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={onChooseAuto}
            >
              Автобой <kbd>1</kbd>
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={onChooseCard}
            >
              Карточный бой <kbd>2</kbd>
            </button>
            <p className="hint contact-battle-actions__hint">
              Автобой — быстрый расчёт и итог. Карточный — стол с картами (ИИ
              принимает вызов сразу).
            </p>
          </footer>
        )}

        {phase === "animating" && !error && (
          <p className="hint contact-battle-wait">Идёт бой…</p>
        )}
      </motion.div>
    </div>
  );
}
