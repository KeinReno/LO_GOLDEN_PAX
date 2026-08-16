import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  title: string;
  children?: ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  confirmClassName?: string;
};

/**
 * Themed confirmation dialog (not window.confirm).
 * Uses economy doctrine modal styling.
 */
export function ConfirmModal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  busy,
  confirmClassName = "btn primary",
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="eco-doctrine-modal" role="dialog" aria-modal="true">
      <button
        type="button"
        className="eco-doctrine-modal__backdrop"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <div className="eco-doctrine-modal__card">
        <h3>{title}</h3>
        {children}
        <div className="eco-doctrine-modal__actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmClassName}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
