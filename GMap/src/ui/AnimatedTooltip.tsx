import {
  useCallback,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
  /** Delay before show (ms). */
  delayMs?: number;
};

/**
 * Aceternity AnimatedTooltip port — delayed hover tip, imperial chrome.
 * No continuous RAF; portal only while open. Prefer over ad-hoc title=.
 */
export function AnimatedTooltip({
  content,
  children,
  className,
  side = "top",
  delayMs = 280,
}: Props) {
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timer = useRef<number | null>(null);

  const show = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        x: r.left + r.width / 2,
        y: side === "top" ? r.top : r.bottom,
      });
      setOpen(true);
    }, delayMs);
  }, [side, delayMs]);

  const hide = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
  }, []);

  return (
    <span
      ref={ref}
      className={["eco-tip-anchor", className].filter(Boolean).join(" ")}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className={`eco-tip eco-tip--${side}`}
            style={{ left: pos.x, top: pos.y }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
