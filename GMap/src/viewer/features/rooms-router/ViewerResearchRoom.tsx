import { useState } from "react";
import type { ViewerPayload } from "../../../state/types";
import { postPlayerJson } from "../../../state/playerActionClient";
import {
  postFillTechSocket,
  postResearch,
  postResearchOfferReroll,
  postUpgradeTechGrade,
} from "../../../state/researchClient";
import { economyCategoryLabel } from "../../../state/displayLabels";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerPanelFocusStore } from "../../../state/viewerPanelFocusStore";
import { ResearchPanel } from "../../ResearchPanel";
import { navigateViewerRoom } from "./navigateViewerRoom";
import { researchEffectNav, researchFlowRates } from "./roomPanelCopy";

type Props = {
  payload: ViewerPayload;
  password: string;
  mobile: boolean;
  onEconomyPatch: (economy: ViewerPayload["economy"]) => void;
  onOpenBuilding: (buildingId: string) => void;
  onTechMapDrag: (techId: string) => void;
};

export function ViewerResearchRoom({
  payload,
  password,
  mobile,
  onEconomyPatch,
  onOpenBuilding,
  onTechMapDrag,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const flowData = useViewerOrderSessionStore((s) => s.flowData);
  const highlightTechId = useViewerPanelFocusStore(
    (s) => s.researchHighlightTechId,
  );
  const branch = useViewerPanelFocusStore((s) => s.researchBranch);
  const setBranch = useViewerPanelFocusStore((s) => s.setResearchBranch);
  const setEconomyFocusCategory = useViewerPanelFocusStore(
    (s) => s.setEconomyFocusCategory,
  );
  const setForcesHighlightDefIds = useViewerPanelFocusStore(
    (s) => s.setForcesHighlightDefIds,
  );
  const setOrderMsg = useViewerOrderSessionStore((s) => s.setOrderMsg);

  const patchEco = (economy: ViewerPayload["economy"] | undefined) => {
    if (economy) onEconomyPatch(economy);
  };

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

  const postEconomy = async (
    url: string,
    extra: Record<string, unknown>,
  ) => {
    const { ok, status, data } = await postPlayerJson(url, {
      factionId: payload.factionId,
      password,
      ...extra,
    });
    if (!ok) throw new Error(data.error || String(status));
    patchEco(data.economy as ViewerPayload["economy"]);
    return data;
  };

  const rates = researchFlowRates(flowData?.totals, branch);

  if (!payload.economy) {
    return (
      <div className="hq-panel">
        <header className="hq-panel-head">
          <h2>Наука</h2>
          <p className="hint">
            Нет данных экономики — перелогиньтесь после нового хода.
          </p>
        </header>
      </div>
    );
  }

  return (
    <ResearchPanel
      eco={payload.economy}
      world={payload.world}
      factionId={payload.factionId}
      onResearch={(id) =>
        void run(async () => {
          const result = await postResearch({
            factionId: payload.factionId,
            password,
            techId: id,
          });
          if (!result.ok) throw new Error(result.error);
          patchEco(result.data.economy);
          setMsg(`Исследовано: ${result.data.tech?.name ?? id}`);
        })
      }
      onResearchUpgrade={(techId, upgradeId) =>
        void run(async () => {
          const data = await postEconomy("/api/economy/research-upgrade", {
            techId,
            upgradeId,
          });
          setMsg(`Улучшено: ${data.upgrade?.name ?? upgradeId}`);
        })
      }
      onUpgradeGrade={(techId) =>
        void run(async () => {
          const result = await postUpgradeTechGrade({
            factionId: payload.factionId,
            password,
            techId,
          });
          if (!result.ok) throw new Error(result.error);
          patchEco(result.data.economy);
          setMsg(`Ранг ${result.data.grade ?? ""}`);
        })
      }
      onFillSocket={(techId, resourceId) =>
        void run(async () => {
          const result = await postFillTechSocket({
            factionId: payload.factionId,
            password,
            techId,
            resourceId,
          });
          if (!result.ok) throw new Error(result.error);
          patchEco(result.data.economy);
          setMsg("Сокет заполнен");
        })
      }
      onSetQueue={(queue) =>
        void run(async () => {
          const data = await postEconomy("/api/economy/research-queue", {
            queue,
          });
          setMsg(
            `Очередь: ${(data.queue as string[] | undefined)?.length ?? 0} слотов`,
          );
        })
      }
      onAccelerate={(id) =>
        void run(async () => {
          const data = await postEconomy("/api/economy/research-accelerate", {
            techId: id,
          });
          setMsg(`Ускорено: ${data.tech?.name ?? id}`);
        })
      }
      onAlchemyExperiment={(a, b) =>
        void run(async () => {
          const data = await postEconomy("/api/economy/alchemy/experiment", {
            techA: a,
            techB: b,
            mode: "auto",
          });
          setMsg(data.message || `Алхимия: ${data.outcome}`);
        })
      }
      onRerollOffer={(direction) =>
        void run(async () => {
          const result = await postResearchOfferReroll({
            factionId: payload.factionId,
            password,
            direction,
          });
          if (!result.ok) throw new Error(result.error);
          patchEco(result.data.economy);
          setMsg("Предложение обновлено");
        })
      }
      busy={busy}
      msg={msg}
      branch={branch}
      onBranchChange={setBranch}
      highlightTechId={highlightTechId}
      cognitioIncome={rates.cognitioIncome}
      categoryIncome={rates.categoryIncome}
      categoryDemand={rates.categoryDemand}
      flowTotals={flowData?.totals}
      onOpenBuilding={onOpenBuilding}
      onTechMapDrag={onTechMapDrag}
      onEffectNavigate={(target) => {
        const nav = researchEffectNav(target);
        if (!nav) return;
        if (nav.room === "economy") {
          setEconomyFocusCategory(nav.economyCategory ?? null);
          navigateViewerRoom("economy");
          setOrderMsg(
            nav.economyCategory
              ? `Производство · фильтр ${economyCategoryLabel(nav.economyCategory)}`
              : "Производство",
          );
        } else {
          setForcesHighlightDefIds(nav.forceHighlightIds ?? null);
          navigateViewerRoom("forces");
          setOrderMsg(
            nav.forceHighlightIds?.length
              ? `Силы · подсветка ${nav.forceHighlightIds.join(" → ")}`
              : "Силы",
          );
        }
      }}
      compact={mobile}
    />
  );
}
