import { useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import { cn } from "../../../lib/utils";

export type DockItem = {
  title: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

type FloatingDockProps = {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
};

/** Aceternity Floating Dock — Vite/React adapt (onClick, no next/link). */
export function FloatingDock({ items, desktopClassName, mobileClassName }: FloatingDockProps) {
  return (
    <>
      <FloatingDockDesktop items={items} className={desktopClassName} />
      <FloatingDockMobile items={items} className={mobileClassName} />
    </>
  );
}

function FloatingDockMobile({ items, className }: { items: DockItem[]; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div
            layoutId="nav"
            className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-2"
          >
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10, transition: { delay: idx * 0.04 } }}
                transition={{ delay: (items.length - 1 - idx) * 0.04 }}
              >
                <button
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    item.onClick?.();
                    setOpen(false);
                  }}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/95 text-slate-200 disabled:opacity-40"
                  aria-label={item.title}
                >
                  {item.icon}
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-12 w-12 items-center justify-center rounded-full border border-cyan-500/25 bg-slate-950/95 text-slate-200 shadow-lg backdrop-blur-md"
        aria-label="Quick actions"
      >
        <span className="text-lg">≡</span>
      </button>
    </div>
  );
}

function FloatingDockDesktop({ items, className }: { items: DockItem[]; className?: string }) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn(
        "mx-auto hidden h-16 items-end gap-3 rounded-2xl border border-cyan-500/15 bg-slate-950/90 px-4 pb-3 backdrop-blur-md md:flex",
        className,
      )}
    >
      {items.map((item) => (
        <IconContainer mouseX={mouseX} key={item.title} {...item} />
      ))}
    </motion.div>
  );
}

function IconContainer({
  mouseX,
  title,
  icon,
  onClick,
  disabled,
}: DockItem & { mouseX: MotionValue<number> }) {
  const ref = useRef<HTMLButtonElement>(null);
  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const widthTransform = useTransform(distance, [-150, 0, 150], [40, 56, 40]);
  const heightTransform = useTransform(distance, [-150, 0, 150], [40, 56, 40]);
  const width = useSpring(widthTransform, { mass: 0.1, stiffness: 150, damping: 12 });
  const height = useSpring(heightTransform, { mass: 0.1, stiffness: 150, damping: 12 });

  return (
    <motion.button
      type="button"
      ref={ref}
      disabled={disabled}
      onClick={onClick}
      aria-label={title}
      className="relative flex aspect-square items-center justify-center rounded-full bg-slate-900/90 text-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ width, height }}
    >
      <span className="flex items-center justify-center">{icon}</span>
      <span className="pointer-events-none absolute -top-8 hidden rounded-md bg-slate-900 px-2 py-0.5 text-[0.65rem] text-slate-200 group-hover:block">
        {title}
      </span>
    </motion.button>
  );
}
