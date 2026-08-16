import { useState } from "react";
import { useCampaignSessionCtx } from "../CampaignSessionContext";
import { fetchContent } from "../../state/contentCatalog";
import { GmRulesKnobEditor } from "../gm/GmRulesKnobEditor";

type GamePreset = {
  id: string;
  label: string;
  description: string;
  icon: string;
  apPerTurn: number;
  forceApBase: number;
  forceApMax: number;
  alchemyAttempts: number;
  researchSpeedMult: number;
  revoltThreshold: number;
};

const PRESETS: GamePreset[] = [
  {
    id: "blitz",
    label: "Блиц / Быстрый темп",
    description: "Повышенное количество ОД, быстрые исследования и динамичные бои (для коротких сессий 2–3 часа).",
    icon: "⚡",
    apPerTurn: 4,
    forceApBase: 4,
    forceApMax: 8,
    alchemyAttempts: 4,
    researchSpeedMult: 1.5,
    revoltThreshold: 25,
  },
  {
    id: "standard",
    label: "Стандартный 4X / Кампания",
    description: "Взвешенный баланс стратегических решений, экономики, науки и космической экспансии.",
    icon: "⚖",
    apPerTurn: 3,
    forceApBase: 2,
    forceApMax: 6,
    alchemyAttempts: 2,
    researchSpeedMult: 1.0,
    revoltThreshold: 20,
  },
  {
    id: "hardcore",
    label: "Хардкор / Реализм",
    description: "Дефицит очков действий, жесткие условия снабжения, высокое трение восстаний и дорогостоящая война.",
    icon: "💀",
    apPerTurn: 2,
    forceApBase: 1,
    forceApMax: 4,
    alchemyAttempts: 1,
    researchSpeedMult: 0.8,
    revoltThreshold: 15,
  },
];

export function GameRulesStudio() {
  const { masterToken, setSyncMsg } = useCampaignSessionCtx();
  const [selectedPreset, setSelectedPreset] = useState<string>("standard");
  const [busy, setBusy] = useState(false);

  const applyPreset = async (p: GamePreset) => {
    setSelectedPreset(p.id);
    setBusy(true);
    try {
      const res = await fetch("/api/gm/content/rules-knobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Token": masterToken,
        },
        body: JSON.stringify({
          patch: {
            apPerTurn: p.apPerTurn,
            forceAp: { base: p.forceApBase, max: p.forceApMax },
            alchemy: { attemptsPerTurn: p.alchemyAttempts },
          },
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchContent(true);
      setSyncMsg(`✓ Применен пресет «${p.label}»`);
    } catch (e) {
      setSyncMsg(`Ошибка применения пресета: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="studio-layout studio-layout--full">
      <div className="studio-full-container">
        <header className="studio-workspace-header">
          <div className="studio-title-group">
            <span className="studio-hero-icon">⚙</span>
            <div>
              <h3 style={{ margin: 0 }}>Настройки и Баланс правил игры</h3>
              <p className="hint">
                Глобальные константы сессии, пресеты темпа партии, механики алхимии и лимиты ОД
              </p>
            </div>
          </div>
        </header>

        <div className="studio-scroll-body" style={{ padding: "16px 20px" }}>
          {/* Section 1: Presets */}
          <section className="studio-section-card">
            <h4>Шаблоны темпа кампании (Game Pace Presets)</h4>
            <div className="studio-grid-3" style={{ marginTop: 8 }}>
              {PRESETS.map((p) => {
                const isSelected = selectedPreset === p.id;
                return (
                  <div
                    key={p.id}
                    className={`studio-preset-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => void applyPreset(p)}
                  >
                    <div className="studio-preset-head">
                      <span className="studio-preset-icon">{p.icon}</span>
                      <strong>{p.label}</strong>
                    </div>
                    <p className="hint" style={{ fontSize: "0.82rem", margin: "6px 0 10px" }}>
                      {p.description}
                    </p>
                    <div className="studio-tags-row">
                      <span className="studio-badge is-accent">ОД/ход: {p.apPerTurn}</span>
                      <span className="studio-badge is-warn">Силищи: {p.forceApBase}..{p.forceApMax}</span>
                      <span className="studio-badge is-good">Алхимия: {p.alchemyAttempts}</span>
                    </div>
                    <button
                      type="button"
                      className={`btn tiny ${isSelected ? "primary" : "ghost"}`}
                      style={{ marginTop: 10, width: "100%" }}
                      disabled={busy}
                    >
                      {isSelected ? "Активен ✓" : "Активировать"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Section 2: Precise Knobs */}
          <section className="studio-section-card" style={{ marginTop: 16 }}>
            <h4>Точная подстройка регуляторов правил (rules.json)</h4>
            <GmRulesKnobEditor />
          </section>
        </div>
      </div>
    </div>
  );
}
