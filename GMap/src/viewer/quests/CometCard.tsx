import {
  useRef,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";

type CometCardProps = {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. */
  rotateDepth?: number;
  disabled?: boolean;
};

/**
 * Aceternity-style CometCard: pointer-driven 3D tilt with preserve-3d.
 */
export function CometCard({
  children,
  className = "",
  rotateDepth = 14,
  disabled = false,
}: CometCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--comet-rx", `${(-py * rotateDepth).toFixed(2)}deg`);
    el.style.setProperty("--comet-ry", `${(px * rotateDepth).toFixed(2)}deg`);
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--comet-rx", "0deg");
    el.style.setProperty("--comet-ry", "0deg");
  };

  return (
    <div
      ref={ref}
      className={`comet-card ${className}`.trim()}
      style={
        {
          "--comet-rx": "0deg",
          "--comet-ry": "0deg",
        } as CSSProperties
      }
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <div className="comet-card__inner">{children}</div>
    </div>
  );
}
