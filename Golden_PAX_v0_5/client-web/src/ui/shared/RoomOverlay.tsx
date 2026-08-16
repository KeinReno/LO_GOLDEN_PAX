import { type ShellRoom } from "../../state/shellNav";
import { useWorldStore } from "../../state/worldStore";
import { CourtRoom } from "../rooms/CourtRoom";
import { EconomyRoom } from "../rooms/EconomyRoom";
import { ForcesRoom } from "../rooms/ForcesRoom";
import { ScienceRoom } from "../rooms/ScienceRoom";

export function RoomOverlay() {
  const shellRoom = useWorldStore((s) => s.shellRoom);
  const view = useWorldStore((s) => s.view);

  if (shellRoom === "map" || !view) return null;

  switch (shellRoom as Exclude<ShellRoom, "map">) {
    case "economy":
      return <EconomyRoom view={view} />;
    case "science":
      return <ScienceRoom view={view} />;
    case "court":
      return <CourtRoom view={view} />;
    case "forces":
      return <ForcesRoom view={view} />;
    default:
      return null;
  }
}
