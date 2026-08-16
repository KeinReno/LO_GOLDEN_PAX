import { type ReactNode } from "react";
import { cn } from "../../lib/utils";

type ShellLayoutProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  hud?: ReactNode;
  error?: string | null;
  children: ReactNode;
  overlay?: ReactNode;
};

export function ShellLayout({ title, subtitle, actions, hud, error, children, overlay }: ShellLayoutProps) {
  return (
    <div className="flex h-full flex-col bg-gp-map">
      <header className="gp-glass z-20 flex shrink-0 items-center justify-between gap-4 border-b border-cyan-500/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-100">{title}</div>
          {subtitle ? <div className="truncate text-xs text-slate-400">{subtitle}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {hud}
      {error ? (
        <p className="border-b border-red-500/30 bg-red-950/40 px-4 py-2 text-sm text-red-200">{error}</p>
      ) : null}
      <div className="relative flex min-h-0 flex-1">{children}</div>
      {overlay}
    </div>
  );
}

type GlassFieldProps = {
  label: string;
  children: ReactNode;
};

export function GlassField({ label, children }: GlassFieldProps) {
  return (
    <label className="mb-3 block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}

export const glassInputClass = cn(
  "w-full rounded-lg border border-slate-700/80 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100",
  "placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/30",
);

export function HudChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "gp-glass inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-slate-200",
        className,
      )}
    >
      {children}
    </span>
  );
}
