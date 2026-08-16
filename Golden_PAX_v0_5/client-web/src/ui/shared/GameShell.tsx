import { type ReactNode } from "react";
import { MapStage } from "../../renderers/MapStage";
import { useWorldStore } from "../../state/worldStore";
import { ActionRing, type ActionRingItem } from "./ActionRing";
import { RoomOverlay } from "./RoomOverlay";
import { ShellLayout } from "./ShellLayout";
import { SystemDossier } from "./SystemDossier";
import { TableFloatingDock, TableSidebarNav } from "./shellNavUi";
import { ShellActions, TurnHud } from "./TurnHud";

type GameShellProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  isGm?: boolean;
  headerExtra?: ReactNode;
  error?: string | null;
  loading?: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  ringItems: ActionRingItem[];
  sidebarFooter?: ReactNode;
};

/** Player + GM chrome — MapStage always mounted; room overlays on top. */
export function GameShell({
  title,
  subtitle,
  isGm = false,
  headerExtra,
  error,
  loading,
  onRefresh,
  onLogout,
  ringItems,
  sidebarFooter,
}: GameShellProps) {
  const actionRing = useWorldStore((s) => s.actionRing);
  const setActionRing = useWorldStore((s) => s.setActionRing);
  const shellRoom = useWorldStore((s) => s.shellRoom);
  const showDossier = shellRoom === "map";

  return (
    <div className="flex h-screen bg-gp-map">
      <TableSidebarNav isGm={isGm} footer={sidebarFooter} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ShellLayout
          title={title}
          subtitle={subtitle}
          actions={
            <ShellActions
              onRefresh={onRefresh}
              onLogout={onLogout}
              loading={loading}
              extra={headerExtra}
            />
          }
          hud={<TurnHud />}
          error={error}
          overlay={
            <ActionRing
              open={Boolean(actionRing)}
              x={actionRing?.x ?? 0}
              y={actionRing?.y ?? 0}
              onClose={() => setActionRing(null)}
              items={ringItems}
            />
          }
        >
          <div className="relative min-h-0 min-w-0 flex-1">
            <div className="absolute inset-0">
              <MapStage />
            </div>
            <RoomOverlay />
            {showDossier ? <SystemDossier /> : null}
            <TableFloatingDock isGm={isGm} />
          </div>
        </ShellLayout>
      </div>
    </div>
  );
}
