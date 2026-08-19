import { useState } from "react";
import {
  COMBAT_STAT_LABELS,
  combatRoleLabel,
  pathLabel,
} from "../../state/displayLabels";
import {
  BUILD_METAL,
  BUILD_SUPPLY,
  CATEGORY_CURRENCIES,
} from "../../state/economyLabels";
import { VISUAL_EFFECT_IDS } from "./studioEffectIds";

export type EffectData = {
  effect: string;
  args?: Record<string, unknown>;
};

export interface EffectDef {
  id: string;
  label: string;
  icon: string;
  group: "production" | "population" | "science" | "military" | "economy" | "custom";
  hint: string;
  defaultArgs: Record<string, unknown>;
}

export const KNOWN_EFFECTS: EffectDef[] = [
  // Производство & Потоки
  {
    id: "production_mult",
    label: "Множитель производства (+% к ресурсу)",
    icon: "📈",
    group: "production",
    hint: "Увеличивает или уменьшает добычу/производство конкретного ресурса",
    defaultArgs: { resource: "currency.extracta", mult: 1.05 },
  },
  {
    id: "flow_convert",
    label: "Конверсия потоков RPS (Трансформация)",
    icon: "🔄",
    group: "production",
    hint: "Преобразует входной поток категории/тира в выходной поток",
    defaultArgs: {
      from: { category: "D", tier: ">=1" },
      to: { category: "E", tier: ">=1" },
      rate: 1.0,
    },
  },
  {
    id: "capacity_add",
    label: "Пропускная способность (Ёмкость трубы)",
    icon: "🚰",
    group: "production",
    hint: "Поднимает максимальную пропускную способность для категории и тира",
    defaultArgs: { category: "A", tier: 1, amount: 1 },
  },
  {
    id: "production_flat",
    label: "Прямой выход ресурсов (Фикс. доход)",
    icon: "📦",
    group: "production",
    hint: "Дает фиксированное количество ресурса каждый ход",
    defaultArgs: { resource: "currency.metal", amount: 2 },
  },
  {
    id: "yield_flat",
    label: "Базовая системная добыча станции",
    icon: "⛏",
    group: "production",
    hint: "Добыча сырья в секторе размещения станции",
    defaultArgs: { currency: "currency.extracta", amount: 2 },
  },
  {
    id: "rate_mod",
    label: "Скорость добычи сектора",
    icon: "⚡",
    group: "production",
    hint: "Модификатор скорости потока сырья из астероидов/полей",
    defaultArgs: { category: "A", tier: 2, amount: 1 },
  },

  // Население & Стабильность
  {
    id: "pop_cap_add",
    label: "Вместимость населения (+лимит жителей)",
    icon: "👥",
    group: "population",
    hint: "Увеличивает максимальное население планеты",
    defaultArgs: { amount: 15 },
  },
  {
    id: "pop_growth_mult",
    label: "Прирост населения (% к росту)",
    icon: "🌱",
    group: "population",
    hint: "Множитель естественного демографического прироста",
    defaultArgs: { mult: 1.05 },
  },
  {
    id: "loyalty_add",
    label: "Лояльность населения (Фикс. бонус)",
    icon: "🏰",
    group: "population",
    hint: "Постоянная прибавка к уровню лояльности жителей",
    defaultArgs: { amount: 1 },
  },
  {
    id: "stability_add",
    label: "Стабильность сектора (Защита от бунта)",
    icon: "⚖",
    group: "population",
    hint: "Снижает риск восстаний и укрепляет порядок",
    defaultArgs: { amount: 2 },
  },
  {
    id: "habitability_mult",
    label: "Пригодность биомов к заселению",
    icon: "🪐",
    group: "population",
    hint: "Снижает штрафы неблагоприятных планет",
    defaultArgs: { mult: 1.1 },
  },

  // Наука & Прогресс
  {
    id: "research_cost_mult",
    label: "Скидка на исследования (Стоимость науки)",
    icon: "🔬",
    group: "science",
    hint: "Снижает затраты Cognitio на изучение наук",
    defaultArgs: { category: "A", mult: 0.95 },
  },
  {
    id: "unlock_tech_tier",
    label: "Разблокировка тира науки (I–V)",
    icon: "🔓",
    group: "science",
    hint: "Открывает доступ к технологиям следующего технологического уровня",
    defaultArgs: { category: "A", to: 2 },
  },
  {
    id: "unlock_property",
    label: "Разблокировка свойства ресурсов",
    icon: "🧩",
    group: "science",
    hint: "Позволяет использовать свойство в слотах проектов",
    defaultArgs: { property: "strong" },
  },
  {
    id: "open_path",
    label: "Прорыв Пути Могущества",
    icon: "🌌",
    group: "science",
    hint: "Фиксирует прорыв одного из 8 путей развития державы",
    defaultArgs: { pathId: "offensive" },
  },

  // Военное дело
  {
    id: "combat_role_mult",
    label: "Боевой бонус против роли врага",
    icon: "⚔",
    group: "military",
    hint: "Множитель боевой эффективности против врагов указанной роли",
    defaultArgs: { role: "screen", mult: 1.15 },
  },
  {
    id: "stat_mult",
    label: "Множитель боевых параметров (урон / броня)",
    icon: "🛡",
    group: "military",
    hint: "Процентный модификатор характеристик боевых единиц",
    defaultArgs: { stat: "damage", mult: 1.1 },
  },
  {
    id: "cost_mult",
    label: "Множитель стоимости строек",
    icon: "🏗",
    group: "economy",
    hint: "Делает постройки дешевле или дороже",
    defaultArgs: { mult: 0.9 },
  },

  // Экономика & Дипломатия
  {
    id: "upkeep_mult",
    label: "Множитель содержания (Скидка/Наценка)",
    icon: "💰",
    group: "economy",
    hint: "Уменьшает или увеличивает постоянные расходы",
    defaultArgs: { mult: 0.95 },
  },
  {
    id: "upkeep_flat",
    label: "Фиксированное содержание сырья",
    icon: "📉",
    group: "economy",
    hint: "Требует определенное количество ресурса в ход",
    defaultArgs: { resource: "currency.supply", amount: 1 },
  },
  {
    id: "ap_add",
    label: "Бонус Очков Действий (ОД)",
    icon: "⚡",
    group: "economy",
    hint: "Увеличивает базовый запас приказов за ход",
    defaultArgs: { amount: 1 },
  },
  {
    id: "diplomacy_trust_decay_mult",
    label: "Спад доверия в дипломатии",
    icon: "🤝",
    group: "economy",
    hint: "Замедляет ухудшение отношений с другими цивилизациями",
    defaultArgs: { mult: 0.9 },
  },

  // Пользовательский
  {
    id: "custom",
    label: "Пользовательский / Экзотический эффект",
    icon: "⚙",
    group: "custom",
    hint: "Ручной ввод идентификатора и произвольных параметров",
    defaultArgs: {},
  },
];

