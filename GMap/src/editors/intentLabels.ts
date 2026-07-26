/** Human-readable Russian labels for intent defIds. */

const LABELS: Record<string, string> = {
  "intent.move_fleet": "Перемещение флота",
  "intent.move_legion": "Перемещение легиона",
  "intent.claim_system": "Захват / экспансия",
  "intent.attack_system": "Атака",
  "intent.set_tax": "Налог",
  "intent.scout_reveal": "Разведка",
  "intent.refugee_convoy": "Конвой беженцев",
};

export function intentLabel(defId: string): string {
  if (LABELS[defId]) return LABELS[defId];
  const bare = defId.replace(/^intent\./, "");
  return LABELS[`intent.${bare}`] ?? bare.replace(/_/g, " ");
}
