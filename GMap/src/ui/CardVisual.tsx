import type { CSSProperties, ReactNode } from "react";

export type CardVisualProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  accent?: string;
  children?: ReactNode;
  className?: string;
  dragging?: boolean;
  tilt?: boolean;
  pinned?: boolean;
  style?: CSSProperties;
};

/**
 * Presentational card chrome — tokens from app.css (`.drag-card*`).
 * Used by DragCard; A7–A10 can also render static cards with the same look.
 */
export function CardVisual({
  title,
  subtitle,
  icon,
  accent,
  children,
  className = "",
  dragging = false,
  tilt = false,
  pinned = false,
  style,
}: CardVisualProps) {
  const classes = [
    "drag-card",
    dragging ? "drag-card--dragging" : "",
    tilt ? "drag-card--tilt" : "",
    pinned ? "drag-card--pinned" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={
        {
          ...style,
          ...(accent ? { "--drag-card-accent": accent } : null),
        } as CSSProperties
      }
    >
      <div className="drag-card__sheen" aria-hidden />
      <header className="drag-card__head">
        {icon ? <span className="drag-card__icon">{icon}</span> : null}
        <div className="drag-card__titles">
          <div className="drag-card__title">{title}</div>
          {subtitle ? <div className="drag-card__subtitle">{subtitle}</div> : null}
        </div>
      </header>
      {children ? <div className="drag-card__body">{children}</div> : null}
    </div>
  );
}
