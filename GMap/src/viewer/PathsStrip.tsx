import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { fmtInt } from "../state/numberFormat";
import type { ViewerPayload } from "../state/types";
import {
  buildPathStripRows,
  type PathNavigateView,
  type PathStripRow,
} from "./buildPathStripRows";

const HOVER_OPEN_MS = 320;
const HOVER_CLOSE_MS = 140;

const NAV_LABELS: Record<PathNavigateView, string> = {
  economy: "Экономика",
  research: "Наука",
  market: "Биржа",
  court: "Двор",
};

type Props = {
  economy?: ViewerPayload["economy"];
  compact?: boolean;
  onNavigate: (view: PathNavigateView) => void;
};

function PathPopover({
  row,
  anchor,
  onClose,
  onNavigate,
  onPointerEnter,
  onPointerLeave,
}: {
  row: PathStripRow;
  anchor: { left: number; top: number };
  onClose: () => void;
  onNavigate: (view: PathNavigateView) => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const nextUnlock = row.unlocks.find((u) => !u.granted);

  return createPortal(
    <div
      className="paths-strip-popover paths-strip-popover--portal"
      style={{ left: anchor.left, top: anchor.top }}
      role="dialog"
      aria-label={`${row.label}: прогресс пути`}
      onMouseEnter={onPointerEnter}
      onMouseLeave={onPointerLeave}
    >
      <header className="paths-strip-popover__head">
        <span className="paths-strip-popover__icon" aria-hidden>
          {row.icon}
        </span>
        <div>
          <strong>{row.label}</strong>
          <span className="hint">
            {row.state === "disabled"
              ? "не в пилоте"
              : row.state === "open"
                ? "открыт"
                : row.state === "ready"
                  ? "готов к прорыву"
                  : "накопление"}
          </span>
        </div>
      </header>

      {row.pilot ? (
        <dl className="paths-strip-breakdown" aria-label="Разбивка">
          <div className="paths-strip-breakdown__row">
            <dt>База</dt>
            <dd className="tabular-nums">{fmtInt(row.score)}</dd>
          </div>
          {row.modifiers.map((m) => (
            <div key={m.label} className="paths-strip-breakdown__row">
              <dt>{m.label}</dt>
              <dd>{m.detail}</dd>
            </div>
          ))}
          <div className="paths-strip-breakdown__row paths-strip-breakdown__row--total">
            <dt>Итог</dt>
            <dd className="tabular-nums">{fmtInt(row.score)}</dd>
          </div>
          {row.threshold > 0 ? (
            <div className="paths-strip-breakdown__row">
              <dt>До порога</dt>
              <dd className="tabular-nums">
                {fmtInt(Math.max(0, row.threshold - row.score))} (
                {row.pct}%)
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="hint paths-strip-popover__stub">
          Путь появится в следующих волнах — сейчас без накопления и порогов.
        </p>
      )}

      {nextUnlock ? (
        <p className="paths-strip-popover__unlock">
          <span className="hint">Откроется:</span>{" "}
          <strong>{nextUnlock.name}</strong>
          {nextUnlock.threshold > 0 ? (
            <span className="tabular-nums hint">
              {" "}
              · {fmtInt(nextUnlock.threshold)}
            </span>
          ) : null}
        </p>
      ) : row.pilot && row.unlocks.length === 0 && row.threshold > 0 ? (
        <p className="paths-strip-popover__unlock">
          <span className="hint">Порог:</span>{" "}
          <strong className="tabular-nums">{fmtInt(row.threshold)}</strong>
        </p>
      ) : null}

      <footer className="paths-strip-popover__foot">
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            onNavigate(row.navigate);
            onClose();
          }}
        >
          {NAV_LABELS[row.navigate]}
        </button>
      </footer>
    </div>,
    document.body,
  );
}

function PathCell({
  row,
  onNavigate,
}: {
  row: PathStripRow;
  onNavigate: (view: PathNavigateView) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLButtonElement>(null);

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ left: r.left + r.width / 2, top: r.bottom + 6 });
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onMove = () => measure();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, measure]);

  const onEnter = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (open) return;
    openTimer.current = setTimeout(() => {
      measure();
      setOpen(true);
    }, HOVER_OPEN_MS);
  };

  const onLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
  };

  const stateClass =
    row.state === "disabled"
      ? "paths-strip-cell--disabled"
      : row.state === "open"
        ? "paths-strip-cell--open"
        : row.state === "ready"
          ? "paths-strip-cell--ready"
          : "paths-strip-cell--active";

  const tip = row.pilot
    ? `${row.label}: ${fmtInt(row.score)}${
        row.threshold > 0 ? ` / ${fmtInt(row.threshold)}` : ""
      }`
    : `${row.label}: не в пилоте`;

  return (
    <>
      <button
        ref={rootRef}
        type="button"
        className={`paths-strip-cell ${stateClass}${open ? " paths-strip-cell--open" : ""}`}
        title={tip}
        aria-label={tip}
        aria-expanded={open}
        onClick={() => onNavigate(row.navigate)}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
      >
        <span className="paths-strip-cell__icon" aria-hidden>
          {row.icon}
        </span>
        {row.pilot ? (
          <span className="paths-strip-cell__track" aria-hidden>
            <motion.span
              className="paths-strip-cell__fill"
              initial={false}
              animate={{ width: `${row.pct}%` }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.35, ease: "easeOut" }
              }
            />
          </span>
        ) : (
          <span className="paths-strip-cell__track paths-strip-cell__track--stub" aria-hidden />
        )}
      </button>
      {open && anchor ? (
        <PathPopover
          row={row}
          anchor={anchor}
          onClose={() => setOpen(false)}
          onNavigate={onNavigate}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
        />
      ) : null}
    </>
  );
}

export function PathsStrip({ economy, compact, onNavigate }: Props) {
  const rows = buildPathStripRows(economy);

  return (
    <div
      className={`paths-strip${compact ? " paths-strip--compact" : ""}`}
      aria-label="Пути развития"
      role="list"
    >
      <div className="paths-strip__material" role="presentation">
        {rows.slice(0, 8).map((row) => (
          <PathCell key={row.id} row={row} onNavigate={onNavigate} />
        ))}
      </div>
      <span className="paths-strip__sep" aria-hidden />
      <div className="paths-strip__civic" role="presentation">
        {rows.slice(8).map((row) => (
          <PathCell key={row.id} row={row} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}
