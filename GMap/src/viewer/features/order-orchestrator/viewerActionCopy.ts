export function planetActionMsg(action: string): string {
  const labels: Record<string, string> = {
    build: "Постройка завершена",
    demolish: "Постройка снесена",
    colonize: "Колония основана",
    set_colony_type: "Тип колонии изменён",
    upgrade_grade: "Грейд слотов повышен",
    staff: "Рабочие назначены",
    staff_transfer: "Рабочие переведены",
  };
  return labels[action] ?? "Готово";
}

export function systemActionMsg(action: string): string {
  const labels: Record<string, string> = {
    build_station: "Станция построена",
    demolish_station: "Станция снесена",
    produce_ship: "Корабли добавлены во флот",
    produce_unit: "Войска добавлены в легион",
    rename_system: "Система переименована",
  };
  return labels[action] ?? "Готово";
}
