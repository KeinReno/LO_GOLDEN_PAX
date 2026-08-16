import { useViewerSessionStore } from "../../../state/viewerSessionStore";

/** Pick-target / touch-move toasts — session store, no callback drilling. */
export function OrderTargetBanner() {
  const pickingTarget = useViewerSessionStore((s) => s.pickingTarget);
  const touchMoveArmed = useViewerSessionStore((s) => s.touchMoveArmed);
  if (pickingTarget) {
    return (
      <div className="viewer-toast viewer-toast--pick" role="status">
        Укажите систему-цель · Esc — отмена
      </div>
    );
  }
  if (touchMoveArmed) {
    return (
      <div className="viewer-toast viewer-toast--pick" role="status">
        Коснитесь системы-цели · или тяните юнит пальцем
      </div>
    );
  }
  return null;
}
