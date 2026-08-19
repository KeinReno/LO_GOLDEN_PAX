import { useState } from "react";
import { useWorldStore } from "../../state/worldStore";

type CombatantSide = {
  name: string;
  factionId: string;
  color: string;
  baseHp: number;
  maxBaseHp: number;
  energy: number;
  maxEnergy: number;
  hand: SimCard[];
  frontline: SimCard[];
  graveyard: SimCard[];
};

type SimCard = {
  id: string;
  name: string;
  tier: number;
  energyCost: number;
  damage: number;
  hp: number;
  maxHp: number;
  armor: number;
  shields: number;
  maxShields: number;
  roles: string[];
  keywords: string[];
  icon: string;
};

type CombatLogEntry = {
  round: number;
  side: string;
  action: string;
  details: string;
  tone?: "good" | "bad" | "warn" | "neutral" | "accent";
};

type BenchmarkResult = {
  runs: number;
  winsA: number;
  winsB: number;
  draws: number;
  avgRounds: number;
  avgLossA: number;
  avgLossB: number;
};

const THEATERS = [
  { id: "fleet", label: "🚀 Космический бой (Флот vs Флот)", icon: "🚀" },
  { id: "legion", label: "🛡 Наземная битва (Легион vs Легион)", icon: "🛡" },
  { id: "siege", label: "🪐 Планетарный штурм / Осада", icon: "🪐" },
];

const PRESETS: Record<string, { label: string; theater: string; cardsA: SimCard[]; cardsB: SimCard[] }> = {
  skirmish: {
    label: "Стычка патрулей (Тир 1)",
    theater: "fleet",
    cardsA: [
      { id: "a1", name: "Корвет «Стриж»", tier: 1, energyCost: 1, damage: 5, hp: 20, maxHp: 20, armor: 2, shields: 4, maxShields: 4, roles: ["screen"], keywords: ["escort"], icon: "🚀" },
      { id: "a2", name: "Фрегат «Гарпун»", tier: 1, energyCost: 2, damage: 8, hp: 30, maxHp: 30, armor: 4, shields: 6, maxShields: 6, roles: ["strike"], keywords: ["overwhelm"], icon: "🚀" },
      { id: "a3", name: "Катер РЭБ", tier: 1, energyCost: 1, damage: 3, hp: 16, maxHp: 16, armor: 1, shields: 8, maxShields: 8, roles: ["support"], keywords: ["support"], icon: "🛰" },
    ],
    cardsB: [
      { id: "b1", name: "Пиратский рейдер", tier: 1, energyCost: 1, damage: 6, hp: 22, maxHp: 22, armor: 1, shields: 2, maxShields: 2, roles: ["strike"], keywords: ["overwhelm"], icon: "🚀" },
      { id: "b2", name: "Ударный катер", tier: 1, energyCost: 1, damage: 7, hp: 18, maxHp: 18, armor: 2, shields: 2, maxShields: 2, roles: ["strike"], keywords: [], icon: "🚀" },
      { id: "b3", name: "Сторожевик", tier: 1, energyCost: 2, damage: 5, hp: 35, maxHp: 35, armor: 5, shields: 4, maxShields: 4, roles: ["screen"], keywords: ["escort", "brace"], icon: "🛡" },
    ],
  },
  line_battle: {
    label: "Линейный бой эскадр (Тир 2–3)",
    theater: "fleet",
    cardsA: [
      { id: "a1", name: "Эсминец «Варяг»", tier: 2, energyCost: 2, damage: 12, hp: 45, maxHp: 45, armor: 6, shields: 10, maxShields: 10, roles: ["line"], keywords: ["escort"], icon: "🚀" },
      { id: "a2", name: "Крейсер «Аврора»", tier: 3, energyCost: 3, damage: 22, hp: 75, maxHp: 75, armor: 10, shields: 18, maxShields: 18, roles: ["capital"], keywords: ["overwhelm", "siege"], icon: "⚔" },
      { id: "a3", name: "Фрегат поддержки", tier: 2, energyCost: 1, damage: 6, hp: 30, maxHp: 30, armor: 3, shields: 12, maxShields: 12, roles: ["support"], keywords: ["support"], icon: "✨" },
    ],
    cardsB: [
      { id: "b1", name: "Тяжелый крейсер «Титан»", tier: 3, energyCost: 3, damage: 24, hp: 70, maxHp: 70, armor: 12, shields: 15, maxShields: 15, roles: ["capital"], keywords: ["overwhelm"], icon: "⚔" },
      { id: "b2", name: "Эсминец прикрытия", tier: 2, energyCost: 2, damage: 10, hp: 50, maxHp: 50, armor: 8, shields: 12, maxShields: 12, roles: ["screen"], keywords: ["escort", "brace"], icon: "🛡" },
      { id: "b3", name: "Ракетный корвет", tier: 2, energyCost: 2, damage: 16, hp: 35, maxHp: 35, armor: 4, shields: 8, maxShields: 8, roles: ["strike"], keywords: ["overwhelm"], icon: "🚀" },
    ],
  },
  ground_assault: {
    label: "Штурм укрепрайона (Легионы)",
    theater: "legion",
    cardsA: [
      { id: "a1", name: "Штурмовой легион", tier: 2, energyCost: 2, damage: 14, hp: 60, maxHp: 60, armor: 8, shields: 0, maxShields: 0, roles: ["infantry"], keywords: ["overwhelm", "siege"], icon: "🛡" },
      { id: "a2", name: "Тяжелые мехи «Осада»", tier: 3, energyCost: 3, damage: 26, hp: 80, maxHp: 80, armor: 14, shields: 0, maxShields: 0, roles: ["armor"], keywords: ["siege"], icon: "🤖" },
      { id: "a3", name: "Батарея САУ", tier: 2, energyCost: 2, damage: 18, hp: 40, maxHp: 40, armor: 4, shields: 0, maxShields: 0, roles: ["artillery"], keywords: ["support"], icon: "💥" },
    ],
    cardsB: [
      { id: "b1", name: "Цитадельный гарнизон", tier: 2, energyCost: 2, damage: 10, hp: 70, maxHp: 70, armor: 12, shields: 0, maxShields: 0, roles: ["infantry"], keywords: ["escort", "brace"], icon: "🏰" },
      { id: "b2", name: "Бункерная турель", tier: 2, energyCost: 1, damage: 15, hp: 50, maxHp: 50, armor: 10, shields: 0, maxShields: 0, roles: ["support"], keywords: ["brace"], icon: "🛡" },
      { id: "b3", name: "Бронегруппа обороны", tier: 3, energyCost: 3, damage: 20, hp: 75, maxHp: 75, armor: 12, shields: 0, maxShields: 0, roles: ["armor"], keywords: ["overwhelm"], icon: "🤖" },
    ],
  },
};

