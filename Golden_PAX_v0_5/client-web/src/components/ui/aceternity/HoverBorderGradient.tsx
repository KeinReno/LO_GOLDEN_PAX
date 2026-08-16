import { type ButtonHTMLAttributes, type ElementType, type ReactNode } from "react";
import { cn } from "../../../lib/utils";

type HoverBorderGradientProps = {
  children: ReactNode;
  as?: ElementType;
  containerClassName?: string;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>;

/** Aceternity Hover Border Gradient — ghost / secondary chrome. */
export function HoverBorderGradient({
  children,
  as: Tag = "button",
  containerClassName,
  className,
  ...props
}: HoverBorderGradientProps) {
  return (
    <Tag
      className={cn(
        "group relative rounded-lg bg-transparent p-[1px] transition duration-300",
        containerClassName,
      )}
      {...props}
    >
      <span className="absolute inset-0 rounded-lg bg-gradient-to-r from-transparent via-cyan-500/40 to-gp-gold/40 opacity-0 blur-sm transition duration-500 group-hover:opacity-100" />
      <span
        className={cn(
          "relative block rounded-[inherit] border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-sm text-slate-200 backdrop-blur-md transition group-hover:border-cyan-500/30 group-hover:text-white",
          className,
        )}
      >
        {children}
      </span>
    </Tag>
  );
}
