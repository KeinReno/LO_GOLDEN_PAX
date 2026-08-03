import type { ReactNode } from "react";

type Props = {
  message?: string | null;
  onDismiss?: () => void;
  children?: ReactNode;
};

/**
 * Reserved chrome slot for sync / board toasts.
 * Never use position:absolute hanging under the top bar — that overlaps panels.
 */
export function StatusStrip({ message, onDismiss, children }: Props) {
  if (!message && !children) return null;
  return (
    <div className="status-strip" role="status" aria-live="polite">
      <div className="status-strip-main">
        {message ? <span className="status-strip-msg">{message}</span> : null}
        {children}
      </div>
      {message && onDismiss ? (
        <button
          type="button"
          className="status-strip-dismiss"
          aria-label="Закрыть"
          onClick={onDismiss}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