export const RESOURCE_OPTIONS = [
  { id: BUILD_METAL.id, label: BUILD_METAL.label },
  { id: BUILD_SUPPLY.id, label: BUILD_SUPPLY.label },
  ...CATEGORY_CURRENCIES.map((c) => ({
    id: c.id,
    label: `${c.name} · ${c.letter}`,
  })),
  { id: "all", label: "Все ресурсы" },
];

export const CATEGORY_OPTIONS = CATEGORY_CURRENCIES.map((c) => ({
  id: c.letter,
  label: `${c.letter} · ${c.name}`,
}));

export const ROLE_OPTIONS = [
  "screen",
  "capital",
  "carrier",
  "infantry",
  "armor",
  "siege",
  "titan",
].map((id) => ({ id, label: combatRoleLabel(id) }));

export const PROPERTY_OPTIONS = [
  { id: "strong", label: "Крепкий — повышенная прочность" },
  { id: "agile", label: "Ловкий — манёвр и скорость" },
  { id: "psionic", label: "Псионический — ментальные ауры" },
  { id: "bio", label: "Биологический — регенерация" },
  { id: "quantum", label: "Квантовый — фазовые щиты" },
  { id: "relic", label: "Реликт — древние технологии" },
  { id: "dense", label: "Плотный — защита от пробития" },
];

