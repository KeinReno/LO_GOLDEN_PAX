import { IconX } from "@tabler/icons-react";

import { CanvasRevealEffect } from "../../components/ui/aceternity/CanvasRevealEffect";

import { CardSpotlight } from "../../components/ui/aceternity/CardSpotlight";

import { CometCard } from "../../components/ui/aceternity/CometCard";

import { EvervaultCard } from "../../components/ui/aceternity/EvervaultCard";

import { HoverBorderGradient } from "../../components/ui/aceternity/HoverBorderGradient";

import { useWorldStore } from "../../state/worldStore";

import type { ForceView, SystemView } from "../../state/viewTypes";



function factionName(

  view: NonNullable<ReturnType<typeof useWorldStore.getState>["view"]>,

  factionId: string | null | undefined,

): string {

  if (!factionId) return "—";

  if (view.self.faction.id === factionId) return view.self.faction.name;

  const other = view.others.find((o) => o.id === factionId);

  return other?.name ?? factionId;

}



function isOwnForce(view: NonNullable<ReturnType<typeof useWorldStore.getState>["view"]>, force: ForceView): boolean {

  if (view.viewer.role === "player") return force.factionId === view.viewer.factionId;

  return false;

}



function isSpottedEnemy(view: NonNullable<ReturnType<typeof useWorldStore.getState>["view"]>, force: ForceView): boolean {

  if (view.viewer.role !== "player") return false;

  if (force.factionId === view.viewer.factionId) return false;

  return force.knowledge === "spotted" || force.spotted === true;

}



export function SystemDossier() {

  const view = useWorldStore((s) => s.view);

  const selectedSystemId = useWorldStore((s) => s.selectedSystemId);

  const selectedForceId = useWorldStore((s) => s.selectedForceId);

  const setSelectedSystemId = useWorldStore((s) => s.setSelectedSystemId);

  const setSelectedForceId = useWorldStore((s) => s.setSelectedForceId);

  const colonizePlanet = useWorldStore((s) => s.colonizePlanet);

  const upgradePlanetGrade = useWorldStore((s) => s.upgradePlanetGrade);

  const loading = useWorldStore((s) => s.loading);

  const error = useWorldStore((s) => s.error);



  if (!view || !selectedSystemId) return null;



  const system = view.systems.find((s) => s.id === selectedSystemId);

  if (!system) return null;



  const playerFactionId = view.viewer.role === "player" ? view.viewer.factionId : "";

  const ownsSystem =

    view.viewer.role === "player" &&

    system.knowledge === 0 &&

    system.ownerFactionId === playerFactionId;



  const planets = system.knowledge === 0 && "planets" in system ? system.planets : undefined;

  const systemForces = view.forces.filter((f) => f.systemId === system.id);

  const ownForces = systemForces.filter((f) => isOwnForce(view, f));

  const spotted = systemForces.filter((f) => isSpottedEnemy(view, f));



  const content = (

    <CardSpotlight

      className="absolute right-0 top-0 z-10 h-full w-72 shrink-0 border-l border-cyan-500/10 rounded-none lg:rounded-l-xl"

      color="rgba(34, 211, 238, 0.1)"

    >

      <div className="flex h-full flex-col overflow-auto p-4">

        <header className="mb-3 flex items-start justify-between gap-2">

          <div>

            <p className="text-[0.65rem] uppercase tracking-widest text-cyan-500/70">System dossier</p>

            <h2 className="text-lg font-semibold text-slate-100">{system.name}</h2>

          </div>

          <HoverBorderGradient

            type="button"

            onClick={() => setSelectedSystemId(null)}

            aria-label="Close dossier"

            containerClassName="shrink-0"

          >

            <IconX size={16} aria-hidden />

          </HoverBorderGradient>

        </header>



        {system.knowledge === 1 ? (

          <EvervaultCard text="Intel · hop-1 silhouette" className="mb-3 border-amber-500/20">

            <p className="text-sm text-slate-300">

              Colonies unknown at this knowledge level. Owner silhouette only.

            </p>

            <dl className="mt-2 space-y-1 text-xs">

              <Row label="Owner" value={factionName(view, system.ownerFactionId)} />

              {system.kind ? <Row label="Kind" value={system.kind} /> : null}

            </dl>

          </EvervaultCard>

        ) : (

          <dl className="space-y-2 text-sm">

            <Row label="Owner" value={factionName(view, system.ownerFactionId)} />

            <Row label="Knowledge" value="Full" />

            {system.kind ? <Row label="Kind" value={system.kind} /> : null}

            {system.isCapital ? <Row label="Capital" value="Yes" /> : null}

          </dl>

        )}



        {planets && planets.length > 0 && (

          <section className="mt-4 border-t border-slate-800 pt-3">

            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Planets</h3>

            <ul className="space-y-2 text-sm">

              {planets.map((p) => {

                const canColonize =

                  ownsSystem && !p.ownerFactionId && p.habitable !== false;

                const canUpgrade = ownsSystem && p.ownerFactionId === playerFactionId;

                return (

                <li

                  key={p.id}

                  className="rounded-lg border border-slate-800/80 bg-slate-950/50 px-2.5 py-2 transition hover:border-cyan-500/20"

                >

                  <strong className="text-slate-100">{p.name}</strong>

                  {p.ownerFactionId ? (

                    <span className="text-slate-500"> · {factionName(view, p.ownerFactionId)}</span>

                  ) : (

                    <span className="text-slate-500"> · uncolonized</span>

                  )}

                  {(canColonize || canUpgrade) && (

                    <div className="mt-2 flex flex-wrap gap-1">

                      {canColonize ? (

                        <button

                          type="button"

                          disabled={loading}

                          onClick={() => void colonizePlanet(system.id, p.id)}

                          className="rounded border border-emerald-500/30 px-2 py-0.5 text-[0.65rem] text-emerald-200 hover:bg-emerald-950/30 disabled:opacity-40"

                        >

                          Colonize

                        </button>

                      ) : null}

                      {canUpgrade ? (

                        <>

                          <button

                            type="button"

                            disabled={loading}

                            onClick={() => void upgradePlanetGrade(system.id, p.id, "surface")}

                            className="rounded border border-cyan-500/30 px-2 py-0.5 text-[0.65rem] text-cyan-200 hover:bg-cyan-950/30 disabled:opacity-40"

                          >

                            +Surface grade

                          </button>

                          <button

                            type="button"

                            disabled={loading}

                            onClick={() => void upgradePlanetGrade(system.id, p.id, "orbital")}

                            className="rounded border border-violet-500/30 px-2 py-0.5 text-[0.65rem] text-violet-200 hover:bg-violet-950/30 disabled:opacity-40"

                          >

                            +Orbital grade

                          </button>

                        </>

                      ) : null}

                    </div>

                  )}

                  {canUpgrade ? <PlanetBuildCatalog systemId={system.id} planetId={p.id} /> : null}

                </li>

                );

              })}

            </ul>

          </section>

        )}



        {ownForces.length > 0 && (

          <section className="mt-4 border-t border-slate-800 pt-3">

            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Your forces</h3>

            <div className="space-y-2">

              {ownForces.map((f) => (

                <CometCard

                  key={f.id}

                  title={f.name ?? f.kind}

                  description={`${f.kind} · MP ${f.movementPoints ?? 0}`}

                  selected={selectedForceId === f.id}

                  onClick={() => setSelectedForceId(f.id)}

                />

              ))}

            </div>

          </section>

        )}



        {spotted.length > 0 && (

          <section className="mt-4 border-t border-slate-800 pt-3">

            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Spotted contacts</h3>

            <div className="space-y-2">

              {spotted.map((f) => (

                <EvervaultCard key={f.id} text="Encrypted contact">

                  <p className="text-sm text-slate-300">{f.name ?? f.kind}</p>

                  <p className="text-xs text-slate-500">

                    {factionName(view, f.factionId)}

                    {f.approxCount != null ? ` · ~${f.approxCount} units` : " · composition classified"}

                  </p>

                </EvervaultCard>

              ))}

            </div>

          </section>

        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-2 py-1.5 text-[0.65rem] text-rose-200">
            {error}
          </p>
        ) : null}

      </div>

    </CardSpotlight>

  );



  return (

    <CanvasRevealEffect once className="absolute inset-y-0 right-0 w-72" durationMs={550}>

      {content}

    </CanvasRevealEffect>

  );

}



