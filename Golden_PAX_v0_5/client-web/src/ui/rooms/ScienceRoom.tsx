import { useMemo } from "react";
import { CometCard } from "../../components/ui/aceternity/CometCard";
import { NumberTicker } from "../../components/ui/aceternity/NumberTicker";
import {
  TECH_DIRECTIONS,
  type TechDirection,
  type TechOfferDirection,
  type ViewPayload,
} from "../../state/viewTypes";
import { useWorldStore } from "../../state/worldStore";
import { ActionError, PlayerOnlyNotice, RoomFrame } from "./RoomFrame";

function cognitioBalance(stocks: Record<string, number>): number {
  return Number(stocks["currency.cognitio"] ?? stocks.cognitio ?? 0);
}

function parseOffers(raw: unknown): Partial<Record<TechDirection, TechOfferDirection>> {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<TechDirection, TechOfferDirection>> = {};
  for (const dir of TECH_DIRECTIONS) {
    const row = (raw as Record<string, unknown>)[dir];
    if (!row || typeof row !== "object") continue;
    const candidates = (row as { candidates?: unknown }).candidates;
    if (!Array.isArray(candidates)) continue;
    out[dir] = {
      candidates: candidates.map(String),
      rerolled: Boolean((row as { rerolled?: boolean }).rerolled),
    };
  }
  return out;
}

export function ScienceRoom({ view }: { view: ViewPayload }) {
  const sessionMode = useWorldStore((s) => s.sessionMode);
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const researchTech = useWorldStore((s) => s.researchTech);
  const rerollTechOffer = useWorldStore((s) => s.rerollTechOffer);
  const fillTechSocket = useWorldStore((s) => s.fillTechSocket);

  const stocks = view.self.economy.stocks ?? {};
  const cognitio = cognitioBalance(stocks);
  const offers = useMemo(
    () => parseOffers(view.self.tech?.currentOffers),
    [view.self.tech?.currentOffers],
  );
  const sockets = (view.self.tech?.techSockets ?? {}) as Record<string, string | null>;
  const socketTechIds = Object.keys(sockets);
  const mapFillers = useMemo(
    () => Object.keys(stocks).filter((k) => k.startsWith("map.")).sort(),
    [stocks],
  );

  if (sessionMode !== "player") {
    return (
      <RoomFrame label="Science" title="Research offers">
        <PlayerOnlyNotice />
      </RoomFrame>
    );
  }

  return (
    <RoomFrame label="Science" title="Research offers" wide>
      <div className="mb-4 flex items-center justify-between rounded-lg border border-violet-500/20 bg-violet-950/20 px-4 py-3">
        <span className="text-xs uppercase tracking-wide text-violet-300/70">Cognitio</span>
        <span className="gp-mono text-lg text-violet-100">
          <NumberTicker value={cognitio} />
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TECH_DIRECTIONS.map((dir) => {
          const offer = offers[dir];
          const candidates = offer?.candidates ?? [];
          return (
            <section key={dir} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
              <header className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium capitalize text-slate-200">{dir}</h3>
                <button
                  type="button"
                  disabled={loading || offer?.rerolled}
                  onClick={() => void rerollTechOffer(dir)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-400 hover:border-violet-500/40 disabled:opacity-40"
                  title={offer?.rerolled ? "Already rerolled this turn" : "Reroll direction"}
                >
                  Reroll
                </button>
              </header>
              <div className="space-y-2">
                {candidates.length === 0 ? (
                  <p className="text-xs text-slate-500">No candidates</p>
                ) : (
                  candidates.map((techId) => (
                    <CometCard
                      key={techId}
                      title={techId.replace(/^tech\./, "")}
                      description="Click to research (spends cognitio server-side)"
                      onClick={loading ? undefined : () => void researchTech(techId)}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {socketTechIds.length > 0 && (
        <section className="mt-6 border-t border-slate-800 pt-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Tech sockets</h3>
          <div className="space-y-3">
            {socketTechIds.map((techId) => (
              <div key={techId} className="rounded-lg border border-slate-800 px-3 py-2">
                <p className="text-sm text-slate-200">{techId}</p>
                <p className="text-xs text-slate-500">
                  Filled: {sockets[techId] ?? "empty"}
                </p>
                {!sockets[techId] && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {mapFillers.slice(0, 8).map((resourceId) => (
                      <button
                        key={resourceId}
                        type="button"
                        disabled={loading}
                        onClick={() => void fillTechSocket(techId, resourceId)}
                        className="rounded border border-slate-700 px-2 py-0.5 text-[0.65rem] text-slate-300 hover:border-violet-500/40 disabled:opacity-40"
                      >
                        {resourceId.replace("map.", "")}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <ActionError message={error} />
    </RoomFrame>
  );
}
