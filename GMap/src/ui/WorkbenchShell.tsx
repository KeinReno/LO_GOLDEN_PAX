import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector(".action-ring, .eco-doctrine-modal")) {
        return;
      }
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="workbench-root" role="presentation">
      <button
        type="button"
        className="workbench-backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div
        className={`workbench-panel ${wide ? "workbench-panel--wide" : ""} ${className}`.trim()}
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
    </div>,
    document.body,
  );
}