function Row({ label, value }: { label: string; value: string }) {

  return (

    <div className="flex justify-between gap-3 border-b border-slate-800/80 py-1.5">

      <dt className="text-slate-500">{label}</dt>

      <dd className="text-right text-slate-200">{value}</dd>

    </div>

  );

}

function PlanetBuildCatalog({ systemId, planetId }: { systemId: string; planetId: string }) {
  const catalog = useWorldStore((s) => s.catalog);
  const buildOnPlanet = useWorldStore((s) => s.buildOnPlanet);
  const loading = useWorldStore((s) => s.loading);
  const buildings = catalog?.buildings ?? [];
  const surface = buildings.filter((b) => b.zone !== "orbital");
  const orbital = buildings.filter((b) => b.zone === "orbital");

  if (!catalog) {
    return <p className="mt-2 text-[0.65rem] text-slate-500">Catalog not loaded.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      <BuildZoneList
        label="Surface"
        defs={surface}
        disabled={loading}
        onBuild={(id) => void buildOnPlanet(systemId, planetId, id)}
      />
      <BuildZoneList
        label="Orbital"
        defs={orbital}
        disabled={loading}
        onBuild={(id) => void buildOnPlanet(systemId, planetId, id)}
      />
    </div>
  );
}

function BuildZoneList({
  label,
  defs,
  disabled,
  onBuild,
}: {
  label: string;
  defs: Array<{ id: string; name: string; cost?: Record<string, number> }>;
  disabled: boolean;
  onBuild: (buildingId: string) => void;
}) {
  if (!defs.length) return null;
  return (
    <div>
      <p className="mb-1 text-[0.6rem] uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex max-h-28 flex-wrap gap-1 overflow-auto">
        {defs.map((b) => (
          <button
            key={b.id}
            type="button"
            disabled={disabled}
            title={b.id}
            onClick={() => onBuild(b.id)}
            className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[0.6rem] text-amber-100 hover:bg-amber-950/30 disabled:opacity-40"
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}



export function openSystemDossier(system: SystemView) {

  useWorldStore.getState().setSelectedSystemId(system.id);

}


