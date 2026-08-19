import type { QuestChoice } from "../../../state/types";
import { GmEffectBuilder } from "./GmEffectBuilder";
import { emptyChoice } from "./questCatalogShared";

type Props = {
  choices: QuestChoice[];
  onChange: (choices: QuestChoice[]) => void;
};

function patchChoice(
  choices: QuestChoice[],
  index: number,
  patch: Partial<QuestChoice>,
): QuestChoice[] {
  return choices.map((c, i) => (i === index ? { ...c, ...patch } : c));
}

/** Visual editor for quest choices + dice branches. */
export function GmQuestChoiceEditor({ choices, onChange }: Props) {
  const add = () => onChange([...choices, emptyChoice(choices.length)]);

  const remove = (index: number) => {
    if (choices.length <= 1) return;
    onChange(choices.filter((_, i) => i !== index));
  };

  const toggleDice = (index: number, on: boolean) => {
    const c = choices[index];
    if (on) {
      onChange(
        patchChoice(choices, index, {
          diceRequired: [
            {
              count: 1,
              sides: 20,
              label: "d20 проверка",
              threshold: 12,
            },
          ],
          onSuccess: c.onSuccess || [],
          onFail: c.onFail || [],
          effects: undefined,
        }),
      );
    } else {
      onChange(
        patchChoice(choices, index, {
          diceRequired: undefined,
          onSuccess: undefined,
          onFail: undefined,
          effects: c.effects || [],
        }),
      );
    }
  };

  return (
    <div className="gm-quest-choices">
      <div className="gm-form-section-head">
        <p className="gm-form-section-label">Выборы игрока</p>
        <button type="button" className="btn ghost" onClick={add}>
          + Выбор
        </button>
      </div>

      {choices.map((choice, i) => {
        const hasDice = Boolean(choice.diceRequired?.length);
        return (
          <article key={choice.id || i} className="gm-quest-choice-card">
            <header className="gm-quest-choice-head">
              <strong>{choice.label || `Выбор ${i + 1}`}</strong>
              <button
                type="button"
                className="btn ghost"
                disabled={choices.length <= 1}
                onClick={() => remove(i)}
              >
                Удалить
              </button>
            </header>
            <label className="gm-form-field">
              <span>Кнопка</span>
              <input
                type="text"
                className="gm-form-input"
                value={choice.label}
                onChange={(e) =>
                  onChange(patchChoice(choices, i, { label: e.target.value }))
                }
              />
            </label>
            <label className="gm-form-field">
              <span>Описание</span>
              <textarea
                className="gm-form-input"
                rows={2}
                value={choice.description ?? ""}
                onChange={(e) =>
                  onChange(patchChoice(choices, i, { description: e.target.value }))
                }
              />
            </label>

            <label className="gm-form-check">
              <input
                type="checkbox"
                checked={hasDice}
                onChange={(e) => toggleDice(i, e.target.checked)}
              />
              <span>Нужен бросок d20 (успех / провал)</span>
            </label>

            {hasDice ? (
              <>
                <div className="gm-form-inline">
                  <label>
                    <span>Порог d20</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={choice.diceRequired?.[0]?.threshold ?? 12}
                      onChange={(e) =>
                        onChange(
                          patchChoice(choices, i, {
                            diceRequired: [
                              {
                                count: 1,
                                sides: 20,
                                label: "d20 проверка",
                                threshold: Number(e.target.value),
                              },
                            ],
                          }),
                        )
                      }
                    />
                  </label>
                </div>
                <GmEffectBuilder
                  label="При успехе"
                  effects={choice.onSuccess || []}
                  onChange={(fx) =>
                    onChange(patchChoice(choices, i, { onSuccess: fx }))
                  }
                />
                <GmEffectBuilder
                  label="При провале"
                  effects={choice.onFail || []}
                  onChange={(fx) =>
                    onChange(patchChoice(choices, i, { onFail: fx }))
                  }
                />
              </>
            ) : (
              <GmEffectBuilder
                label="Последствия"
                effects={choice.effects || []}
                onChange={(fx) =>
                  onChange(patchChoice(choices, i, { effects: fx }))
                }
              />
            )}
          </article>
        );
      })}
    </div>
  );
}
