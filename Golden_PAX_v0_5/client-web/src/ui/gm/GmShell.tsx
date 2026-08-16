import { useWorldStore } from "../../state/worldStore";

import { GameShell } from "../shared/GameShell";

import { GmMintPlayerToken } from "./GmMintPlayerToken";



export function GmShell() {

  const view = useWorldStore((s) => s.view);

  const error = useWorldStore((s) => s.error);

  const loading = useWorldStore((s) => s.loading);

  const logout = useWorldStore((s) => s.logout);

  const refresh = useWorldStore((s) => s.refresh);



  return (

    <GameShell

      isGm

      title={`GM · ${view?.campaign.name ?? "Campaign"}`}

      subtitle={`rev ${view?.tableRevision ?? "—"} · ${view?.forces.length ?? 0} forces`}

      error={error}

      loading={loading}

      onRefresh={refresh}

      onLogout={logout}

      ringItems={[]}

      sidebarFooter={<GmMintPlayerToken />}

    />

  );

}


