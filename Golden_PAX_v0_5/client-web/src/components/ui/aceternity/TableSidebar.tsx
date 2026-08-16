import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../../../lib/utils";

export type SidebarLink = {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
};

type TableSidebarProps = {
  links: SidebarLink[];
  header?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

/**
 * Aceternity Sidebar pattern (Vite adapt) — icon rail, expands on hover.
 * No Next.js Link; buttons + callbacks only.
 */
export function TableSidebar({ links, header, footer, className }: TableSidebarProps) {
  return (
    <aside
      className={cn(
        "group/sidebar relative z-20 flex h-full shrink-0 flex-col border-r border-cyan-500/10 bg-slate-950/95 backdrop-blur-md transition-[width] duration-300 ease-out",
        "w-[3.25rem] hover:w-52 max-md:w-[3.25rem] max-md:hover:w-[3.25rem]",
        className,
      )}
    >
      {header ? (
        <div className="flex h-12 shrink-0 items-center overflow-hidden border-b border-slate-800/80 px-3">
          <div className="min-w-0 truncate opacity-0 transition group-hover/sidebar:opacity-100 max-md:opacity-0">
            {header}
          </div>
        </div>
      ) : null}

      <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Table rooms">
        {links.map((link) => (
          <SidebarLinkButton key={link.label} {...link} />
        ))}
      </nav>

      {footer ? (
        <div className="shrink-0 overflow-hidden border-t border-slate-800/80 p-2 opacity-0 transition group-hover/sidebar:opacity-100 max-md:hidden">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}

function SidebarLinkButton({ label, icon, onClick, active }: SidebarLink) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition",
        active
          ? "bg-cyan-500/15 text-cyan-100"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700/60 bg-slate-900/80">
        {icon}
      </span>
      <AnimatePresence>
        <motion.span
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: "auto" }}
          className="truncate whitespace-nowrap opacity-0 transition group-hover/sidebar:opacity-100 max-md:hidden"
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
