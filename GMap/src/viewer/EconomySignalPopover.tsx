import { Coins } from "lucide-react";
import { FloatingPopover } from "../ui/FloatingPopover";
import type { EconomySystemSignal } from "./economyFlowTypes";
import { ECO_CATEGORY_COLORS } from "./economyFlowTypes";

type Props = {
  open: boolean;
  anchor: { x: number; y: number };
  onClose: () => void;
  signals: EconomySystemSignal[];
  onFocusSystem: (systemId: string) => void;
  onOpenHq?: () => void;
};

export function EconomySignalPopover({
  open,
  anchor,
  onClose,
  signals,
  onFocusSystem,
  onOpenHq,
}: Props) {
  return (
    <FloatingPopover
      open={open}
      onClose={onClose}
      x={anchor.x}
      y={anchor.y}
      className="economy-signal-popover"
      role="dialog"
      placement="bottom-start"
    >
      <header className="economy-signal-head">
        <Coins size={16} strokeWidth={2} aria-hidden />
        <div>
          <strong>Экономика</strong>
          <span className="hint">Узкие места</span>
        </div>
      </header>

      {signals.length === 0 ? (
        <p className="economy-signal-empty hint">Нет узких мест</p>
      ) : (
        <ul className="economy-signal-list" aria-label="Узкие места">
          {signals.map((sig, i) => (
            <li key={`${sig.systemId}-${sig.category}-${i}`}>
              {sig.systemId ? (
                <button
                  type="button"
                  className="economy-signal-item"
                  onClick={() => {
                    onFocusSystem(sig.systemId);
                    onClose();
                  }}
                >
                  <span
                    className="economy-signal-cat"
                    style={{ color: ECO_CATEGORY_COLORS[sig.category] }}
                    aria-hidden
                  >
                    {sig.category}
                  </span>
                  <span className="economy-signal-text">
                    <strong>{sig.systemName}</strong>
                    <span className="hint">{sig.reason}</span>
                  </span>
                </button>
              ) : (
                <div className="economy-signal-item economy-signal-item--static">
                  <span
                    className="economy-signal-cat"
                    style={{ color: ECO_CATEGORY_COLORS[sig.category] }}
                    aria-hidden
                  >
                    {sig.category}
                  </span>
                  <span className="economy-signal-text">
                    <strong>{sig.systemName}</strong>
                    <span className="hint">{sig.reason}</span>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {onOpenHq ? (
        <footer className="economy-signal-foot">
          <button type="button" className="btn ghost block" onClick={onOpenHq}>
            Подробнее в штабе / науке
          </button>
        </footer>
      ) : null}
    </FloatingPopover>
  );
}
