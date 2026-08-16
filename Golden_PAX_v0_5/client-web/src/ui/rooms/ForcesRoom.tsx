import { useMemo, useState } from "react";
import { CometCard } from "../../components/ui/aceternity/CometCard";
import type { ViewPayload } from "../../state/viewTypes";
import { useWorldStore } from "../../state/worldStore";
import { ActionError, PlayerOnlyNotice, RoomFrame } from "./RoomFrame";

type PlanetPick = { systemId: string; systemName: string; planetId: string; planetName: string };

function ownedPlanets(view: ViewPayload, factionId: string): PlanetPick[] {
  const out: PlanetPick[] = [];
  for (const sys of view.systems) {
    if (sys.knowledge !== 0 || sys.ownerFactionId !== factionId || !("planets" in sys)) continue;
    for (const p of sys.planets ?? []) {
      if (p.ownerFactionId !== factionId) continue;
      out.push({ systemId: sys.id, systemName: sys.name, planetId: p.id, planetName: p.name });
    }
  }
  return out;
}

function ownForces(view: ViewPayload, factionId: string) {
  return view.forces.filter((f) => f.factionId === factionId);
}

export function ForcesRoom({ view }: { view: ViewPayload }) {
  const sessionMode = useWorldStore((s) => s.sessionMode);
  const loading = useWorldStore((s) => s.loading);
  const error = useWorldStore((s) => s.error);
  const selectedForceId = useWorldStore((s) => s.selectedForceId);
  const setSelectedForceId = useWorldStore((s) => s.setSelectedForceId);
  const raiseUnit = useWorldStore((s) => s.raiseUnit);
  const disbandForce = useWorldStore((s) => s.disbandForce);
  const catalog = useWorldStore((s) => s.catalog);

  const factionId = view.viewer.role === "player" ? view.viewer.factionId : "";
  const planets = useMemo(() => ownedPlanets(view, factionId), [view, factionId]);
  const forces = useMemo(() => ownForces(view, factionId), [view, factionId]);
  const catalogRaise = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.units, ...catalog.ships];
  }, [catalog]);

  const [planetKey, setPlanetKey] = useState(() =>
    planets[0] ? `${planets[0].systemId}:${planets[0].planetId}` : "",
  );
  const picked = planets.find((p) => `${p.systemId}:${p.planetId}` === planetKey) ?? planets[0];

  if (sessionMode !== "player") {
    return (
      <RoomFrame label="Forces" title="Legions & fleets">
        <div className="space-y-2">
          {view.forces.slice(0, 12).map((f) => (
            <CometCard key={f.id} title={f.name ?? f.id} description={`${f.kind} · ${f.factionId}`} />
          ))}
          <PlayerOnlyNotice />
        </div>
      </RoomFrame>
    );
  }

  return (
    <RoomFrame label="Forces" title="Legions & fleets" wide>
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Your forces</h3>
          {forces.length === 0 ? (
            <p className="text-sm text-slate-500">No forces on the map yet.</p>
          ) : (
            <div className="space-y-2">
              {forces.map((f) => (
                <div key={f.id} className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <CometCard
                      title={f.name ?? f.kind}
                      description={`${f.kind} · ${f.systemId ?? "—"} · MP ${f.movementPoints ?? 0}`}
                      selected={selectedForceId === f.id}
                      onClick={() => setSelectedForceId(f.id)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void disbandForce(f.id)}
                    className="shrink-0 self-center rounded border border-rose-500/30 px-2 py-1 text-[0.65rem] text-rose-200 hover:bg-rose-950/40 disabled:opacity-40"
                  >
                    Disband
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-400">Raise unit</h3>
          {planets.length === 0 ? (
            <p className="text-sm text-slate-500">Colonize a planet in an owned system first.</p>
          ) : (
            <>
              <label className="mb-2 block text-xs text-slate-500">
                Home planet
                <select
                  value={planetKey}
                  onChange={(e) => setPlanetKey(e.target.value)}
                  className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-200"
                >
                  {planets.map((p) => (
                    <option key={`${p.systemId}:${p.planetId}`} value={`${p.systemId}:${p.planetId}`}>
                      {p.systemName} · {p.planetName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex max-h-64 flex-wrap gap-2 overflow-auto">
                {(catalogRaise ?? []).map((def) => (
                  <button
                    key={def.id}
                    type="button"
                    disabled={loading || !picked}
                    onClick={() =>
                      picked &&
                      void raiseUnit(picked.systemId, picked.planetId, {
                        defId: def.id,
                        kind: def.kind,
                        count: 1,
                      })
                    }
                    className="rounded-lg border border-cyan-500/30 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-950/30 disabled:opacity-40"
                    title={def.requiresTech ? `requires ${def.requiresTech}` : def.id}
                  >
                    {def.name}
                    <span className="ml-1 text-[0.65rem] text-slate-500">
                      {def.kind === "ship" ? "fleet" : "legion"}
                    </span>
                  </button>
                ))}
              </div>
              {!catalogRaise?.length ? (
                <p className="text-sm text-slate-500">Catalog not loaded — log in again.</p>
              ) : null}
            </>
          )}
        </section>
      </div>
      <ActionError message={error} />
    </RoomFrame>
  );
}
