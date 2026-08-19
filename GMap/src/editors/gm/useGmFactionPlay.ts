import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorldStore } from "../../state/worldStore";
import type { ViewerPayload } from "../../state/types";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { asViewerEconomy, buildGmViewerPayload } from "./buildGmViewerPayload";
import { gmMasterGet } from "./gmAsFaction";

export function useGmFactionPlay(factionId: string) {
  const world = useWorldStore((s) => s.world);
  const { masterToken } = useCampaignSessionCtx();
  const [eco, setEco] = useState<ViewerPayload["economy"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!factionId) return;
    const result = await gmMasterGet(
      `/api/ledger/${encodeURIComponent(factionId)}`,
      masterToken,
    );
    if (!result.ok) {
      setLoadError(
        typeof result.data.error === "string"
          ? result.data.error
          : "Нет казны — опубликуйте стол",
      );
      return;
    }
    setEco(asViewerEconomy(result.data));
    setLoadError(null);
  }, [factionId, masterToken]);

  useEffect(() => {
    void refresh();
  }, [refresh, world.meta.turn, world.meta.tableRevision]);

  const payload = useMemo(
    () => buildGmViewerPayload(world, factionId, eco),
    [world, factionId, eco],
  );

  const password =
    world.factions.find((f) => f.id === factionId)?.password ?? "";

  return {
    payload,
    password,
    masterToken,
    loadError,
    refresh,
    patchEco: (next?: ViewerPayload["economy"] | null) => {
      if (next) setEco(next);
    },
  };
}
