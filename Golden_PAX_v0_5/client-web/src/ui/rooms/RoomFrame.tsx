import type { ReactNode } from "react";
import { CardSpotlight } from "../../components/ui/aceternity/CardSpotlight";
import { useWorldStore } from "../../state/worldStore";

type RoomFrameProps = {
  label: string;
  title: string;
  children: ReactNode;
  wide?: boolean;
};

export function RoomFrame({ label, title, children, wide }: RoomFrameProps) {
  const setShellRoom = useWorldStore((s) => s.setShellRoom);

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center overflow-auto bg-slate-950/88 p-4 backdrop-blur-sm sm:p-6">
      <CardSpotlight
        className={`w-full ${wide ? "max-w-4xl" : "max-w-2xl"} p-5 sm:p-6`}
        color="rgba(201, 162, 57, 0.12)"
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-widest text-cyan-500/60">{label}</p>
            <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
          </div>
          <button
            type="button"
            onClick={() => setShellRoom("map")}
            className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500/40"
          >
            Back to map
          </button>
        </header>
        {children}
      </CardSpotlight>
    </div>
  );
}

export function PlayerOnlyNotice() {
  return <p className="text-sm text-amber-200/80">Seat a player token to act in this room.</p>;
}

export function ActionError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
      {message}
    </p>
  );
}
