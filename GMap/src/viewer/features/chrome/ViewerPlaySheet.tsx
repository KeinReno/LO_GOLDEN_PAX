import { useMemo } from "react";
import { intentApCost } from "../../../state/contentCatalog";
import { resolveResourceOrCurrencyLabel } from "../../../state/displayLabels";
import { formatOdCost } from "../../../state/playerUiTerms";
import type { ViewerPayload } from "../../../state/types";
import { useViewerChromeStore } from "../../../state/viewerChromeStore";
import { useViewerOrderSessionStore } from "../../../state/viewerOrderSessionStore";
import { useViewerBattleSessionStore } from "../../../state/viewerBattleSessionStore";
import { useViewerSessionStore } from "../../../state/viewerSessionStore";
import {
  countOpenEngagements,
  PlayerEngagementPanel,
} from "../../PlayerEngagementPanel";
import type { ViewerPlayEngagementActions } from "../combat-flow/viewerPlayEngagementActions";
import {
  scoutRevealButtonLabel,
  systemSheetColonyHint,
  systemSheetMetaLine,
} from "./sheetCopy";

type Props = {
  payload: ViewerPayload;
  mobile: boolean;
  actions: ViewerPlayEngagementActions;
};

export function ViewerPlaySheet({
  payload,
  mobile,
  actions,
}: Props) {
  const sheetOpen = useViewerChromeStore((s) => s.sheetOpen);
  const setSheetOpen = useViewerChromeStore((s) => s.setSheetOpen);
  const setQueueOpen = useViewerChromeStore((s) => s.setQueueOpen);
  const stanceBusy = useViewerBattleSessionStore((s) => s.stanceBusy);
  const engagements = useViewerBattleSessionStore((s) => s.engagements);

  const selectedSystemId = useViewerSessionStore((s) => s.selectedSystemId);
  const selectedFleetId = useViewerSessionStore((s) => s.selectedFleetId);
  const selectedLegionId = useViewerSessionStore((s) => s.selectedLegionId);
  const setTargetSystemId = useViewerSessionStore((s) => s.setTargetSystemId);
  const setOrderType = useViewerOrderSessionStore((s) => s.setOrderType);

  const selectedSystem = useMemo(
    () => payload.world.systems.find((s) => s.id === selectedSystemId) ?? null,
    [payload, selectedSystemId],
  );
  const selectedFleet = useMemo(
    () =>
      (payload.world.fleets ?? []).find((f) => f.id === selectedFleetId) ??
      null,
    [payload, selectedFleetId],
  );
  const selectedLegion = useMemo(
    () =>
      (payload.world.legions ?? []).find((l) => l.id === selectedLegionId) ??
      null,
    [payload, selectedLegionId],
  );
  const hasTarget = Boolean(selectedSystem || selectedFleet || selectedLegion);
  const openEngagementCount = countOpenEngagements(
    engagements,
    payload.factionId,
  );

  return (
    <>
      {sheetOpen && hasTarget && (
        <button
          type="button"
          className="viewer-backdrop sheet"
          aria-label="Закрыть инфо"
          onClick={() => setSheetOpen(false)}
        />
      )}

      <aside
        className={`viewer-sheet ${sheetOpen && hasTarget ? "open" : ""}`}
      >
        <div className="viewer-sheet-grab">
          <p className="viewer-sheet-kicker">Сводка системы</p>
          <button
            type="button"
            className="viewer-sheet-close"
            onClick={() => setSheetOpen(false)}
          >
            Закрыть
          </button>
        </div>
        <div className="viewer-sheet-body">
          {!hasTarget && (
            <p className="hint">Выберите систему или юнит на карте</p>
          )}
          {selectedSystem && (
            <div>
              <h2 className="system-title">{selectedSystem.name}</h2>
              <p className="hint">
                {systemSheetMetaLine({
                  kind: selectedSystem.kind,
                  starCount: selectedSystem.stars.length,
                  planetCount: selectedSystem.planets.length,
                  ownerName:
                    payload.world.factions.find(
                      (f) => f.id === selectedSystem.ownerFactionId,
                    )?.name ?? null,
                })}
              </p>
              <button
                type="button"
                className="btn ghost block"
                style={{ marginBottom: 8 }}
                onClick={() => void actions.submitScoutReveal(selectedSystem.id)}
              >
                {scoutRevealButtonLabel(
                  intentApCost("intent.scout_reveal"),
                  formatOdCost,
                )}
              </button>
              {selectedSystem.planets.length > 0 && (
                <p className="hint">
                  {systemSheetColonyHint(
                    selectedSystem.planets.filter((p) => p.population > 0)
                      .length,
                    selectedSystem.resources
                      .slice(0, 4)
                      .map((id) => resolveResourceOrCurrencyLabel(id)),
                  )}
                </p>
              )}
              {(selectedSystem.stations?.length ?? 0) > 0 && (
                <p className="hint">
                  Станции:{" "}
                  {selectedSystem.stations!.map((st) => st.name).join(", ")}
                </p>
              )}
              {openEngagementCount > 0 &&
                engagements.some(
                  (e) =>
                    (e.status === "active" ||
                      e.status === "commit" ||
                      e.status === "contact") &&
                    e.systemId === selectedSystem.id,
                ) && (
                  <section className="hq-card" style={{ marginTop: 8 }}>
                    <h3>Столкновение</h3>
                    <PlayerEngagementPanel
                      payload={payload}
                      engagements={engagements}
                      busy={stanceBusy}
                      filterSystemId={selectedSystem.id}
                      showHistory={false}
                      onSubmitStance={(engId, stance) =>
                        void actions.submitCombatStance(engId, stance)
                      }
                      onOpenStanceRing={actions.openStanceRing}
                      onRequestCardBattle={(engId) =>
                        void actions.submitRequestCardBattle(engId)
                      }
                      onOpenCardBattle={actions.openCardBattle}
                    />
                  </section>
                )}
              {selectedSystem.planets
                .filter((p) => p.population > 0 || p.colonyType !== "none")
                .slice(0, 3)
                .map((p) => (
                  <div key={p.id} className="planet-card">
                    <strong>
                      {p.orbitIndex != null ? `◉${p.orbitIndex} ` : ""}
                      {p.name}
                    </strong>
                    <div className="hint">
                      {p.type}
                      {p.population > 0 ? ` · нас. ${p.population}` : ""}
                    </div>
                  </div>
                ))}
            </div>
          )}
          {selectedFleet && (
            <div className="planet-card">
              <strong>{selectedFleet.name}</strong>
              <div className="hint">
                {(selectedFleet.composition ?? [])
                  .map((c) => `${c.type}×${c.count}`)
                  .join(", ") || "—"}
              </div>
              <div className="hint">Стойка: {selectedFleet.stance}</div>
              <p className="hint">
                {mobile
                  ? "Тяните пальцем на систему (ходы на превью). Долгое нажатие — меню. Либо «Ход» в нижней панели."
                  : "Перетащите на систему — расход ходов. ПКМ — атака и прочее."}
              </p>
            </div>
          )}
          {selectedLegion && (
            <div className="planet-card">
              <strong>{selectedLegion.name}</strong>
              <div className="hint">
                Сила {selectedLegion.strength} · {selectedLegion.status}
              </div>
              <p className="hint">
                {mobile
                  ? "Тяните пальцем на систему. Долгое нажатие — меню."
                  : "Перетащите на систему — расход ходов. ПКМ — марш."}
              </p>
            </div>
          )}
          <div className="viewer-sheet-orders">
            <p className="hint">
              {mobile
                ? "Действия — долгое нажатие на карте. Здесь сводка."
                : "Действия с объектами — ПКМ на карте. Здесь только сводка."}
            </p>
            {(selectedFleetId || selectedLegionId) && selectedSystemId && (
              <button
                type="button"
                className="btn primary block"
                onClick={() => {
                  setTargetSystemId(selectedSystemId);
                  setOrderType(
                    selectedLegionId ? "move_legion" : "move_fleet",
                  );
                  setSheetOpen(false);
                  setQueueOpen(true);
                }}
              >
                К приказам…
              </button>
            )}
            {selectedSystem &&
              selectedSystem.ownerFactionId !== payload.factionId && (
                <button
                  type="button"
                  className="btn ghost block"
                  onClick={() => {
                    setTargetSystemId(selectedSystem.id);
                    setOrderType("claim_system");
                    setSheetOpen(false);
                    setQueueOpen(true);
                  }}
                >
                  Захватить (в приказы)…
                </button>
              )}
          </div>
        </div>
      </aside>
    </>
  );
}
