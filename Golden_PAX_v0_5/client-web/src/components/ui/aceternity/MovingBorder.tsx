import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../../../lib/utils";

type MovingBorderProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  containerClassName?: string;
  innerClassName?: string;
  borderRadius?: string;
};

/** Aceternity Moving Border — conic spin on primary actions. */
export function MovingBorder({
  children,
  className,
  containerClassName,
  innerClassName,
  borderRadius = "0.5rem",
  disabled,
  type = "button",
  ...props
}: MovingBorderProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        "relative inline-flex overflow-hidden p-[1px] disabled:cursor-not-allowed disabled:opacity-50",
        containerClassName,
        className,
      )}
      style={{ borderRadius }}
      {...props}
    >
      <span
        className={cn(
          "absolute inset-0 animate-gp-spin-slow",
          !disabled && "bg-[conic-gradient(from_90deg_at_50%_50%,#c9a239_0%,#22d3ee_45%,#c9a239_100%)]",
          disabled && "bg-slate-700",
        )}
      />
      <span
        className={cn(
          "relative inline-flex w-full items-center justify-center gap-2 bg-slate-950/95 px-4 py-2 text-sm font-medium text-slate-100 backdrop-blur-xl",
          innerClassName,
        )}
        style={{ borderRadius: `calc(${borderRadius} - 2px)` }}
      >
        {children}
      </span>
    </button>
  );
}
