import { type ReactNode } from "react";
import { cn } from "../../../lib/utils";

type CometCardProps = {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  accent?: "gold" | "cyan";
  onClick?: () => void;
  selected?: boolean;
};

/** Aceternity Comet Card — border comet trail on hover. */
export function CometCard({
  title,
  description,
  className,
  accent = "cyan",
  onClick,
  selected,
}: CometCardProps) {
  const accentClass =
    accent === "gold"
      ? "from-gp-gold/80 via-gp-gold-soft/40 to-transparent"
      : "from-cyan-400/80 via-cyan-500/30 to-transparent";

  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "group/comet relative w-full overflow-hidden rounded-xl border bg-slate-950/90 p-3 text-left transition",
        selected ? "border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.15)]" : "border-slate-800/80",
        onClick && "cursor-pointer hover:border-cyan-500/30",
        className,
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -inset-px opacity-0 transition duration-500 group-hover/comet:opacity-100",
          "bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent)]",
          "animate-[shimmer_2.5s_ease-in-out_infinite]",
        )}
        aria-hidden
      />
      <span
        className={cn(
          "pointer-events-none absolute -left-1/2 top-0 h-px w-[200%] bg-gradient-to-r opacity-0 transition group-hover/comet:opacity-100",
          accentClass,
        )}
        aria-hidden
      />
      <div className="relative z-10">
        <div className="text-sm font-semibold text-slate-100">{title}</div>
        {description ? <div className="mt-1 text-xs text-slate-400">{description}</div> : null}
      </div>
    </Tag>
  );
}
