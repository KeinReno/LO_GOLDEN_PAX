import {
  IconFlask,
  IconGavel,
  IconMap2,
  IconPlayerPlay,
  IconSwords,
  IconHourglass,
  IconCoins,
} from "@tabler/icons-react";
import { useMemo, type ReactNode } from "react";
import { FloatingDock, type DockItem } from "../../components/ui/aceternity/FloatingDock";
import { TableSidebar, type SidebarLink } from "../../components/ui/aceternity/TableSidebar";
import { DOCK_ROOM_IDS, SHELL_ROOMS, type ShellRoom } from "../../state/shellNav";
import { useWorldStore } from "../../state/worldStore";

const ROOM_ICONS: Record<ShellRoom, ReactNode> = {
  map: <IconMap2 size={18} aria-hidden />,
  economy: <IconCoins size={18} aria-hidden />,
  science: <IconFlask size={18} aria-hidden />,
  court: <IconGavel size={18} aria-hidden />,
  forces: <IconSwords size={18} aria-hidden />,
};

export function useSidebarLinks(): SidebarLink[] {
  const shellRoom = useWorldStore((s) => s.shellRoom);
  const setShellRoom = useWorldStore((s) => s.setShellRoom);

  return useMemo(
    () =>
      SHELL_ROOMS.map((room) => ({
        label: room.label,
        icon: ROOM_ICONS[room.id],
        active: shellRoom === room.id,
        onClick: () => setShellRoom(room.id),
      })),
    [shellRoom, setShellRoom],
  );
}

export function useDockItems(isGm: boolean): DockItem[] {
  const setShellRoom = useWorldStore((s) => s.setShellRoom);
  const runTurn = useWorldStore((s) => s.runTurn);
  const loading = useWorldStore((s) => s.loading);
  const view = useWorldStore((s) => s.view);

  return useMemo(() => {
    const turnItem: DockItem = isGm
      ? {
          title: "Turn",
          icon: <IconPlayerPlay size={20} aria-hidden />,
          onClick: () => runTurn(),
          disabled: loading,
        }
      : {
          title: "Wait",
          icon: <IconHourglass size={20} aria-hidden />,
          disabled: true,
        };

    const roomItems: DockItem[] = DOCK_ROOM_IDS.map((id) => {
      const meta = SHELL_ROOMS.find((r) => r.id === id)!;
      return {
        title: meta.label,
        icon: ROOM_ICONS[id],
        onClick: () => setShellRoom(id),
      };
    });

    void view;
    return [turnItem, ...roomItems];
  }, [isGm, loading, runTurn, setShellRoom, view]);
}

export function TableSidebarNav({ isGm, footer }: { isGm: boolean; footer?: ReactNode }) {
  const links = useSidebarLinks();
  return (
    <TableSidebar
      links={links}
      header={<span className="text-xs font-medium text-slate-400">{isGm ? "GM table" : "Player table"}</span>}
      footer={footer}
    />
  );
}

export function TableFloatingDock({ isGm }: { isGm: boolean }) {
  const items = useDockItems(isGm);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div className="pointer-events-auto">
        <FloatingDock items={items} />
      </div>
    </div>
  );
}
