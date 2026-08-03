import { useEffect, useState, type ButtonHTMLAttributes } from "react";

type BtnState = "idle" | "loading" | "success";

/**
 * Button with loading / success feedback (Aceternity-inspired, CSS-only).
 */
export function StatefulButton({
  busy,
  success,
  successLabel = "Готово",
  successMs = 1600,
  onSuccessEnd,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  success?: boolean;
  successLabel?: string;
  successMs?: number;
  onSuccessEnd?: () => void;
}) {
  const [phase, setPhase] = useState<BtnState>("idle");

  useEffect(() => {
    if (busy) {
      setPhase("loading");
      return;
    }
    if (success) {
      setPhase("success");
      const t = window.setTimeout(() => {
        setPhase("idle");
        onSuccessEnd?.();
      }, successMs);
      return () => window.clearTimeout(t);
    }
    setPhase("idle");
  }, [busy, success, successMs, onSuccessEnd]);

  const label =
    phase === "loading" ? "…" : phase === "success" ? successLabel : children;

  return (
    <button
      type="button"
      className={`stateful-btn ${phase !== "idle" ? `is-${phase}` : ""} ${className}`.trim()}
      disabled={rest.disabled || phase === "loading"}
      aria-busy={phase === "loading"}
      {...rest}
    >
      <span className="stateful-btn-label">{label}</span>
    </button>
  );
}
