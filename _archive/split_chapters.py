# -*- coding: utf-8 -*-
"""Split session logs into AI-friendly chapter/episode markdown files."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(r"C:\Users\Reno\Desktop\LO_GOLDEN_PAX")
SRC = ROOT / "01_Источники"
OUT = ROOT / "02_История" / "Главы"
OUT.mkdir(parents=True, exist_ok=True)

CHAPTER_META = {
    "I.00": {
        "title": "Пролог — Эпоха выживания",
        "summary": "Градо-караван, отец, Исход с Гаэльи, маска управления, молодая столица. Начало правления Луция.",
        "cast": "Луций Солар, Рассказчик",
        "location": "Домус Солис / кабинет Императора",
    },
    "I.01": {
        "title": "Первые шаги",
        "summary": "Атака Роя на Луну Гурез; делегация Туранмал; первые стройки и приказы.",
        "cast": "Луций, Туранмал, Рой",
        "location": "Столица, Гурез, Саланканеш",
    },
    "I.02": {
        "title": "Наследие и культура",
        "summary": "Захороненный Воин; обмен с Ханством; экспедиция Дая-Чины; приказы народам.",
        "cast": "Луций, Дая-Чина, Ханство, Станичники",
        "location": "Империя, чёрный обелиск, Терриящек",
    },
    "I.03": {
        "title": "Артефакт-Маяк",
        "summary": "Псионический кристалл; открытие Пожирателей; псионика 2→4; скаашиз; Мега-Энергогенератор.",
        "cast": "Луций, Дая-Чина",
        "location": "Храм/комплекс маяка, Домус Солис",
        "secrets": "Родство с создателями маяка; Пожиратели Миров",
    },
    "I.04": {
        "title": "Контакты",
        "summary": "Гничи, Талакурцы, интеграция аборигенов Гамма, Федерация, Вольные Торговцы.",
        "cast": "Луций, Гничи, Талакур, Федерация",
        "location": "Гамма / Paradise World-1, внешние контакты",
    },
    "I.05": {
        "title": "Фронты открываются",
        "summary": "Зачистка Гамма; Лорды Праха; Балсагон; Гарцул; два Роя; Санчос; мимики; Военный Совет Трёх.",
        "cast": "Луций, Совет, Санчос, Кси'Тарра (подготовка)",
        "location": "Гамма, Тета, Садальмелик, Фомальгаут",
    },
    "I.06": {
        "title": "Политика и пси-война",
        "summary": "Смерть короля Торнклифа; регентство Дая-Чины; плацдарм на роевом мире; канал псевдо-королевы; Таала; Сула-Код.",
        "cast": "Луций, Дая-Чина, Кси'Тарра, Таала",
        "location": "Торнклиф, южный Рой, Капелла",
        "secrets": "Сула-Код; якорь подчинения Кси",
    },
    "I.07": {
        "title": "Ход 7 — уплотнение фронтов",
        "summary": "Продолжение врат, плацдарма, трофеев Балсагона, пси-корпуса.",
        "cast": "Луций, штаб, пси-корпус",
        "location": "Восточный и южный фронты",
    },
    "I.07b": {
        "title": "Ход прорыва",
        "summary": "Отдельный блок прорыва в сыром логе (между ходами 7 и 8).",
        "cast": "Луций, флот, союзники",
        "location": "Театр прорыва",
    },
    "I.08": {
        "title": "Ход 8",
        "summary": "События хода 8 по сырому логу.",
        "cast": "Луций и двор",
        "location": "Империя / фронты",
    },
    "I.09": {
        "title": "Ход 9",
        "summary": "События хода 9 по сырому логу.",
        "cast": "Луций и двор",
        "location": "Империя / фронты",
    },
    "I.10": {
        "title": "Аврентис — Клинок в тени",
        "summary": "Операция против «Кузницы» ОР; SOL INVICTUS; триумф и цена; residual-профиль.",
        "cast": "Луций, Ханство, легионы, СБ",
        "location": "Аврентис / Балсагон",
        "secrets": "Кузница ≠ имперская верфь; residual не ноль",
    },
    "I.11": {
        "title": "После Аврентиса — хвост Сессии 1 / мост к Сессии 2",
        "summary": "Ход 13 и последующие сообщения до конца сырого лога (включая ранние события Сессии 2 в том же файле).",
        "cast": "Луций, Астра, Харн, ТИБ, союзники",
        "location": "Столица, запад, Федерация, ворота Амальфеи",
    },
}

BOOK2_SECTIONS = [
    ("II.01", "А", "Вторжение Туранмала в столицу"),
    ("II.02", "Б", "Мятеж СБ и учреждение ТИБ"),
    ("II.03", "В", "Канонизация Императора"),
    ("II.04", "Г", "Западные рубежи — 10 кризисов"),
    ("II.05", "Д", "Молот Наследия"),
    ("II.06", "Е", "Поражение вольгаванийцев"),
    ("II.07", "Ж", "Северный Рой"),
    ("II.08", "З", "Флот Эт Гильмир Сахале"),
    ("II.09", "И", "Алиот — Горный Венец"),
    ("II.10", "К", "Встреча с Секвилоном (Турон)"),
    ("II.11", "Л", "Признание Сая / Раихима"),
    ("II.12", "М", "Разговор с Астрой"),
    ("II.13", "Н", "Верещагин — допрос и гибель"),
    ("II.14", "О", "Тормунд — осмотр"),
    ("II.15", "П", "Санчос Карволло Де Гюдон"),
    ("II.16", "Р", "Геномный анализ Луция"),
    ("II.17", "С", "Машина войны"),
]


def find_source(pred_name_substr: str | None = None, size: int | None = None) -> Path:
    for p in SRC.iterdir():
        if pred_name_substr and pred_name_substr not in p.name:
            continue
        if size is not None and p.is_file() and p.stat().st_size == size:
            return p
        if pred_name_substr and p.is_file():
            return p
    # fallback by size only
    if size is not None:
        for p in SRC.iterdir():
            if p.is_file() and p.stat().st_size == size:
                return p
    raise FileNotFoundError(f"source not found: {pred_name_substr=} {size=}")


def write_header(meta_id: str, title: str, extra: dict | None = None) -> str:
    m = CHAPTER_META.get(meta_id, {})
    lines = [
        f"# {meta_id} — {title}",
        "",
        "> Файл для ИИ: полный дубль сообщений эпизода + точки канона.",
        "",
        "## Мета",
        f"- **id:** `{meta_id}`",
        f"- **книга:** {'I — Эпоха выживания' if meta_id.startswith('I.') else 'II — Ночь столицы и Запад'}",
        f"- **название:** {title}",
    ]
    if m.get("summary") or (extra or {}).get("summary"):
        lines.append(f"- **сводка:** {m.get('summary') or extra.get('summary')}")
    if m.get("cast"):
        lines.append(f"- **персонажи:** {m['cast']}")
    if m.get("location"):
        lines.append(f"- **локация:** {m['location']}")
    if m.get("secrets"):
        lines.append(f"- **секреты 🔒:** {m['secrets']}")
    if extra:
        for k, v in extra.items():
            if k == "summary":
                continue
            lines.append(f"- **{k}:** {v}")
    lines += ["", "---", "", "## Сообщения (полный дубль)", ""]
    return "\n".join(lines)


def append_canon_footer(points: list[str]) -> str:
    body = "\n".join(f"- {p}" for p in points) if points else "- (см. текст эпизода и `00_Канон/06`–`07`)"
    return "\n\n---\n\n## Точка канона\n\n" + body + "\n"


def split_session1(raw: str) -> list[tuple[str, str, int, int]]:
    """Return list of (chapter_id, title, start, end) line ranges (0-based, end exclusive)."""
    lines = raw.splitlines(keepends=True)
    # marker: (line_index, chapter_id, title)
    markers: list[tuple[int, str, str]] = []

    # Пролог: с начала файла (включая OOC), «Акт I» внутри I.00
    prolog_idx = 0
    markers.append((prolog_idx, "I.00", CHAPTER_META["I.00"]["title"]))

    patterns = [
        (re.compile(r"^Ход\s*1\b", re.I), "I.01", CHAPTER_META["I.01"]["title"]),
        (re.compile(r"^Ход\s*2\s*:?\s*$", re.I), "I.02", CHAPTER_META["I.02"]["title"]),
        (re.compile(r"^Ход\s*3\b", re.I), "I.03", CHAPTER_META["I.03"]["title"]),
        (re.compile(r"^Ход\s*4\b", re.I), "I.04", CHAPTER_META["I.04"]["title"]),
        (re.compile(r"^Ход\s*5\b", re.I), "I.05", CHAPTER_META["I.05"]["title"]),
        (re.compile(r"^Ход\s*6\b", re.I), "I.06", CHAPTER_META["I.06"]["title"]),
        (re.compile(r"^Ход\s*7\b", re.I), "I.07", CHAPTER_META["I.07"]["title"]),
        (re.compile(r"^Ход\s*прорыва\b", re.I), "I.07b", CHAPTER_META["I.07b"]["title"]),
        (re.compile(r"^Ход\s*8\b", re.I), "I.08", CHAPTER_META["I.08"]["title"]),
        (re.compile(r"^Ход\s*9\b", re.I), "I.09", CHAPTER_META["I.09"]["title"]),
        (re.compile(r"^Ход\s*10\b", re.I), "I.10", CHAPTER_META["I.10"]["title"]),
        (re.compile(r"^Ход\s*11\b", re.I), "I.11", "Ход 11"),
        (re.compile(r"^Ход\s*12\b", re.I), "I.11", "Ход 12"),
        (re.compile(r"^Ход\s*13\b", re.I), "I.11", CHAPTER_META["I.11"]["title"]),
    ]

    seen_ids_for_first = set()
    for i, line in enumerate(lines):
        s = line.strip()
        for rx, cid, title in patterns:
            if rx.search(s):
                # skip duplicate "Ход 2" / "Ход 6" second occurrences as new chapters
                # but allow I.11 to start at first of 11/12/13
                key = (cid, s[:20])
                if cid in seen_ids_for_first and cid != "I.11":
                    # allow only first occurrence of each chapter id except we already have I.02 from first Ход 2
                    break
                if cid in {m[1] for m in markers} and cid != "I.11":
                    break
                markers.append((i, cid, title))
                seen_ids_for_first.add(cid)
                break

    # If no explicit Ход 1 marker, invent chapter I.01 between prolog and I.02
    ids = [m[1] for m in markers]
    if "I.02" in ids and "I.01" not in ids:
        # find line with "Ход 1" mention or use midpoint heuristic: before first "Ход 2:"
        idx02 = next(m[0] for m in markers if m[1] == "I.02")
        # search backwards for a natural break near "### Запрос информации о Рое (Ход 1)" or similar
        start01 = None
        for j in range(idx02 - 1, prolog_idx, -1):
            if "Ход 1" in lines[j] or "ход 1" in lines[j].lower():
                # go up to message boundary (blank + avatar pattern) — use line with ### or a bit earlier
                start01 = max(prolog_idx + 1, j - 30)
                break
        if start01 is None:
            # use ~line 779 area from earlier grep — search for "Запрос информации о Рое"
            for j in range(prolog_idx, idx02):
                if "Запрос информации о Рое" in lines[j] or "атака Роя" in lines[j].lower():
                    start01 = j
                    break
        if start01 is None:
            start01 = prolog_idx + 1
        markers.append((start01, "I.01", CHAPTER_META["I.01"]["title"]))

    # sort and dedupe by chapter id keeping earliest
    markers.sort(key=lambda x: x[0])
    dedup: list[tuple[int, str, str]] = []
    seen = set()
    for idx, cid, title in markers:
        if cid in seen:
            continue
        seen.add(cid)
        dedup.append((idx, cid, title))
    markers = dedup

    ranges: list[tuple[str, str, int, int]] = []
    for i, (start, cid, title) in enumerate(markers):
        end = markers[i + 1][0] if i + 1 < len(markers) else len(lines)
        ranges.append((cid, title, start, end))
    return ranges


def extract_canon_bullets(text: str, limit: int = 8) -> list[str]:
    bullets = []
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("- ") and 20 < len(s) < 200:
            bullets.append(s[2:])
        if len(bullets) >= limit:
            break
    return bullets


def write_book1():
    # find large log by size
    raw_path = None
    for p in SRC.iterdir():
        if p.is_file() and p.stat().st_size > 1_000_000:
            raw_path = p
            break
    if raw_path is None:
        raise FileNotFoundError("session1 log")
    raw = raw_path.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines(keepends=True)
    ranges = split_session1(raw)

    index_rows = []
    book1_dir = OUT / "Книга_I_Эпоха_выживания"
    book1_dir.mkdir(parents=True, exist_ok=True)

    for cid, title, start, end in ranges:
        chunk = "".join(lines[start:end])
        header = write_header(cid, title, {"строки_источника": f"{start + 1}–{end}", "источник": raw_path.name})
        footer = append_canon_footer(
            [
                f"Эпизод покрывает строки {start + 1}–{end} сырого лога Сессии 1.",
                "При конфликте с `00_Канон/06_Хронология_Сессия_1.md` приоритет у этого полного текста, затем у сводки канона.",
            ]
        )
        out_name = f"{cid}_{slug(title)}.md"
        out_path = book1_dir / out_name
        out_path.write_text(header + chunk + footer, encoding="utf-8")
        index_rows.append((cid, title, str(out_path.relative_to(ROOT)), end - start))
        print(f"wrote {out_path.name} lines={end - start}")
    return index_rows


def slug(title: str) -> str:
    s = re.sub(r"[^\w\s\-а-яА-ЯёЁ]+", "", title, flags=re.UNICODE)
    s = re.sub(r"\s+", "_", s.strip())
    return s[:60] or "episode"


def write_book2():
    # session 2 summary ~46k
    summary_path = None
    for p in SRC.iterdir():
        if p.is_file() and 10_000 < p.stat().st_size < 200_000 and p.suffix.lower() in {".md", ""}:
            # prefer name containing 2 or session summary
            if "2" in p.name or p.suffix == ".md" and "MMR" not in p.name:
                if p.name != "MMR.md":
                    summary_path = p
                    if "2" in p.name:
                        break
    if summary_path is None:
        for p in SRC.iterdir():
            if p.is_file() and p.stat().st_size == 46824:
                summary_path = p
                break
    if summary_path is None:
        raise FileNotFoundError("session2 summary")

    text = summary_path.read_text(encoding="utf-8", errors="replace")
    book2_dir = OUT / "Книга_II_Ночь_столицы_и_Запад"
    book2_dir.mkdir(parents=True, exist_ok=True)

    # Split by ### А. / ### Б. etc and also ## Лор / ## Открытые
    section_starts: list[tuple[int, str, str]] = []
    lines = text.splitlines(keepends=True)
    letter_map = {letter: (cid, title) for cid, letter, title in BOOK2_SECTIONS}

    for i, line in enumerate(lines):
        m = re.match(r"^###\s*([А-ЯA-Z])\.\s*(.+)$", line.strip())
        if m:
            letter, rest = m.group(1), m.group(2).strip()
            if letter in letter_map:
                cid, title = letter_map[letter]
                section_starts.append((i, cid, title))
            else:
                section_starts.append((i, f"II.{letter}", rest))

    # Additional major ## sections after chronology
    extra_patterns = [
        (re.compile(r"^##\s*Лор:\s*Альянс Амальфея"), "II.18", "Лор — Альянс Амальфея"),
        (re.compile(r"^##\s*Корректировка"), "II.19", "Корректировка «Гостя»"),
        (re.compile(r"^##\s*Союзники"), "II.20", "Союзники после Секвилона"),
        (re.compile(r"^##\s*Итог перемирия"), "II.21", "Итог перемирия с Туроном"),
        (re.compile(r"^##\s*Открытые узлы"), "II.22", "Открытые узлы"),
        (re.compile(r"^##\s*Ключевые NPC"), "II.23", "Ключевые NPC (состояние)"),
        (re.compile(r"^##\s*Ключевые фракции"), "II.24", "Ключевые фракции (состояние)"),
        (re.compile(r"^##\s*Музыка и культура"), "II.25", "Музыка и культура"),
        (re.compile(r"^##\s*Молитва"), "II.26", "Молитва и обряды"),
        (re.compile(r"^##\s*Дополнительно:\s*имперские приказы"), "II.27", "Имперские приказы сессии"),
    ]
    for i, line in enumerate(lines):
        for rx, cid, title in extra_patterns:
            if rx.search(line.strip()):
                section_starts.append((i, cid, title))
                break

    section_starts.sort(key=lambda x: x[0])
    # dedupe by cid keeping first
    seen = set()
    dedup = []
    for item in section_starts:
        if item[1] in seen:
            continue
        seen.add(item[1])
        dedup.append(item)
    section_starts = dedup

    index_rows = []
    # preamble before first section
    if section_starts and section_starts[0][0] > 0:
        pre = "".join(lines[: section_starts[0][0]])
        path = book2_dir / "II.00_Введение_сессии.md"
        header = write_header("II.00", "Введение Сессии 2", {"источник": summary_path.name})
        path.write_text(header + pre + append_canon_footer(["Сводка охватывает вторжение Туранмала и последующие арки."]), encoding="utf-8")
        index_rows.append(("II.00", "Введение Сессии 2", str(path.relative_to(ROOT)), section_starts[0][0]))

    for i, (start, cid, title) in enumerate(section_starts):
        end = section_starts[i + 1][0] if i + 1 < len(section_starts) else len(lines)
        chunk = "".join(lines[start:end])
        header = write_header(cid, title, {"строки_источника": f"{start + 1}–{end}", "источник": summary_path.name})
        footer = append_canon_footer(
            [
                f"Блок `{title}` из сводки Сессии 2.",
                "Канон свежее Сессии 1; сверять с `00_Канон/07` и `19`.",
            ]
        )
        out_path = book2_dir / f"{cid}_{slug(title)}.md"
        out_path.write_text(header + chunk + footer, encoding="utf-8")
        index_rows.append((cid, title, str(out_path.relative_to(ROOT)), end - start))
        print(f"wrote {out_path.name} lines={end - start}")
    return index_rows


def write_index(book1, book2):
    chron = ROOT / "02_История" / "Хронология.md"
    lines = [
        "# Хронология — индекс глав и эпизодов",
        "",
        "Навигация для ИИ. Полный текст — в файлах глав.",
        "",
        "## Книга I — Эпоха выживания",
        "",
        "| ID | Название | Файл | строк |",
        "|----|----------|------|------|",
    ]
    for cid, title, rel, n in book1:
        lines.append(f"| `{cid}` | {title} | [[{rel}]] | {n} |")
    lines += ["", "## Книга II — Ночь столицы и Запад", "", "| ID | Название | Файл | строк |", "|----|----------|------|------|"]
    for cid, title, rel, n in book2:
        lines.append(f"| `{cid}` | {title} | [[{rel}]] | {n} |")
    lines += [
        "",
        "## Как читать",
        "",
        "1. Открой нужную главу в `02_История/Главы/`.",
        "2. Блок **Мета** — ориентир сцены.",
        "3. Блок **Сообщения** — полный дубль исходника.",
        "4. Блок **Точка канона** — что зафиксировать как факт.",
        "",
        "Сырые файлы без разметки: `01_Источники/`.",
        "",
    ]
    chron.write_text("\n".join(lines), encoding="utf-8")
    print(f"index -> {chron}")


def main():
    b1 = write_book1()
    b2 = write_book2()
    write_index(b1, b2)
    print(f"DONE book1={len(b1)} book2={len(b2)}")


if __name__ == "__main__":
    main()
