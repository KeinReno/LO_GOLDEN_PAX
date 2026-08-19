import { useState } from "react";
import { useWorldStore } from "../state/worldStore";
import type { Faction, ViewerPayload } from "../state/types";
import { useGmFactionPlay } from "./gm/useGmFactionPlay";
import {
  gmFactionPasswordPost,
  gmJsonError,
  gmMasterPost,
} from "./gm/gmAsFaction";
import { GmLedgerPanel } from "./GmLedgerPanel";
import { ResearchPanel } from "../viewer/ResearchPanel";
import { ForcesDeck } from "../viewer/forces/ForcesDeck";
import { EconomyPanel } from "../viewer/economy";
import { researchEffectNav } from "../viewer/features/rooms-router/roomPanelCopy";
import { PolityForcesMaster, PolityScienceMaster } from "./PolityMasterTools";

type PlayNav = {
  onOpenForces?: () => void;
  onOpenEconomy?: () => void;
  onOpenScience?: () => void;
};

export function PolityScienceTab({
  faction,
  onOpenForces,
  onOpenEconomy,
}: { faction: Faction } & PlayNav) {
  const jumpToGmMap = useWorldStore((s) => s.jumpToGmMap);
  const { payload, masterToken, loadError, patchEco } = useGmFactionPlay(
    faction.id,
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const postEco = async (url: string, extra: Record<string, unknown>) => {
    const result = await gmMasterPost(url, masterToken, {
      factionId: faction.id,
      ...extra,
    });
    if (!result.ok) throw new Error(gmJsonError(result, String(result.status)));
    const economy = result.data.economy as ViewerPayload["economy"] | undefined;
    if (economy) patchEco(economy);
    return result.data;
  };

  if (!payload.economy) {
    return (
      <div className="polity-hold">
        <PolityScienceMaster
          factionId={faction.id}
          masterToken={masterToken}
          eco={null}
          onEco={patchEco}
        />
        <p className="hint">
          {loadError ||
            "Нет казны этой державы. Опубликуйте стол — или выдайте технологию выше, чтобы создать запись."}
        </p>
      </div>
    );
  }

  return (
    <div className="polity-player-room">
      <PolityScienceMaster
        factionId={faction.id}
        masterToken={masterToken}
        eco={payload.economy}
        onEco={patchEco}
      />
      <ResearchPanel
        eco={payload.economy}
        world={payload.world}
        factionId={payload.factionId}
        busy={busy}
        msg={msg ?? loadError}
        onResearch={(techId) =>
          void run(async () => {
            const data = await postEco("/api/economy/research", { techId });
            setMsg(
              `Исследовано: ${
                (data.tech as { name?: string } | undefined)?.name ?? techId
              }`,
            );
          })
        }
        onResearchUpgrade={(techId, upgradeId) =>
          void run(async () => {
            const data = await postEco("/api/economy/research-upgrade", {
              techId,
              upgradeId,
            });
            setMsg(
              `Улучшено: ${
                (data.upgrade as { name?: string } | undefined)?.name ??
                upgradeId
              }`,
            );
          })
        }
        onUpgradeGrade={(techId) =>
          void run(async () => {
            const data = await postEco("/api/economy/tech/upgrade-grade", {
              techId,
            });
            setMsg(`Ранг ${String(data.grade ?? "")}`);
          })
        }
        onFillSocket={(techId, resourceId) =>
          void run(async () => {
            await postEco("/api/economy/tech/fill-socket", {
              techId,
              resourceId,
            });
            setMsg("Сокет заполнен");
          })
        }
        onSetQueue={(queue) =>
          void run(async () => {
            const data = await postEco("/api/economy/research-queue", {
              queue,
            });
            const n = (data.queue as string[] | undefined)?.length ?? 0;
            setMsg(`Очередь: ${n} слотов`);
          })
        }
        onAccelerate={(techId) =>
          void run(async () => {
            const data = await postEco("/api/economy/research-accelerate", {
              techId,
            });
            setMsg(
              `Ускорено: ${
                (data.tech as { name?: string } | undefined)?.name ?? techId
              }`,
            );
          })
        }
        onAlchemyExperiment={(techA, techB) =>
          void run(async () => {
            const data = await postEco("/api/economy/alchemy/experiment", {
              techA,
              techB,
              mode: "auto",
            });
            setMsg(String(data.message || `Алхимия: ${data.outcome}`));
          })
        }
        onRerollOffer={(direction) =>
          void run(async () => {
            await postEco("/api/economy/tech-offers/direction-reroll", {
              direction,
            });
            setMsg("Предложение обновлено");
          })
        }
        onOpenBuilding={(buildingName) => {
          const sys = payload.world.systems.find(
            (s) => s.ownerFactionId === faction.id,
          );
          if (sys) {
            jumpToGmMap({
              factionId: faction.id,
              systemId: sys.id,
              dive: "system",
            });
          }
          setMsg(buildingName ? `Здание: ${buildingName}` : null);
        }}
        onEffectNavigate={(target) => {
          const nav = researchEffectNav(target);
          if (!nav) return;
          if (nav.room === "economy") onOpenEconomy?.();
          else onOpenForces?.();
        }}
      />
    </div>
  );
}

export function PolityForcesTab({ faction }: { faction: Faction }) {
  const world = useWorldStore((s) => s.world);
  const jumpToGmMap = useWorldStore((s) => s.jumpToGmMap);
  const updateFleet = useWorldStore((s) => s.updateFleet);
  const updateLegion = useWorldStore((s) => s.updateLegion);
  const selectFleet = useWorldStore((s) => s.selectFleet);
  const selectLegion = useWorldStore((s) => s.selectLegion);
  const selectedFleetId = useWorldStore((s) => s.selectedFleetId);
  const selectedLegionId = useWorldStore((s) => s.selectedLegionId);
  const { payload, password, patchEco } = useGmFactionPlay(faction.id);
  const [toast, setToast] = useState<string | null>(null);

  const focusForce = (
    kind: "fleet" | "legion",
    id: string,
    systemId?: string | null,
  ) => {
    if (kind === "fleet") selectFleet(id);
    else selectLegion(id);
    if (systemId) {
      jumpToGmMap({
        factionId: faction.id,
        systemId,
        dive: "galaxy",
        fleetId: kind === "fleet" ? id : null,
        legionId: kind === "legion" ? id : null,
      });
    }
  };

  return (
    <div className="polity-player-room">
      <PolityForcesMaster faction={faction} />
      {toast ? <p className="hint">{toast}</p> : null}
      <ForcesDeck
        payload={payload}
        selectedFleetId={selectedFleetId}
        selectedLegionId={selectedLegionId}
        onSelectFleet={(id) => selectFleet(id)}
        onSelectLegion={(id) => selectLegion(id)}
        onFocusOnMap={(systemId) =>
          jumpToGmMap({
            factionId: faction.id,
            systemId,
            dive: "galaxy",
            fleetId: selectedFleetId,
            legionId: selectedLegionId,
          })
        }
        onOrderWithFleet={(id) => {
          const fl = world.fleets.find((f) => f.id === id);
          focusForce("fleet", id, fl?.systemId);
        }}
        onOrderWithLegion={(id) => {
          const lg = world.legions.find((l) => l.id === id);
          focusForce("legion", id, lg?.systemId);
        }}
        onOpenProduce={({ systemId, fleetId, legionId }) => {
          jumpToGmMap({
            factionId: faction.id,
            systemId,
            dive: "system",
            fleetId: fleetId ?? null,
            legionId: legionId ?? null,
          });
        }}
        onForcesMutate={async ({
          kind,
          id,
          composition,
          stockDeltas,
          forceReserve,
        }) => {
          if (kind === "fleet") updateFleet(id, { composition });
          else updateLegion(id, { composition });
          if (!password) {
            setToast("Нет кода доступа державы — состав только в черновике карты");
            return true;
          }
          const result = await gmFactionPasswordPost("/api/forces/mutate", {
            factionId: faction.id,
            password,
            kind,
            id,
            composition,
            stockDeltas,
            forceReserve,
          });
          if (!result.ok) {
            const err = gmJsonError(result, String(result.status));
            setToast(err);
            return { ok: false, error: err };
          }
          const economy = result.data.economy as
            | ViewerPayload["economy"]
            | undefined;
          if (economy) patchEco(economy);
          setToast(null);
          return { ok: true };
        }}
        onToast={setToast}
      />
    </div>
  );
}

export function PolityEconomyTab({
  faction,
  onOpenScience,
}: { faction: Faction } & PlayNav) {
  const jumpToGmMap = useWorldStore((s) => s.jumpToGmMap);
  const { payload, loadError } = useGmFactionPlay(faction.id);

  if (!payload.economy) {
    return (
      <div className="polity-hold">
        <p className="hint">{loadError || "Нет казны — опубликуйте стол."}</p>
        <GmLedgerPanel factionId={faction.id} />
      </div>
    );
  }

  const goSys = (systemId: string) =>
    jumpToGmMap({
      factionId: faction.id,
      systemId,
      dive: "system",
    });

  return (
    <div className="polity-player-room polity-player-room--eco">
      <EconomyPanel
        open
        embedded
        payload={payload}
        factionName={faction.name}
        onClose={() => {
          /* stays in studio */
        }}
        onOpenSystem={goSys}
        onFocusSystemOnMap={(systemId) =>
          jumpToGmMap({
            factionId: faction.id,
            systemId,
            dive: "galaxy",
          })
        }
        onFocusDeficit={(_letter, systemId) => {
          if (systemId) goSys(systemId);
        }}
        onFocusBuild={() => {
          const owned = payload.world.systems.find(
            (s) => s.ownerFactionId === faction.id,
          );
          if (owned) goSys(owned.id);
        }}
        onOpenResearch={() => onOpenScience?.()}
      />
      <details className="polity-gm-treasury">
        <summary>Казна мастера</summary>
        <GmLedgerPanel factionId={faction.id} />
      </details>
    </div>
  );
}
