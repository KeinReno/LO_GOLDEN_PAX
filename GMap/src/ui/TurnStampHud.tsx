import { useEffect, useRef, useState } from "react";
import { playStaffCue } from "../audio/staffSfx";
import { useWorldStore } from "../state/worldStore";

/** On-map turn stamp (P8.4) — HTML overlay, not WebGL. */
export function TurnStampHud({
  turn,
  name,
  enabled = true,
}: {
  turn?: number;
  name?: string;
  enabled?: boolean;
}) {
  const storeTurn = useWorldStore((s) => s.world.meta.turn);
  const storeName = useWorldStore((s) => s.world.meta.name);
  const t = turn ?? storeTurn;
  const n = name ?? storeName;
  const prevTurn = useRef(t);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (prevTurn.current === t) return;
    prevTurn.current = t;
    playStaffCue("turn_advance");
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 750);
    return () => window.clearTimeout(id);
  }, [t]);

  if (!enabled) return null;
  return (
    <div
      className={`turn-stamp-hud${pulse ? " is-pulse" : ""}`}
      aria-hidden
    >
      <div className="turn-stamp-hud__turn">Ход {t}</div>
      {n ? <div className="turn-stamp-hud__name">{n}</div> : null}
    </div>
  );
}
