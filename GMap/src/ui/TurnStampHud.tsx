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
  if (!enabled) return null;
  return (
    <div
      className="turn-stamp-hud"
      aria-hidden
      style={{
        position: "absolute",
        left: 12,
        bottom: 12,
        zIndex: 5,
        pointerEvents: "none",
        padding: "8px 12px",
        borderRadius: 2,
        background: "linear-gradient(135deg, rgba(26,21,16,0.82), rgba(18,14,10,0.72))",
        border: "1px solid rgba(201,162,39,0.4)",
        color: "#e8dcc8",
        fontFamily: "Georgia, 'Times New Roman', serif",
        fontSize: 13,
        letterSpacing: "0.04em",
        boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ color: "#c9a227", fontWeight: 600, fontSize: 15 }}>
        Ход {t}
      </div>
      {n ? (
        <div style={{ opacity: 0.75, marginTop: 2, maxWidth: 220 }}>{n}</div>
      ) : null}
    </div>
  );
}
