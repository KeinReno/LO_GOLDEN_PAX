import { createPortal } from "react-dom";
import { useWorldStore } from "../state/worldStore";
import { SystemView, type PlayerPlanetManageProps } from "./SystemView";
import { computePlanetRevoltReadout } from "../state/stabilityRevolt";

export type PlayerSystemActions = {
  factionId: string;
  onClaim: (systemId: string) => void;
  onAttack: (systemId: string) => void;
  onOpenRp: () => void;
  onSelectOwnFleet?: (fleetId: string) => void;
  onSelectOwnLegion?: (legionId: string) => void;
};

function ruHopsWord(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return "хопов";
  if (mod10 === 1) return "хоп";
  if (mod10 >= 2 && mod10 <= 4) return "хопа";
  return "хопов";
}

function formatSupplyLine(
  system: {
    logistics?: {
      connectedToCapital: boolean;
      hopsToCapital: number;
      viaDepot: boolean;
      supplyLevel: number;
      bottlenecked?: boolean;
      parentId?: string | null;
    };
  },
  parentName: string | null,
): { text: string; tone: "ok" | "warn" | "bad" | "muted" } {
  const L = system.logistics;
  if (!L) {
    return {
      text: "нет данных (после тика)",
      tone: "muted",
    };
  }
  if (!L.connectedToCapital) {
    return {
      text: "отрезана от столицы",
      tone: "bad",
    };
  }
  const hops = Number.isFinite(L.hopsToCapital) ? L.hopsToCapital : 0;
  const via = parentName
    ? `через ${parentName}`
    : L.viaDepot
      ? "через депо"
      : "прямая линия";
  const level = (L.supplyLevel ?? 0).toFixed(2);
  const hopWord = ruHopsWord(hops);
  const hopPart =
    hops === 0 ? "столица" : `${hops} ${hopWord} до столицы`;
  return {
    text: `${hopPart}, ${via} · уровень ${level}`,
    tone: L.bottlenecked ? "warn" : "ok",
  };
}

/** Full-screen system drill-down (double-click / ПКМ → открыть систему). */
export function SystemDossier({
  readOnly = false,
  playerActions,
  planetManage,
  onClose,
}: {
  readOnly?: boolean;
  playerActions?: PlayerSystemActions;
  planetManage?: PlayerPlanetManageProps;
  /** When set, overrides store close (e.g. player help overlay). */
  onClose?: () => void;
}) {
  const dossierSystemId = useWorldStore((s) => s.dossierSystemId);
  const gmShellMode = useWorldStore((s) => s.gmShellMode);
  const closeSystemView = useWorldStore((s) => s.closeSystemView);
  const close = onClose ?? closeSystemView;
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.dossierSystemId),
  );
  const parentName = useWorldStore((s) => {
    const id = s.world.systems.find((sys) => sys.id === s.dossierSystemId)
      ?.logistics?.parentId;
    if (!id) return null;
    return s.world.systems.find((sys) => sys.id === id)?.name ?? null;
  });

  const currentTurn = useWorldStore((s) => s.world.meta.turn ?? 0);

  if (gmShellMode !== "gm") return null;
  if (!dossierSystemId || !system) return null;

  const ownedByOther =
    !!system.ownerFactionId &&
    !!playerActions &&
    system.ownerFactionId !== playerActions.factionId;

  const supply = formatSupplyLine(system, parentName);
  const inhabited = (system.planets || []).filter((p) => (p.population ?? 0) > 0);
  const loyaltyAvg = inhabited.length
    ? Math.round(
        inhabited.reduce((s, p) => s + (p.loyalty ?? 50), 0) / inhabited.length,
      )
    : null;
  const loyaltyTone =
    loyaltyAvg == null
      ? "mid"
      : loyaltyAvg < 20
        ? "low"
        : loyaltyAvg < 40
          ? "warn"
          : loyaltyAvg < 60
            ? "mid"
            : "high";

  const systemRevoltSummaries = inhabited.map((p) => computePlanetRevoltReadout(p, currentTurn));
  const worstRevolt = systemRevoltSummaries.length
    ? systemRevoltSummaries.reduce((worst, cur) => (cur.stage > worst.stage || (cur.stage === worst.stage && cur.stability < worst.stability) ? cur : worst))
    : null;
  const stabilityAvg = inhabited.length
    ? Math.round(
        systemRevoltSummaries.reduce((s, r) => s + r.stability, 0) / inhabited.length,
      )
    : null;

  const node = (
    <div
      className="gm-system-layer"
      role="region"
      aria-label={system.name}
    >
      <header className="viewer-system-head gm-system-layer__head">
        <button
          type="button"
          className="btn viewer-system-back"
          onClick={() => close()}
        >
          К карте
          <span className="viewer-system-back-kbd">Esc</span>
        </button>
        <h2 className="viewer-system-title">{system.name}</h2>
        <p
          className={`dossier-supply dossier-supply-${supply.tone} gm-system-layer__supply`}
          title="Статус снабжения от столицы"
        >
          <span className="dossier-supply-label">Снабжение</span>
          {supply.text}
        </p>
        {loyaltyAvg != null ? (
          <p
            className={`hint loyalty-dossier-avg loyalty-ring-${loyaltyTone}`}
            title="Средняя лояльность населённых планет"
          >
            Лояльность · {loyaltyAvg}
          </p>
        ) : null}
        {worstRevolt != null ? (
          <p
            className={`hint loyalty-dossier-avg loyalty-ring-${worstRevolt.tone === "critical" || worstRevolt.tone === "bad" ? "low" : worstRevolt.tone === "warn" ? "warn" : "high"}`}
            title={`Стабильность: ср. ${stabilityAvg}, худшая стадия ${worstRevolt.stage} (${worstRevolt.stageName})`}
          >
            Стаб. · {stabilityAvg}/100 · ст. {worstRevolt.stage}
          </p>
        ) : null}
      </header>
      <div className="viewer-system-body gm-system-layer__body">
        <SystemView
          system={system}
          readOnly={readOnly}
          playerFactionId={playerActions?.factionId}
          onSelectOwnFleet={playerActions?.onSelectOwnFleet}
          onSelectOwnLegion={playerActions?.onSelectOwnLegion}
          planetManage={planetManage}
        />
      </div>
      {readOnly && playerActions && (
        <footer className="dossier-player-actions">
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              close();
              playerActions.onClaim(system.id);
            }}
          >
            Захват
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={!ownedByOther}
            title={
              ownedByOther ? "Атаковать систему" : "Нет чужого владельца"
            }
            onClick={() => {
              close();
              playerActions.onAttack(system.id);
            }}
          >
            Атака
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              close();
              playerActions.onOpenRp();
            }}
          >
            Сцена с ГМом
          </button>
        </footer>
      )}
    </div>
  );

  // Portal out of map stacking context so mobile dock / topbar stay under.
  if (typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}
