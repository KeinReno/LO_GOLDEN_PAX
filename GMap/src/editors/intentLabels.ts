/** Human-readable Russian labels for intent defIds. */

const LABELS: Record<string, string> = {
  "intent.move_fleet": "Перемещение флота",
  "intent.move_legion": "Перемещение легиона",
  "intent.claim_system": "Захват системы",
  "intent.attack_system": "Атака",
  "intent.blockade": "Блокада",
  "intent.fortify": "Укрепление",
  "intent.set_tax": "Налог",
  "intent.set_flow_priority": "Приоритет производства",
  "intent.reserve_stock": "Резерв склада",
  "intent.set_economic_policy": "Экономическая политика",
  "intent.transfer": "Перевод ресурсов",
  "intent.market_convert": "Обмен на рынке",
  "intent.market_offer": "Заявка на рынке",
  "intent.market_cancel": "Отмена заявки",
  "intent.scout_reveal": "Разведка",
  "intent.scout_world": "Изучение мира",
  "intent.espionage": "Шпионаж",
  "intent.refugee_convoy": "Конвой беженцев",
  "intent.give_npc_task": "Поручение двора",
  "intent.assign_npc_posting": "Назначение двора",
  "intent.recall_npc_posting": "Отзыв ко двору",
  "intent.seat_npc_council": "Место за столом",
  "intent.unseat_npc_council": "В пул двора",
  "intent.set_council_portfolio": "Роль советника",
  "intent.research_upgrade": "Улучшение технологии",
  "intent.set_research_queue": "Очередь исследований",
  "intent.set_build_queue": "Очередь строительства",
  "intent.found_hybrid_lineage": "Основать смешанный род",
  "intent.trade_tech": "Обмен технологией",
};

export function intentLabel(defId: string): string {
  if (LABELS[defId]) return LABELS[defId];
  const bare = defId.replace(/^intent\./, "");
  return LABELS[`intent.${bare}`] ?? bare.replace(/_/g, " ");
}