export function BattleSimulator() {
  const world = useWorldStore((s) => s.world);
  const [theater, setTheater] = useState<string>("fleet");
  const [selectedPreset, setSelectedPreset] = useState<string>("skirmish");
  const [round, setRound] = useState(1);
  const [logs, setLogs] = useState<CombatLogEntry[]>([]);
  const [benchmark, setBenchmark] = useState<BenchmarkResult | null>(null);

  // Combatant Sides
  const [sideA, setSideA] = useState<CombatantSide>(() => {
    const p = PRESETS.skirmish;
    return {
      name: "Авангард Альянса (Сторона А)",
      factionId: world.factions[0]?.id || "side_a",
      color: world.factions[0]?.color || "#38bdf8",
      baseHp: 100,
      maxBaseHp: 100,
      energy: 4,
      maxEnergy: 4,
      hand: [],
      frontline: structuredClone(p.cardsA),
      graveyard: [],
    };
  });

  const [sideB, setSideB] = useState<CombatantSide>(() => {
    const p = PRESETS.skirmish;
    return {
      name: "Силикатская Армада (Сторона Б)",
      factionId: world.factions[1]?.id || "side_b",
      color: world.factions[1]?.color || "#ef4444",
      baseHp: 100,
      maxBaseHp: 100,
      energy: 4,
      maxEnergy: 4,
      hand: [],
      frontline: structuredClone(p.cardsB),
      graveyard: [],
    };
  });

  const applyPreset = (presetKey: string) => {
    setSelectedPreset(presetKey);
    const p = PRESETS[presetKey];
    if (!p) return;
    setTheater(p.theater);
    setRound(1);
    setLogs([]);
    setBenchmark(null);
    setSideA((prev) => ({
      ...prev,
      baseHp: 100,
      frontline: structuredClone(p.cardsA),
      hand: [],
      graveyard: [],
    }));
    setSideB((prev) => ({
      ...prev,
      baseHp: 100,
      frontline: structuredClone(p.cardsB),
      hand: [],
      graveyard: [],
    }));
  };

  const isGameOver = sideA.baseHp <= 0 || sideB.baseHp <= 0;
  const winner = sideA.baseHp <= 0 && sideB.baseHp <= 0 ? "draw" : sideA.baseHp <= 0 ? "B" : sideB.baseHp <= 0 ? "A" : null;

  // Execute 1 Step / Round of Combat
  const executeStep = () => {
    if (isGameOver) return;
    const curRound = round;
    const nextLogs: CombatLogEntry[] = [];

    // Clone sides
    const nextA = structuredClone(sideA);
    const nextB = structuredClone(sideB);

    // Calculate Support Auras
    const supportBonusA = nextA.frontline.some((c) => c.keywords.includes("support")) ? 1.15 : 1.0;
    const supportBonusB = nextB.frontline.some((c) => c.keywords.includes("support")) ? 1.15 : 1.0;

    // Side A Attacks Side B
    for (const cardA of nextA.frontline) {
      if (cardA.hp <= 0) continue;
      const dmg = Math.round(cardA.damage * supportBonusA);

      // Target selection: enemy frontline first, then base
      const targetB = nextB.frontline.find((c) => c.hp > 0);
      if (targetB) {
        // Armor reduction
        const effectiveDmg = Math.max(1, dmg - Math.floor(targetB.armor * 0.5));
        targetB.hp -= effectiveDmg;
        nextLogs.push({
          round: curRound,
          side: "A",
          action: `⚔ ${cardA.name} наносит ${effectiveDmg} урона по ${targetB.name}`,
          details: `Остаток HP цели: ${Math.max(0, targetB.hp)}/${targetB.maxHp}`,
          tone: "accent",
        });

        // Overwhelm effect: excess damage hits base
        if (cardA.keywords.includes("overwhelm") && targetB.hp < 0) {
          const overkill = Math.abs(targetB.hp);
          nextB.baseHp = Math.max(0, nextB.baseHp - overkill);
          nextLogs.push({
            round: curRound,
            side: "A",
            action: `💥 Прорыв (Overwhelm)! Избыток урона ${overkill} пробил базу`,
            details: `HP базы Стороны Б: ${nextB.baseHp}`,
            tone: "good",
          });
        }
      } else {
        // Direct Base Hit
        const baseDmg = cardA.keywords.includes("siege") ? Math.round(dmg * 1.5) : dmg;
        nextB.baseHp = Math.max(0, nextB.baseHp - baseDmg);
        nextLogs.push({
          round: curRound,
          side: "A",
          action: `🚀 ${cardA.name} атакует флагманскую базу Стороны Б на ${baseDmg} урона!`,
          details: `HP базы Стороны Б: ${nextB.baseHp}`,
          tone: "good",
        });
      }
    }

    // Side B Attacks Side A
    for (const cardB of nextB.frontline) {
      if (cardB.hp <= 0) continue;
      const dmg = Math.round(cardB.damage * supportBonusB);

      const targetA = nextA.frontline.find((c) => c.hp > 0);
      if (targetA) {
        const effectiveDmg = Math.max(1, dmg - Math.floor(targetA.armor * 0.5));
        targetA.hp -= effectiveDmg;
        nextLogs.push({
          round: curRound,
          side: "B",
          action: `⚔ ${cardB.name} наносит ${effectiveDmg} урона по ${targetA.name}`,
          details: `Остаток HP цели: ${Math.max(0, targetA.hp)}/${targetA.maxHp}`,
          tone: "warn",
        });

        if (cardB.keywords.includes("overwhelm") && targetA.hp < 0) {
          const overkill = Math.abs(targetA.hp);
          nextA.baseHp = Math.max(0, nextA.baseHp - overkill);
          nextLogs.push({
            round: curRound,
            side: "B",
            action: `💥 Прорыв (Overwhelm)! Избыток урона ${overkill} пробил базу Стороны А`,
            details: `HP базы Стороны А: ${nextA.baseHp}`,
            tone: "bad",
          });
        }
      } else {
        const baseDmg = cardB.keywords.includes("siege") ? Math.round(dmg * 1.5) : dmg;
        nextA.baseHp = Math.max(0, nextA.baseHp - baseDmg);
        nextLogs.push({
          round: curRound,
          side: "B",
          action: `🚀 ${cardB.name} атакует флагманскую базу Стороны А на ${baseDmg} урона!`,
          details: `HP базы Стороны А: ${nextA.baseHp}`,
          tone: "bad",
        });
      }
    }

    // Clean up destroyed cards
    nextA.frontline = nextA.frontline.filter((c) => c.hp > 0);
    nextB.frontline = nextB.frontline.filter((c) => c.hp > 0);

    setSideA(nextA);
    setSideB(nextB);
    setRound((r) => r + 1);
    setLogs((prev) => [...nextLogs, ...prev]);
  };

  // Run Monte Carlo 100 Battles Benchmark
  const runBenchmark = () => {
    let winsA = 0;
    let winsB = 0;
    let draws = 0;
    let totalRounds = 0;
    let totalLossA = 0;
    let totalLossB = 0;
    const runs = 100;

    const p = PRESETS[selectedPreset] || PRESETS.skirmish;

    for (let i = 0; i < runs; i++) {
      let bHpA = 100;
      let bHpB = 100;
      let fA = structuredClone(p.cardsA);
      let fB = structuredClone(p.cardsB);
      let r = 1;

      while (bHpA > 0 && bHpB > 0 && r <= 20) {
        // Attack A -> B
        for (const cA of fA) {
          if (cA.hp <= 0) continue;
          const target = fB.find((c) => c.hp > 0);
          if (target) {
            target.hp -= Math.max(1, cA.damage - Math.floor(target.armor * 0.5));
            if (cA.keywords.includes("overwhelm") && target.hp < 0) {
              bHpB -= Math.abs(target.hp);
            }
          } else {
            bHpB -= cA.damage;
          }
        }
        // Attack B -> A
        for (const cB of fB) {
          if (cB.hp <= 0) continue;
          const target = fA.find((c) => c.hp > 0);
          if (target) {
            target.hp -= Math.max(1, cB.damage - Math.floor(target.armor * 0.5));
            if (cB.keywords.includes("overwhelm") && target.hp < 0) {
              bHpA -= Math.abs(target.hp);
            }
          } else {
            bHpA -= cB.damage;
          }
        }
        fA = fA.filter((c) => c.hp > 0);
        fB = fB.filter((c) => c.hp > 0);
        r++;
      }

      totalRounds += r;
      totalLossA += 100 - Math.max(0, bHpA);
      totalLossB += 100 - Math.max(0, bHpB);

      if (bHpA > 0 && bHpB <= 0) winsA++;
      else if (bHpB > 0 && bHpA <= 0) winsB++;
      else draws++;
    }

    setBenchmark({
      runs,
      winsA,
      winsB,
      draws,
      avgRounds: Number((totalRounds / runs).toFixed(1)),
      avgLossA: Math.round(totalLossA / runs),
      avgLossB: Math.round(totalLossB / runs),
    });
  };

  return (
    <div className="studio-layout">
      {/* Sidebar: Theater & Presets */}
      <aside className="studio-sidebar">
        <div className="studio-sidebar-header">
          <div>
            <h3>Полигон</h3>
          </div>
        </div>

        {/* Theater Selector */}
        <div className="studio-section-card" style={{ margin: "6px 0" }}>
          <span className="studio-label">Театр боевых действий:</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {THEATERS.map((th) => (
              <button
                key={th.id}
                type="button"
                className={`btn tiny ${theater === th.id ? "primary" : "ghost"}`}
                onClick={() => setTheater(th.id)}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>

        {/* Presets */}
        <div className="studio-section-card">
          <span className="studio-label">Сценарии и сетапы:</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <button
                key={k}
                type="button"
                className={`btn tiny ${selectedPreset === k ? "accent" : "ghost"}`}
                onClick={() => applyPreset(k)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Reset / Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: "auto" }}>
          <button
            type="button"
            className="btn ghost block"
            onClick={() => applyPreset(selectedPreset)}
          >
            ↺ Сбросить бой
          </button>
          <button
            type="button"
            className="btn primary block"
            onClick={runBenchmark}
          >
            ⚡ Бенчмарк (100 боев)
          </button>
        </div>
      </aside>

      {/* Main Sandbox Stage */}
      <main className="studio-workspace">
        <div className="studio-detail-panel">
          <header className="studio-workspace-header">
            <div>
              <h3 style={{ margin: 0 }}>
                {PRESETS[selectedPreset]?.label || "Боевое столкновение"}
              </h3>
              <p className="hint">
                Раунд: <strong>{round}</strong> · Статус:{" "}
                {winner ? (
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>
                    Победа {winner === "A" ? sideA.name : winner === "B" ? sideB.name : "Ничья"}!
                  </span>
                ) : (
                  <span style={{ color: "var(--accent)" }}>В процессе боя</span>
                )}
              </p>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                disabled={isGameOver}
                onClick={executeStep}
              >
                ▶ Следующий шаг (Раунд {round})
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => applyPreset(selectedPreset)}
              >
                Сброс
              </button>
            </div>
          </header>

          {/* Benchmark Banner if calculated */}
          {benchmark && (
            <div
              className="cbt-intent"
              style={{
                margin: "12px 16px",
                padding: "10px 16px",
                background: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.35)",
                borderRadius: 8,
              }}
            >
              <strong>📊 Результаты Монте-Карло Бенчмарка (100 боев):</strong>
              <div style={{ display: "flex", gap: 20, marginTop: 6, fontSize: "0.88rem" }}>
                <span>
                  Побед Стороны А: <strong style={{ color: "#38bdf8" }}>{benchmark.winsA}%</strong>
                </span>
                <span>
                  Побед Стороны Б: <strong style={{ color: "#ef4444" }}>{benchmark.winsB}%</strong>
                </span>
                <span>
                  Ничьих: <strong>{benchmark.draws}%</strong>
                </span>
                <span>
                  Ср. раундов: <strong>{benchmark.avgRounds}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Duel Arena (Side A vs Side B) */}
          <div className="sim-arena-grid">
            {/* Side A Panel */}
            <div className="sim-side-card" style={{ borderColor: sideA.color }}>
              <div className="sim-side-header">
                <div>
                  <strong style={{ color: sideA.color }}>{sideA.name}</strong>
                  <div className="sim-hp-bar">
                    <div
                      className="sim-hp-fill"
                      style={{
                        width: `${Math.max(0, (sideA.baseHp / sideA.maxBaseHp) * 100)}%`,
                        background: sideA.color,
                      }}
                    />
                  </div>
                </div>
                <span className="sim-hp-num">
                  База: {sideA.baseHp}/{sideA.maxBaseHp} HP
                </span>
              </div>

              <div className="sim-frontline-cards">
                {sideA.frontline.map((c) => (
                  <div key={c.id} className="sim-unit-chip">
                    <div className="sim-unit-top">
                      <span>{c.icon}</span>
                      <strong>{c.name}</strong>
                    </div>
                    <div className="sim-unit-stats">
                      <span>⚔ {c.damage}</span>
                      <span>🛡 {c.armor}</span>
                      <span style={{ color: "#22c55e" }}>❤ {c.hp}/{c.maxHp}</span>
                    </div>
                    {c.keywords.length > 0 && (
                      <div className="sim-unit-kw">
                        {c.keywords.map((k) => (
                          <span key={k} className="cbt-keyword-badge">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {sideA.frontline.length === 0 && (
                  <p className="hint" style={{ padding: 12 }}>Фронт уничтожен!</p>
                )}
              </div>
            </div>

            {/* Side B Panel */}
            <div className="sim-side-card" style={{ borderColor: sideB.color }}>
              <div className="sim-side-header">
                <div>
                  <strong style={{ color: sideB.color }}>{sideB.name}</strong>
                  <div className="sim-hp-bar">
                    <div
                      className="sim-hp-fill"
                      style={{
                        width: `${Math.max(0, (sideB.baseHp / sideB.maxBaseHp) * 100)}%`,
                        background: sideB.color,
                      }}
                    />
                  </div>
                </div>
                <span className="sim-hp-num">
                  База: {sideB.baseHp}/{sideB.maxBaseHp} HP
                </span>
              </div>

              <div className="sim-frontline-cards">
                {sideB.frontline.map((c) => (
                  <div key={c.id} className="sim-unit-chip">
                    <div className="sim-unit-top">
                      <span>{c.icon}</span>
                      <strong>{c.name}</strong>
                    </div>
                    <div className="sim-unit-stats">
                      <span>⚔ {c.damage}</span>
                      <span>🛡 {c.armor}</span>
                      <span style={{ color: "#22c55e" }}>❤ {c.hp}/{c.maxHp}</span>
                    </div>
                    {c.keywords.length > 0 && (
                      <div className="sim-unit-kw">
                        {c.keywords.map((k) => (
                          <span key={k} className="cbt-keyword-badge">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {sideB.frontline.length === 0 && (
                  <p className="hint" style={{ padding: 12 }}>Фронт уничтожен!</p>
                )}
              </div>
            </div>
          </div>

          {/* Live Action Combat Log */}
          <section className="studio-section-card" style={{ margin: "12px 16px", flex: "1 1 auto" }}>
            <h4>Хроника боя & Лог столкновений</h4>
            <div className="sim-logs-container">
              {logs.map((l, i) => (
                <div key={i} className={`sim-log-row tone-${l.tone || "neutral"}`}>
                  <span className="sim-log-round">Р{l.round}</span>
                  <span className="sim-log-side">[{l.side === "A" ? sideA.name : sideB.name}]</span>
                  <span className="sim-log-action">{l.action}</span>
                  <span className="sim-log-details">{l.details}</span>
                </div>
              ))}
              {logs.length === 0 && (
                <p className="hint" style={{ padding: 8 }}>
                  Нажмите «Следующий шаг», чтобы начать симуляцию столкновения.
                </p>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
