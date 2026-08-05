import type { ReactNode } from "react";

export type MobileImmersiveRoomProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** e.g. mobile-room--rp */
  className?: string;
};

/**
 * Full-viewport mobile room (RP, quests) — not a bottom sheet.
 * Map is hidden underneath; game dock stays visible below the panel.
 */
export function MobileImmersiveRoom({
  open,
  onClose: _onClose,
  children,
  className = "",
}: MobileImmersiveRoomProps) {
  if (!open) return null;

  return (
    <div
      className={`mobile-room ${className}`.trim()}
      role="dialog"
      aria-modal="true"
    >
      <div className="mobile-room__panel">{children}</div>
    </div>
  );
}