export const PATH_OPTIONS = [
  "offensive",
  "defensive",
  "mobility",
  "cognitive",
  "biological",
  "exotic",
  "structural",
  "energy",
].map((id) => ({ id, label: pathLabel(id) }));

export { VISUAL_EFFECT_IDS } from "./studioEffectIds";

export const STAT_OPTIONS = Object.entries(COMBAT_STAT_LABELS).map(
  ([id, label]) => ({ id, label }),
);

interface Props {
  effects: EffectData[];
  onChange: (effects: EffectData[]) => void;
  title?: string;
  context?: "building" | "tech" | "race" | "general";
}

export function StudioEffectList({
  effects,
  onChange,
  title = "Эффекты & Модификаторы",
}: Props) {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [expertMode, setExpertMode] = useState(false);

  const handleAddEffect = (def: EffectDef) => {
    const newEntry: EffectData = {
      effect: def.id === "custom" ? "custom_effect" : def.id,
      args: { ...def.defaultArgs },
    };
    onChange([...effects, newEntry]);
    setShowAddMenu(false);
  };

  const handleUpdate = (index: number, updated: EffectData) => {
    const copy = [...effects];
    copy[index] = updated;
    onChange(copy);
  };

  const handleRemove = (index: number) => {
    onChange(effects.filter((_, i) => i !== index));
  };

  return (
    <div className="studio-effect-list-shell">
      <div className="studio-effect-head-bar">
        <div className="studio-effect-title-wrap">
          <h4 style={{ margin: 0 }}>{title}</h4>
          <span className="studio-effect-count-badge">
            {effects.length} {effects.length === 1 ? "эффект" : effects.length < 5 ? "эффекта" : "эффектов"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className={`btn tiny ${expertMode ? "accent" : "ghost"}`}
            onClick={() => setExpertMode(!expertMode)}
            title="Переключить экспертный режим JSON для тонкой настройки"
          >
            {expertMode ? "Сырые параметры" : "Поля"}
          </button>
          <button
            type="button"
            className="btn tiny primary"
            onClick={() => setShowAddMenu(!showAddMenu)}
          >
            + Добавить эффект
          </button>
        </div>
      </div>

      {/* Popover / Drawer for adding effects */}
      {showAddMenu && (
        <div className="studio-effect-picker-card">
          <div className="studio-effect-picker-head">
            <strong>Выберите тип эффекта для добавления</strong>
            <button
              type="button"
              className="btn tiny ghost"
              onClick={() => setShowAddMenu(false)}
            >
              ✕
            </button>
          </div>
          <div className="studio-effect-picker-grid">
            {KNOWN_EFFECTS.map((def) => (
              <button
                key={def.id}
                type="button"
                className="studio-effect-picker-btn"
                onClick={() => handleAddEffect(def)}
              >
                <span className="studio-effect-picker-icon">{def.icon}</span>
                <div className="studio-effect-picker-text">
                  <span className="studio-effect-picker-title">{def.label}</span>
                  <span className="studio-effect-picker-hint">{def.hint}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* List of active effects */}
      <div className="studio-effect-rows-wrap">
        {effects.map((eff, idx) => (
          <StudioEffectRow
            key={idx}
            effect={eff}
            expert={expertMode}
            onChange={(updated) => handleUpdate(idx, updated)}
            onRemove={() => handleRemove(idx)}
          />
        ))}

        {effects.length === 0 && !showAddMenu && (
          <div className="studio-effect-empty-hint">
            <span>✨</span>
            <p>Нет назначенных эффектов. Нажмите «+ Добавить эффект», чтобы выбрать из списка.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StudioEffectRow({
  effect,
  expert,
  onChange,
  onRemove,
}: {
  effect: EffectData;
  expert: boolean;
  onChange: (updated: EffectData) => void;
  onRemove: () => void;
}) {
  const def = KNOWN_EFFECTS.find((k) => k.id === effect.effect) || {
    id: effect.effect,
    label: effect.effect,
    icon: "⚡",
    group: "custom" as const,
    hint: "Пользовательский эффект",
    defaultArgs: {},
  };

  const args = effect.args || {};

  const setArg = (key: string, val: unknown) => {
    onChange({
      ...effect,
      args: { ...args, [key]: val },
    });
  };

  const handleTypeChange = (newTypeId: string) => {
    const targetDef = KNOWN_EFFECTS.find((k) => k.id === newTypeId);
    if (targetDef) {
      onChange({
        effect: newTypeId === "custom" ? "custom_effect" : newTypeId,
        args: { ...targetDef.defaultArgs },
      });
    } else {
      onChange({
        effect: newTypeId,
        args: {},
      });
    }
  };

  return (
    <div className="studio-effect-card">
      <div className="studio-effect-card-header">
        <div className="studio-effect-type-selector">
          <span className="studio-effect-main-icon">{def.icon}</span>
          <select
            className="studio-select studio-select--effect"
            value={KNOWN_EFFECTS.some((k) => k.id === effect.effect) ? effect.effect : "custom"}
            onChange={(e) => handleTypeChange(e.target.value)}
          >
            <optgroup label="Производство & Потоки">
              {KNOWN_EFFECTS.filter((k) => k.group === "production").map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Население & Стабильность">
              {KNOWN_EFFECTS.filter((k) => k.group === "population").map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Наука & Развитие">
              {KNOWN_EFFECTS.filter((k) => k.group === "science").map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Военное дело">
              {KNOWN_EFFECTS.filter((k) => k.group === "military").map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Экономика & Дипломатия">
              {KNOWN_EFFECTS.filter((k) => k.group === "economy").map((k) => (
                <option key={k.id} value={k.id}>
                  {k.icon} {k.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Прочее">
              <option value="custom">⚙ Пользовательский (ручной ввод)</option>
            </optgroup>
          </select>
        </div>

        <button
          type="button"
          className="btn tiny danger ghost studio-effect-delete-btn"
          onClick={onRemove}
          title="Удалить этот эффект"
        >
          ✕
        </button>
      </div>

      {/* Customized Visual Param Fields */}
      {!expert ? (
        <div className="studio-effect-params-body">
          {/* 1. Production / Upkeep Mult */}
          {(effect.effect === "production_mult" || effect.effect === "upkeep_mult") && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Ресурс / Тип:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.resource || args.category || "currency.extracta")}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("currency.")) {
                      setArg("resource", v);
                    } else if (v === "all") {
                      setArg("resource", undefined);
                      setArg("category", undefined);
                    } else {
                      setArg("category", v);
                    }
                  }}
                >
                  {RESOURCE_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Множитель (1.05 = +5%, 0.95 = −5%):</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="studio-input studio-input--num"
                    value={Number(args.mult ?? 1.05)}
                    onChange={(e) => setArg("mult", parseFloat(e.target.value) || 1.0)}
                  />
                  <span className="studio-mult-preview">
                    {Number(args.mult ?? 1.05) >= 1
                      ? `+${Math.round(((Number(args.mult ?? 1.05) - 1) * 100))}%`
                      : `−${Math.round(((1 - Number(args.mult ?? 1.05)) * 100))}%`}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* 2. Flow Convert */}
          {effect.effect === "flow_convert" && (
            <div className="studio-effect-flow-box">
              <div className="studio-flow-lane">
                <span className="studio-flow-lane-tag">ВХОД</span>
                <label className="studio-ctrl-field">
                  <span className="studio-ctrl-label">Категория:</span>
                  <select
                    className="studio-select studio-select--sm"
                    value={String((args.from as { category?: string })?.category || "D")}
                    onChange={(e) => {
                      const prevFrom = (args.from as Record<string, unknown>) || {};
                      setArg("from", { ...prevFrom, category: e.target.value });
                    }}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="studio-ctrl-field">
                  <span className="studio-ctrl-label">Мин. Тир:</span>
                  <select
                    className="studio-select studio-select--sm"
                    value={String((args.from as { tier?: string })?.tier || ">=1")}
                    onChange={(e) => {
                      const prevFrom = (args.from as Record<string, unknown>) || {};
                      setArg("from", { ...prevFrom, tier: e.target.value });
                    }}
                  >
                    <option value=">=1">Тир ≥1</option>
                    <option value=">=2">Тир ≥2</option>
                    <option value=">=3">Тир ≥3</option>
                    <option value=">=4">Тир ≥4</option>
                    <option value=">=5">Тир ≥5</option>
                  </select>
                </label>
              </div>

              <span className="studio-flow-arrow">➔</span>

              <div className="studio-flow-lane">
                <span className="studio-flow-lane-tag studio-flow-lane-tag--out">ВЫХОД</span>
                <label className="studio-ctrl-field">
                  <span className="studio-ctrl-label">Категория:</span>
                  <select
                    className="studio-select studio-select--sm"
                    value={String((args.to as { category?: string })?.category || "E")}
                    onChange={(e) => {
                      const prevTo = (args.to as Record<string, unknown>) || {};
                      setArg("to", { ...prevTo, category: e.target.value });
                    }}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="studio-ctrl-field">
                  <span className="studio-ctrl-label">Тир выхода:</span>
                  <select
                    className="studio-select studio-select--sm"
                    value={String((args.to as { tier?: string })?.tier || ">=1")}
                    onChange={(e) => {
                      const prevTo = (args.to as Record<string, unknown>) || {};
                      setArg("to", { ...prevTo, tier: e.target.value });
                    }}
                  >
                    <option value=">=1">Тир ≥1</option>
                    <option value=">=2">Тир ≥2</option>
                    <option value=">=3">Тир ≥3</option>
                    <option value=">=4">Тир ≥4</option>
                    <option value=">=5">Тир ≥5</option>
                  </select>
                </label>
              </div>

              <label className="studio-ctrl-field" style={{ minWidth: 80 }}>
                <span className="studio-ctrl-label">Коэффициент:</span>
                <input
                  type="number"
                  step="0.1"
                  className="studio-input studio-input--num"
                  value={Number(args.rate ?? 1.0)}
                  onChange={(e) => setArg("rate", parseFloat(e.target.value) || 1.0)}
                />
              </label>
            </div>
          )}

          {/* 3. Capacity Add / Rate Mod / Demand Mod */}
          {(effect.effect === "capacity_add" ||
            effect.effect === "rate_mod" ||
            effect.effect === "demand_mod") && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Категория:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.category || "A")}
                  onChange={(e) => setArg("category", e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Тир:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={Number(args.tier ?? 1)}
                  onChange={(e) => setArg("tier", parseInt(e.target.value, 10) || 1)}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((t) => (
                    <option key={t} value={t}>
                      Тир {t}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Величина (+лимит):</span>
                <input
                  type="number"
                  className="studio-input studio-input--num"
                  value={Number(args.amount ?? 1)}
                  onChange={(e) => setArg("amount", parseInt(e.target.value, 10) || 1)}
                />
              </label>
            </div>
          )}

          {/* 4. Pop Cap / Loyalty / Stability / AP / Growth */}
          {(effect.effect === "pop_cap_add" ||
            effect.effect === "pop_cap_flat" ||
            effect.effect === "loyalty_add" ||
            effect.effect === "stability_add" ||
            effect.effect === "ap_add") && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Значение (+бонус):</span>
                <input
                  type="number"
                  className="studio-input studio-input--num"
                  value={Number(args.amount ?? 1)}
                  onChange={(e) => setArg("amount", parseInt(e.target.value, 10) || 0)}
                />
              </label>
            </div>
          )}

          {/* 5. Pop Growth Mult / Habitability Mult / Diplo Decay */}
          {(effect.effect === "pop_growth_mult" ||
            effect.effect === "habitability_mult" ||
            effect.effect === "diplomacy_trust_decay_mult") && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Множитель (например 1.05 или 0.90):</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="studio-input studio-input--num"
                    value={Number(args.mult ?? 1.05)}
                    onChange={(e) => setArg("mult", parseFloat(e.target.value) || 1.0)}
                  />
                  <span className="studio-mult-preview">
                    {Number(args.mult ?? 1.05) >= 1
                      ? `+${Math.round(((Number(args.mult ?? 1.05) - 1) * 100))}%`
                      : `−${Math.round(((1 - Number(args.mult ?? 1.05)) * 100))}%`}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* 6. Research Cost Mult */}
          {effect.effect === "research_cost_mult" && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Категория наук:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.category || "all")}
                  onChange={(e) => setArg("category", e.target.value === "all" ? undefined : e.target.value)}
                >
                  <option value="all">Все категории (Общая скидка)</option>
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Множитель стоимости (0.95 = −5%):</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="studio-input studio-input--num"
                    value={Number(args.mult ?? 0.95)}
                    onChange={(e) => setArg("mult", parseFloat(e.target.value) || 1.0)}
                  />
                  <span className="studio-mult-preview">
                    {Number(args.mult ?? 0.95) <= 1
                      ? `−${Math.round(((1 - Number(args.mult ?? 0.95)) * 100))}%`
                      : `+${Math.round(((Number(args.mult ?? 0.95) - 1) * 100))}%`}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* 7. Combat Role Mult */}
          {effect.effect === "combat_role_mult" && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Целевая роль врага:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.role || "screen")}
                  onChange={(e) => setArg("role", e.target.value)}
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Бонусный урон (1.15 = +15%):</span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="studio-input studio-input--num"
                    value={Number(args.mult ?? 1.15)}
                    onChange={(e) => setArg("mult", parseFloat(e.target.value) || 1.0)}
                  />
                  <span className="studio-mult-preview">
                    +{Math.round(((Number(args.mult ?? 1.15) - 1) * 100))}%
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* 8. Unlock Tech Tier */}
          {effect.effect === "unlock_tech_tier" && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Категория науки:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.category || "A")}
                  onChange={(e) => setArg("category", e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Разблокировать до Тира:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={Number(args.to ?? 2)}
                  onChange={(e) => setArg("to", parseInt(e.target.value, 10) || 2)}
                >
                  {[1, 2, 3, 4, 5].map((t) => (
                    <option key={t} value={t}>
                      Тир {t}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 9. Unlock Property */}
          {effect.effect === "unlock_property" && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Открываемое свойство сырья:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.property || "strong")}
                  onChange={(e) => setArg("property", e.target.value)}
                >
                  {PROPERTY_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 10. Open Path */}
          {effect.effect === "open_path" && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Открываемый Путь Могущества:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.pathId || "offensive")}
                  onChange={(e) => setArg("pathId", e.target.value)}
                >
                  {PATH_OPTIONS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* 11. Production Flat / Yield Flat / Upkeep Flat */}
          {(effect.effect === "production_flat" ||
            effect.effect === "yield_flat" ||
            effect.effect === "upkeep_flat") && (
            <div className="studio-effect-fields-flex">
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Ресурс / Валюта:</span>
                <select
                  className="studio-select studio-select--sm"
                  value={String(args.resource || args.currency || "currency.metal")}
                  onChange={(e) => {
                    if (effect.effect === "yield_flat") {
                      setArg("currency", e.target.value);
                    } else {
                      setArg("resource", e.target.value);
                    }
                  }}
                >
                  {RESOURCE_OPTIONS.filter((r) => r.id !== "all").map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">Количество в ход:</span>
                <input
                  type="number"
                  className="studio-input studio-input--num"
                  value={Number(args.amount ?? 1)}
                  onChange={(e) => setArg("amount", parseInt(e.target.value, 10) || 0)}
                />
              </label>
            </div>
          )}

          {(effect.effect === "stat_mult" || effect.effect === "cost_mult") && (
            <div className="studio-effect-fields-flex">
              {effect.effect === "stat_mult" && (
                <label className="studio-ctrl-field">
                  <span className="studio-ctrl-label">Параметр:</span>
                  <select
                    className="studio-select studio-select--sm"
                    value={String(args.stat || "damage")}
                    onChange={(e) => setArg("stat", e.target.value)}
                  >
                    {STAT_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="studio-ctrl-field">
                <span className="studio-ctrl-label">
                  {effect.effect === "cost_mult"
                    ? "Множитель стоимости (0.90 = −10%):"
                    : "Множитель (1.15 = +15%):"}
                </span>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    type="number"
                    step="0.01"
                    className="studio-input studio-input--num"
                    value={Number(args.mult ?? 1.1)}
                    onChange={(e) => setArg("mult", parseFloat(e.target.value) || 1.0)}
                  />
                  <span className="studio-mult-preview">
                    {Number(args.mult ?? 1.1) >= 1
                      ? `+${Math.round((Number(args.mult ?? 1.1) - 1) * 100)}%`
                      : `−${Math.round((1 - Number(args.mult ?? 1.1)) * 100)}%`}
                  </span>
                </div>
              </label>
            </div>
          )}

          {/* Fallback for unhandled known types or custom */}
          {!(VISUAL_EFFECT_IDS as readonly string[]).includes(effect.effect) && (
            <div className="studio-effect-custom-box">
              <label className="studio-ctrl-field" style={{ flex: "1 1 100%" }}>
                <span className="studio-ctrl-label">Тип эффекта:</span>
                <select
                  className="studio-select"
                  value={
                    KNOWN_EFFECTS.some((k) => k.id === effect.effect)
                      ? effect.effect
                      : "custom"
                  }
                  onChange={(e) => handleTypeChange(e.target.value)}
                >
                  {KNOWN_EFFECTS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              {Object.keys(args).length > 0 && (
                <div className="studio-effect-fields-flex">
                  {Object.entries(args).map(([key, val]) => (
                    <label key={key} className="studio-ctrl-field">
                      <span className="studio-ctrl-label">
                        {key === "stat"
                          ? "Параметр"
                          : key === "mult"
                            ? "Множитель"
                            : key === "amount"
                              ? "Величина"
                              : key === "resource" || key === "currency"
                                ? "Ресурс"
                                : key === "category"
                                  ? "Категория"
                                  : key === "role"
                                    ? "Роль"
                                    : key === "pathId"
                                      ? "Путь"
                                      : "Значение"}
                      </span>
                      {key === "stat" ? (
                        <select
                          className="studio-select studio-select--sm"
                          value={String(val ?? "damage")}
                          onChange={(e) => setArg(key, e.target.value)}
                        >
                          {STAT_OPTIONS.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      ) : key === "resource" || key === "currency" ? (
                        <select
                          className="studio-select studio-select--sm"
                          value={String(val ?? "currency.metal")}
                          onChange={(e) => setArg(key, e.target.value)}
                        >
                          {RESOURCE_OPTIONS.filter((r) => r.id !== "all").map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : typeof val === "number" ? (
                        <input
                          type="number"
                          step="0.01"
                          className="studio-input studio-input--num"
                          value={Number(val)}
                          onChange={(e) =>
                            setArg(key, parseFloat(e.target.value) || 0)
                          }
                        />
                      ) : (
                        <input
                          type="text"
                          className="studio-input"
                          value={String(val ?? "")}
                          onChange={(e) => setArg(key, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Expert Raw JSON Mode */
        <div className="studio-effect-raw-expert">
          <textarea
            className="studio-textarea studio-textarea--mono"
            rows={2}
            value={JSON.stringify(args, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onChange({ ...effect, args: parsed });
              } catch {
                /* allow typing */
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
