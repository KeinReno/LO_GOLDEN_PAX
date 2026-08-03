import { Drawer } from "vaul";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  /** Extra class on the sheet content. */
  className?: string;
  /** Max height fraction of viewport (default 0.88). */
  maxHeightVh?: number;
};

/**
 * Mobile / touch bottom sheet via vaul — dismiss by drag, backdrop, Esc.
 * Prefer this over nested full-screen rooms for drill-downs.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  children,
  className = "",
  maxHeightVh = 88,
}: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground>
      <Drawer.Portal>
        <Drawer.Overlay className="gmap-sheet-overlay" />
        <Drawer.Content
          className={`gmap-sheet-content ${className}`.trim()}
          style={{ maxHeight: `${maxHeightVh}vh` }}
        >
          <div className="gmap-sheet-handle" aria-hidden />
          {title ? (
            <Drawer.Title className="gmap-sheet-title">{title}</Drawer.Title>
          ) : (
            <Drawer.Title className="sr-only">Панель</Drawer.Title>
          )}
          <div className="gmap-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
