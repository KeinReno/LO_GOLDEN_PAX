import { useMemo, useState } from "react";
import { EvervaultCard } from "../../components/ui/aceternity/EvervaultCard";
import type { CourtNpcView, ViewPayload } from "../../state/viewTypes";
import { useWorldStore } from "../../state/worldStore";
import { ActionError, PlayerOnlyNotice, RoomFrame } from "./RoomFrame";

function parseNpcs(raw: unknown): CourtNpcView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n) => n && typeof n === "object")
    .map((n) => {
      const row = n as Record<string, unknown>;
      return {
        id: String(row.id ?? ""),
        name: String(row.name ?? row.id ?? "NPC"),
        councilSeat: (row.councilSeat as string | null | undefined) ?? null,
        posting: row.posting as CourtNpcView["posting"],
        isPlayerRuler: Boolean(row.isPlayerRuler),
      };
    })
    .filter((n) => n.id);
}

function councilSeatIds(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  const council = raw as Record<string, unknown>;
  const unlocked = council.unlockedSeats;
  if (Array.isArray(unlocked) && unlocked.length > 0) {
    return unlocked.map(String);
  }
  const seats = council.seats;
  if (seats && typeof seats === "object") return Object.keys(seats as object);
  return ["seat.architect", "seat.warlord", "seat.magister"];
}

export function CourtRoom({ view }: { view: ViewPayload }) {
  const sessionMode = useWorldStore((s) => s.sessionMode);
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const seatNpc = useWorldStore((s) => s.seatNpc);
  const unseatNpc = useWorldStore((s) => s.unseatNpc);
  const assignPosting = useWorldStore((s) => s.assignPosting);
  const recallPosting = useWorldStore((s) => s.recallPosting);

  const court = view.self.court;
  const npcs = useMemo(() => parseNpcs(court && typeof court === "object" ? (court as { npcs?: unknown }).npcs : []), [court]);
  const seatIds = useMemo(
    () => councilSeatIds(court && typeof court === "object" ? (court as { seats?: unknown }).seats : null),
    [court],
  );

  const factionId = view.viewer.role === "player" ? view.viewer.factionId : "";
  const ownSystems = useMemo(
    () => view.systems.filter((s) => s.knowledge === 0 && s.ownerFactionId === factionId),
    [view.systems, factionId],
  );
  const ownForces = useMemo(
    () => view.forces.filter((f) => f.factionId === factionId),
    [view.forces, factionId],
  );

  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(() => npcs[0]?.id ?? null);
  const selected = npcs.find((n) => n.id === selectedNpcId) ?? null;

  if (sessionMode !== "player") {
    return (
      <RoomFrame label="Court" title="Council & postings">
        <PlayerOnlyNotice />
      </RoomFrame>
    );
  }

  return (
    <RoomFrame label="Court" title="Council & postings" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">NPCs</h3>
          <ul className="space-y-2">
            {npcs.length === 0 ? (
              <li className="text-sm text-slate-500">No NPCs in view — GM seeds court first.</li>
            ) : (
              npcs.map((npc) => (
                <li key={npc.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedNpcId(npc.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selectedNpcId === npc.id
                        ? "border-cyan-500/40 bg-cyan-950/30 text-slate-100"
                        : "border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    <span className="font-medium">{npc.name}</span>
                    {npc.councilSeat ? (
                      <span className="ml-2 text-xs text-cyan-300/70">{npc.councilSeat}</span>
                    ) : null}
                    {npc.posting?.kind ? (
                      <span className="ml-2 text-xs text-amber-300/70">{npc.posting.kind}</span>
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="space-y-4">
          {!selected ? (
            <p className="text-sm text-slate-500">Select an NPC to seat or post.</p>
          ) : (
            <>
              <EvervaultCard text="Council seat" className="border-cyan-500/20">
                <p className="text-sm text-slate-200">{selected.name}</p>
                <p className="text-xs text-slate-500">
                  Seat: {selected.councilSeat ?? "unseated"}
                  {selected.isPlayerRuler ? " · ruler" : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {seatIds
                    .filter((id) => id !== "seat.ruler")
                    .map((seatId) => (
                      <button
                        key={seatId}
                        type="button"
                        disabled={loading || selected.isPlayerRuler}
                        onClick={() => void seatNpc(selected.id, seatId)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500/40 disabled:opacity-40"
                      >
                        {seatId.replace("seat.", "")}
                      </button>
                    ))}
                  {selected.councilSeat && !selected.isPlayerRuler ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void unseatNpc(selected.id)}
                      className="rounded border border-rose-500/30 px-2 py-1 text-xs text-rose-200 hover:bg-rose-950/40 disabled:opacity-40"
                    >
                      Unseat
                    </button>
                  ) : null}
                </div>
              </EvervaultCard>

              <EvervaultCard text="Field posting" className="border-amber-500/20">
                <p className="mb-2 text-xs text-slate-400">Assign governor, commander, or admiral.</p>
                {selected.posting?.kind ? (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void recallPosting(selected.id)}
                    className="mb-3 rounded border border-rose-500/30 px-2 py-1 text-xs text-rose-200 disabled:opacity-40"
                  >
                    Recall posting
                  </button>
                ) : null}
                <div className="space-y-2">
                  <p className="text-[0.65rem] uppercase text-slate-500">Governor → system</p>
                  <div className="flex flex-wrap gap-1">
                    {ownSystems.map((sys) => (
                      <button
                        key={sys.id}
                        type="button"
                        disabled={loading}
                        onClick={() => void assignPosting(selected.id, "governor", sys.id)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-amber-500/40 disabled:opacity-40"
                      >
                        {sys.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[0.65rem] uppercase text-slate-500">Commander / admiral → force</p>
                  <div className="flex flex-wrap gap-1">
                    {ownForces.map((f) => {
                      const kind = f.kind === "fleet" ? "admiral" : "commander";
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={loading}
                          onClick={() => void assignPosting(selected.id, kind, f.id)}
                          className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-amber-500/40 disabled:opacity-40"
                        >
                          {f.name ?? f.id.slice(0, 8)} ({kind})
                        </button>
                      );
                    })}
                  </div>
                </div>
              </EvervaultCard>
            </>
          )}
        </section>
      </div>
      <ActionError message={error} />
    </RoomFrame>
  );
}
