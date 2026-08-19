import { Drawer } from "vaul";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: ReactNode;
  /** Extra class on the sheet content. */
  className?: string;
  /**
   * Max height as percent of visual viewport (default 88).
   * Uses --app-vh (px) when set, else dvh — never bare vh (Android Chrome URL bar).
   */
  maxHeightVh?: number;
  /** Leave the phone dock tappable — overlay/content stop above it. */
  aboveDock?: boolean;
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
  aboveDock = false,
}: Props) {
  const fraction = Math.min(100, Math.max(40, maxHeightVh)) / 100;
  const dockClass = aboveDock ? " gmap-sheet-overlay--above-dock" : "";
  const contentDockClass = aboveDock ? " gmap-sheet-content--above-dock" : "";
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      shouldScaleBackground={false}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={`gmap-sheet-overlay${dockClass}`} />
        <Drawer.Content
          className={`gmap-sheet-content${contentDockClass} ${className}`.trim()}
          style={
            aboveDock
              ? undefined
              : {
                  maxHeight: `min(${maxHeightVh}dvh, calc(var(--app-vh, 100dvh) * ${fraction}))`,
                }
          }
        >
          <div className="gmap-sheet-handle-hit" aria-hidden>
            <div className="gmap-sheet-handle" />
          </div>
          {title ? (
            <Drawer.Title className="gmap-sheet-title">{title}</Drawer.Title>
          ) : (
            <Drawer.Title className="sr-only">Панель</Drawer.Title>
          )}
          <Drawer.Description className="sr-only">
            Нижняя панель интерфейса
          </Drawer.Description>
          <div className="gmap-sheet-body">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
