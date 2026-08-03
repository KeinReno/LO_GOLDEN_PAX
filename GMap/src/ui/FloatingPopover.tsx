import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
  type VirtualElement,
} from "@floating-ui/react";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Anchor point in viewport coordinates (e.g. context menu click). */
  x: number;
  y: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  placement?: Placement;
  role?: "menu" | "dialog" | "tooltip";
  /** Extra pad from viewport edges. */
  edgePad?: number;
};

/**
 * Virtual-reference popover (RMB / long-press cards) with flip + shift
 * so menus never clip off-screen or stack over reserved chrome.
 */
export function FloatingPopover({
  open,
  onClose,
  x,
  y,
  children,
  className,
  style,
  placement = "bottom-start",
  role = "menu",
  edgePad = 8,
}: Props) {
  const virtual: VirtualElement = useMemo(
    () => ({
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
      }),
    }),
    [x, y],
  );

  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: (next) => {
      if (!next) onClose();
    },
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: edgePad }),
      shift({ padding: edgePad }),
    ],
  });

  useLayoutEffect(() => {
    refs.setPositionReference(virtual);
  }, [refs, virtual]);

  // Ignore the same pointer that opened the menu (RMB / long-press up).
  const openedAtRef = useRef(0);
  useLayoutEffect(() => {
    if (open) openedAtRef.current = performance.now();
  }, [open, x, y]);

  const dismiss = useDismiss(context, {
    escapeKey: true,
    outsidePress: (event) => {
      if (performance.now() - openedAtRef.current < 80) return false;
      return event.type === "pointerdown" || event.type === "mousedown";
    },
  });
  const roleIx = useRole(context, { role });
  const { getFloatingProps } = useInteractions([dismiss, roleIx]);

  if (!open) return null;

  return (
    <div
      ref={refs.setFloating}
      className={className}
      style={{ ...floatingStyles, zIndex: 400, ...style }}
      {...getFloatingProps()}
    >
      {children}
    </div>
  );
}
