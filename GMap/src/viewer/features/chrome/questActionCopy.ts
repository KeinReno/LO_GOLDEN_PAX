export function questChoiceAppliedNote(): string {
  return "Выбор по квесту применён";
}

export function questDiceNote(message?: string): string {
  return message || "Бросок записан";
}
