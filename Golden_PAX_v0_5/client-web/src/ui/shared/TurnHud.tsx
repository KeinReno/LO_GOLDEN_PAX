import { type ReactNode } from "react";

import { IconRefresh, IconLogout } from "@tabler/icons-react";

import { CometCard } from "../../components/ui/aceternity/CometCard";

import { HoverBorderGradient } from "../../components/ui/aceternity/HoverBorderGradient";

import { NumberTicker } from "../../components/ui/aceternity/NumberTicker";

import { cn } from "../../lib/utils";

import { useWorldStore } from "../../state/worldStore";

import { HudChip } from "./ShellLayout";



function stabilityClass(value: number | undefined): string {

  const v = value ?? 0;

  if (v >= 40) return "border-emerald-500/40 text-emerald-200";

  if (v >= 25) return "border-amber-500/40 text-amber-200";

  return "border-red-500/40 text-red-200";

}



export function TurnHud() {

  const view = useWorldStore((s) => s.view);

  const sessionMode = useWorldStore((s) => s.sessionMode);

  const selectedForceId = useWorldStore((s) => s.selectedForceId);

  const setSelectedForceId = useWorldStore((s) => s.setSelectedForceId);



  if (!view) return null;



  const stocks = view.self.economy.stocks ?? {};

  const metal = Number(stocks["currency.metal"] ?? stocks.metal ?? stocks.METAL ?? 0);

  const supply = Number(stocks["currency.supply"] ?? stocks.supply ?? stocks.SUPPLY ?? 0);

  const cognitio = Number(stocks["currency.cognitio"] ?? stocks.cognitio ?? stocks.COGNITIO ?? 0);

  const stability = sessionMode === "player" ? view.self.stability : undefined;



  const selfId = view.viewer.role === "player" ? view.viewer.factionId : null;

  const selectedForce = selectedForceId ? view.forces.find((f) => f.id === selectedForceId) : null;

  const showForceCard =

    selectedForce && selfId && selectedForce.factionId === selfId;



  return (

    <div

      className="gp-glass z-10 flex flex-wrap items-center gap-2 border-b border-cyan-500/10 px-4 py-2"

      role="status"

    >

      <HudChip>

        Turn <NumberTicker value={view.currentTurn} className="text-gp-gold-soft" />

      </HudChip>

      {sessionMode === "player" && (

        <>

          <HudChip className={cn(stabilityClass(stability))}>

            Stability{" "}

            {stability != null ? (

              <NumberTicker value={stability} className="font-semibold" />

            ) : (

              "—"

            )}

          </HudChip>

          <HudChip>

            Metal <NumberTicker value={metal} />

          </HudChip>

          <HudChip>

            Supply <NumberTicker value={supply} />

          </HudChip>

          <HudChip>

            Cognitio <NumberTicker value={cognitio} />

          </HudChip>

        </>

      )}

      {sessionMode === "gm" && (

        <HudChip className="text-slate-400">GM view · {view.systems.length} systems</HudChip>

      )}

      {showForceCard && selectedForce && (

        <div className="w-full max-w-xs sm:ml-auto sm:w-56">

          <CometCard

            accent="gold"

            selected

            title={selectedForce.name ?? selectedForce.kind}

            description={`Selected · ${selectedForce.kind} · MP ${selectedForce.movementPoints ?? 0}`}

            onClick={() => setSelectedForceId(null)}

          />

        </div>

      )}

    </div>

  );

}



export function ShellActions({

  onRefresh,

  onLogout,

  loading,

  extra,

}: {

  onRefresh: () => void;

  onLogout: () => void;

  loading?: boolean;

  extra?: ReactNode;

}) {

  return (

    <>

      {extra}

      <HoverBorderGradient type="button" onClick={onRefresh} disabled={loading} aria-label="Refresh">

        <span className="flex items-center gap-1.5 px-1">

          <IconRefresh size={15} aria-hidden />

          Refresh

        </span>

      </HoverBorderGradient>

      <HoverBorderGradient type="button" onClick={onLogout} aria-label="Log out">

        <span className="flex items-center gap-1.5 px-1">

          <IconLogout size={15} aria-hidden />

          Log out

        </span>

      </HoverBorderGradient>

    </>

  );

}


