export function parseAutoLoginQuery(search: string): {
  factionId: string;
  password: string;
  auto: boolean;
} | null {
  const q = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const factionId = q.get("f") || q.get("faction");
  const password = q.get("p") || q.get("password");
  if (!factionId || !password) return null;
  return { factionId, password, auto: q.get("auto") !== "0" };
}

export function stripLoginQuery(href: string): string {
  const u = new URL(href);
  u.searchParams.delete("f");
  u.searchParams.delete("p");
  u.searchParams.delete("faction");
  u.searchParams.delete("password");
  u.searchParams.delete("auto");
  return u.pathname + u.search;
}

export function missingLoginCredsMsg(): string {
  return "Выберите кампанию и введите ключ доступа";
}

export function formatFactionsLoadError(msg: string): string {
  if (msg.includes("не опубликована") || msg.includes("published")) {
    return "Карта ещё не опубликована. Мастер: вкладка «Сессия» → «Опубликовать для игроков».";
  }
  return (
    msg ||
    "Не удалось загрузить список. Мастер должен нажать «Опубликовать»."
  );
}
