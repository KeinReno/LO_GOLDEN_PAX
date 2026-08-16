import { useMemo } from "react";

import { useWorldStore } from "../../state/worldStore";

import { GameShell } from "../shared/GameShell";



export function PlayerShell() {

  const view = useWorldStore((s) => s.view);

  const error = useWorldStore((s) => s.error);

  const loading = useWorldStore((s) => s.loading);

  const logout = useWorldStore((s) => s.logout);

  const refresh = useWorldStore((s) => s.refresh);

  const actionRing = useWorldStore((s) => s.actionRing);

  const setMoveForceId = useWorldStore((s) => s.setMoveForceId);

  const setSelectedSystemId = useWorldStore((s) => s.setSelectedSystemId);

  const engageForces = useWorldStore((s) => s.engageForces);

  const boardForce = useWorldStore((s) => s.boardForce);



  const ringItems = useMemo(() => {

    if (!view || !actionRing) return [];

    const force = view.forces.find((f) => f.id === actionRing.forceId);

    if (!force || !force.systemId) return [];



    const selfId = view.viewer.role === "player" ? view.viewer.factionId : null;

    if (!selfId || force.factionId !== selfId) return [];



    const sameSystem = view.forces.filter((f) => f.systemId === force.systemId);

    const enemies = sameSystem.filter((f) => f.factionId !== selfId);

    const engageTarget = enemies.find((f) => f.kind === force.kind);

    const fleetTarget = enemies.find((f) => f.kind === "fleet");



    return [

      { id: "move", label: "Move", onSelect: () => setMoveForceId(force.id) },

      {

        id: "engage",

        label: "Engage",

        disabled: !engageTarget,

        danger: true,

        onSelect: () => {

          if (engageTarget) engageForces(force.id, engageTarget.id);

        },

      },

      {

        id: "board",

        label: "Board",

        disabled: force.kind !== "legion" || !fleetTarget,

        danger: true,

        onSelect: () => {

          if (fleetTarget && force.systemId) {

            boardForce(force.id, fleetTarget.id, force.systemId);

          }

        },

      },

      { id: "open", label: "System", onSelect: () => setSelectedSystemId(force.systemId!) },

    ];

  }, [actionRing, view, setMoveForceId, engageForces, boardForce, setSelectedSystemId]);



  return (

    <GameShell

      title={view?.campaign.name ?? "Campaign"}

      subtitle={view?.self.faction.name}

      error={error}

      loading={loading}

      onRefresh={refresh}

      onLogout={logout}

      ringItems={ringItems}

    />

  );

}


