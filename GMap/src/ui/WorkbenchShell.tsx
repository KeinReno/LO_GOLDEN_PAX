import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra class on the dialog panel. */
  className?: string;
  /** Badge in the title row (e.g. incoming count). */
  badge?: ReactNode;
  wide?: boolean;
  /** Master–detail: dock panel to the left (pair with system layer on the right). */
  masterDetail?: boolean;
};

/**
 * Fullscreen workbench for Diplomacy / Market / Research / Forces.
 * Esc + backdrop close. Keeps map mounted underneath.
 */
export function WorkbenchShell({
  open,
  title,
  subtitle,
  onClose,
  children,
  className = "",
  badge,
  wide,
  masterDetail = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.tagName === "SELECT" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      // System dive owns Esc when master–detail is open (see ViewerPage).
      if (masterDetail && document.querySelector(".viewer-system-layer")) {
        return;
      }
      if (document.querySelector(".action-ring, .eco-doctrine-modal")) {
        return;
      }
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, masterDetail]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  // In-tree (not body portal): dock/topbar stay in the same stacking
  // context and keep receiving room-switch clicks.
  return (
    <div
      className={`workbench-root${masterDetail ? " workbench-root--master-detail" : ""}`}
      role="presentation"
    >
      <button
        type="button"
        className="workbench-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className={`workbench-panel ${wide ? "workbench-panel--wide" : ""} ${masterDetail ? "workbench-panel--master" : ""} ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="workbench-head">
          <div className="workbench-head-text">
            <h2>{title}</h2>
            {subtitle ? <p className="hint">{subtitle}</p> : null}
          </div>
          {badge}
          <button
            type="button"
            className="btn ghost workbench-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={16} strokeWidth={2} aria-hidden />
            <span>Закрыть</span>
            <kbd>Esc</kbd>
          </button>
        </header>
        <div className="workbench-body">{children}</div>
      </div>
    </div>
  );
}
