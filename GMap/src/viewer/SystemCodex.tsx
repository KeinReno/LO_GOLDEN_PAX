import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  BookOpen,
  Orbit,
  Pickaxe,
  Building2,
  Globe2,
  Radar,
} from "lucide-react";
import { buildingZoneLabel } from "../state/displayLabels";
import { useWorldStore } from "../state/worldStore";
import { getCachedContent } from "../state/contentCatalog";
import { ResourceIcon } from "../ui/ResourceIcon";
import {
  buildSystemCodex,
  formatEffectHint,
} from "./systemCodexData";

type TabId = "objects" | "mining" | "stations" | "buildings" | "planets";

const TABS: { id: TabId; label: string; icon: typeof Radar }[] = [
  { id: "objects", label: "Объекты", icon: Radar },
  { id: "mining", label: "Пояс", icon: Pickaxe },
  { id: "stations", label: "Станции", icon: Orbit },
  { id: "buildings", label: "Постройки", icon: Building2 },
  { id: "planets", label: "Миры", icon: Globe2 },
];

type Props = {
  factionId: string;
  mapResourceNames?: Record<string, string>;
  onClose: () => void;
};

/**
 * System intel / codex — explanations, not a second SystemView.
 * Opened from player dive «Досье».
 */
export function SystemCodex({
  factionId,
  mapResourceNames,
  onClose,
}: Props) {
  const systemId = useWorldStore((s) => s.dossierSystemId);
  const system = useWorldStore((s) =>
    s.world.systems.find((sys) => sys.id === s.dossierSystemId),
  );
  const model = useMemo(() => {
    if (!system) return null;
    return buildSystemCodex(system, { factionId, mapResourceNames });
  }, [system, factionId, mapResourceNames]);

  const [tab, setTab] = useState<TabId>("objects");

  useEffect(() => {
    if (!model) return;
    setTab(
      model.objects.length > 0
        ? "objects"
        : model.mining.deposits.length > 0
          ? "mining"
          : "buildings",
    );
  }, [systemId]);

  const contentEffects = getCachedContent()?.space_objects?.objects;

  if (!systemId || !system || !model) return null;

  const active = tab;

  const node = (
    <div
      className="dossier-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Досье: ${system.name}`}
      onClick={onClose}
    >
      <div
        className="dossier-panel dossier-panel-wide sys-codex"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="dossier-head">
          <div>
            <p className="dossier-kicker">
              <BookOpen size={12} style={{ marginRight: 6 }} />
              Досье системы
            </p>
            <h2>{system.name}</h2>
            <p className="sys-codex__lead">
              Зачем объекты, как добывать пояс, какие постройки нужны — не дубль
              схемы.
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>
            Закрыть
            <kbd className="sys-codex__kbd">Esc</kbd>
          </button>
        </header>

        <nav className="sys-codex__tabs" aria-label="Разделы досье">
          {TABS.map((t) => {
            const Icon = t.icon;
            const count =
              t.id === "objects"
                ? model.objects.length
                : t.id === "mining"
                  ? model.mining.deposits.length
                  : t.id === "stations"
                    ? model.stations.length
                    : t.id === "buildings"
                      ? model.buildings.length
                      : model.planetTips.length;
            return (
              <button
                key={t.id}
                type="button"
                className={`sys-codex__tab${active === t.id ? " is-on" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={14} />
                {t.label}
                <span className="sys-codex__tab-n">{count}</span>
              </button>
            );
          })}
        </nav>

        <div className="dossier-body sys-codex__body">
          {active === "objects" && (
            <section className="sys-codex__section">
              {model.objects.length === 0 ? (
                <p className="hint">
                  В системе нет отмеченных аномалий или космических объектов.
                </p>
              ) : (
                <ul className="sys-codex__list">
                  {model.objects.map((o) => {
                    const effects = contentEffects?.[o.tag]?.effects ?? [];
                    return (
                      <li key={o.tag} className="sys-codex__card">
                        <header>
                          <strong>{o.name}</strong>
                          {o.kind && (
                            <span className="sys-codex__tag">{o.kind}</span>
                          )}
                        </header>
                        <p>{o.description}</p>
                        {o.actionTip && (
                          <p className="sys-codex__action">{o.actionTip}</p>
                        )}
                        {effects.length > 0 && (
                          <ul className="sys-codex__effects">
                            {effects.slice(0, 4).map((ef, i) => (
                              <li key={i}>
                                {formatEffectHint(
                                  ef.effect,
                                  (ef.args ?? {}) as Record<string, unknown>,
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {active === "mining" && (
            <section className="sys-codex__section">
              <div
                className={`sys-codex__status sys-codex__status--${model.mining.status}`}
              >
                {model.mining.statusLabel}
              </div>
              {model.mining.deposits.length > 0 ? (
                <div className="sys-codex__deposit-rail">
                  {model.mining.deposits.map((d) => (
                    <span key={d.id} className="sys-codex__deposit">
                      <ResourceIcon resourceId={d.id} size={16} />
                      {d.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="hint">В поясе нет картографированных депозитов.</p>
              )}
              <ol className="sys-codex__howto">
                {model.mining.howTo.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </section>
          )}

          {active === "stations" && (
            <section className="sys-codex__section">
              <p className="hint sys-codex__intro">
                Станции ставятся на поясе системы (владелец системы). Лимит — 8.
              </p>
              <ul className="sys-codex__list">
                {model.stations.map((s) => (
                  <li key={s.kind} className="sys-codex__card sys-codex__card--row">
                    <div>
                      <strong>{s.name}</strong>
                      <p>{s.why}</p>
                    </div>
                    <span className="sys-codex__cost">
                      {s.costLabel}
                      <em>{s.ap} AP</em>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {active === "buildings" && (
            <section className="sys-codex__section">
              <p className="hint sys-codex__intro">
                Релевантные постройки для этой системы: зачем, цена, ограничения.
              </p>
              {model.buildings.length === 0 ? (
                <p className="hint">Каталог построек ещё не загружен.</p>
              ) : (
                <ul className="sys-codex__list">
                  {model.buildings.map((b) => (
                    <li key={b.id} className="sys-codex__card">
                      <header>
                        <strong>{b.name}</strong>
                        <span className="sys-codex__tag">{buildingZoneLabel(b.zone)}</span>
                        <span className="sys-codex__cost">
                          {b.costLabel}
                          <em>{b.ap} AP</em>
                        </span>
                      </header>
                      <p>{b.why}</p>
                      {b.signature && (
                        <p className="sys-codex__sig">{b.signature}</p>
                      )}
                      {b.tradeoff && (
                        <p className="sys-codex__trade">⇄ {b.tradeoff}</p>
                      )}
                      {b.relevance && (
                        <p className="sys-codex__action">{b.relevance}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {active === "planets" && (
            <section className="sys-codex__section">
              {model.planetTips.length === 0 ? (
                <p className="hint">Нет особых заметок по мирам системы.</p>
              ) : (
                <ul className="sys-codex__list">
                  {model.planetTips.map((t) => (
                    <li
                      key={`${t.planetId}:${t.tip}`}
                      className={`sys-codex__card sys-codex__card--tip sys-codex__card--${t.tone}`}
                    >
                      <strong>{t.name}</strong>
                      <p>{t.tip}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
}
