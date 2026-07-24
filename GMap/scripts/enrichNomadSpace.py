# -*- coding: utf-8 -*-
"""
Realign NOMAD sectors to current system positions and enrich Galivan
with lore-driven POIs, resources, capitals, fleets, caravans, quests.
"""
from __future__ import annotations

import json
import math
import re
import uuid
from collections import defaultdict
from pathlib import Path

CAMPAIGN = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/public/campaigns/lo_golden_pax.json")
PUBLISHED = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/data/published.json")
REPORT = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/tmp/nomad_enrich_report.json")

PAD = 220.0  # sector hull padding in world units
MIN_SPAN = 280.0


def uid() -> str:
    return str(uuid.uuid4())


def cross(o, a, b) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    pts = sorted(set((round(p[0], 3), round(p[1], 3)) for p in points))
    if len(pts) <= 1:
        return list(pts)
    if len(pts) == 2:
        return list(pts)
    lower: list[tuple[float, float]] = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def expand_hull(hull: list[tuple[float, float]], pad: float) -> list[tuple[float, float]]:
    if not hull:
        return []
    if len(hull) == 1:
        x, y = hull[0]
        r = max(pad, MIN_SPAN / 2)
        return [
            (x - r, y - r * 0.55),
            (x + r, y - r * 0.55),
            (x + r, y + r * 0.55),
            (x - r, y + r * 0.55),
        ]
    if len(hull) == 2:
        (x0, y0), (x1, y1) = hull
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L * pad, dx / L * pad
        return [
            (x0 + nx, y0 + ny),
            (x1 + nx, y1 + ny),
            (x1 - nx, y1 - ny),
            (x0 - nx, y0 - ny),
        ]
    cx = sum(p[0] for p in hull) / len(hull)
    cy = sum(p[1] for p in hull) / len(hull)
    out = []
    for x, y in hull:
        dx, dy = x - cx, y - cy
        dist = math.hypot(dx, dy) or 1.0
        out.append((x + dx / dist * pad, y + dy / dist * pad))
    return out


def flat_poly(pts: list[tuple[float, float]]) -> list[float]:
    out: list[float] = []
    for x, y in pts:
        out.extend([round(x, 2), round(y, 2)])
    return out


def point_in_poly(x: float, y: float, poly: list[float]) -> bool:
    n = len(poly) // 2
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = poly[i * 2], poly[i * 2 + 1]
        xj, yj = poly[j * 2], poly[j * 2 + 1]
        intersect = (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
        if intersect:
            inside = not inside
        j = i
    return inside


def dist2(a, b) -> float:
    return (a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2


def find_sys(systems: list[dict], *names: str) -> dict | None:
    low = {n.lower(): n for n in names}
    for s in systems:
        if s["name"].lower() in low or s["name"].split("·")[0].strip().lower() in low:
            return s
    # fuzzy startswith
    for s in systems:
        base = s["name"].split("·")[0].strip().lower()
        for n in names:
            if base.startswith(n.lower()) or n.lower().startswith(base):
                return s
    return None


def lore_name_from_notes(systems: list[dict], fid: str) -> str:
    counts: dict[str, int] = defaultdict(int)
    for s in systems:
        if s.get("ownerFactionId") != fid:
            continue
        m = re.match(r"NOMAD · ([^·]+)", s.get("notes") or "")
        if m:
            counts[m.group(1).strip()] += 1
    if not counts:
        return "Неизвестные"
    return max(counts.items(), key=lambda kv: kv[1])[0]


# Capitals / signature systems + flavor
SECTOR_TITLE = {
    "Вайсы": "Земли Вайсов",
    "Винцепсы": "Земли Винцепсов",
    "Гничи": "Земли Гничей",
    "Дитвиры": "Земли Дитвиров",
    "Зеленые Эланы": "Королевства Зелёных Эланов",
    "Йу": "Земли Йу",
    "Кичир": "Улей Кичир",
    "Охи": "Земли Охи",
    "Союз Маркштейн": "Нейтралитет Маркштейн",
    "Трины": "Земли Тринов",
    "Туран": "Кланы Туран",
    "Эдэмоны": "Империя Эдэмонов",
    "Pax Terrialis": "Федерация Pax Terrialis",
}

FACTION_FLAVOR: dict[str, dict] = {
    "Вайсы": {
        "capital": "Alfheim",
        "pois": {"Alfheim": ["sanctuary", "nebula"], "Zephyria": ["comet"], "Luminara": ["beacon"], "Aerenal": ["nebula"]},
        "resources": ["биосмола", "благовония", "кристаллы"],
        "activity": "trade",
        "blurb": "Рой мотыльковых инсектоидов: тихие сады, световые миграции, сборная экономика.",
        "fleet": ("Крыло Света Alfheim", "patrol", "idle", [("разведчик", 6), ("корвет", 2)]),
        "kind": "faction",
    },
    "Винцепсы": {
        "capital": "Valenwood",
        "pois": {
            "Valenwood": ["sanctuary", "nebula"],
            "Athel Loren": ["ruin", "anomaly"],
            "Mirkwood": ["dead_zone"],
            "Thelanis": ["anomaly"],
            "Lamannia": ["nebula"],
        },
        "resources": ["биосмола", "зелёный сплав", "вода"],
        "activity": "none",
        "blurb": "Древовидная теократия друидов: медленные решения, живые корабли, священные рощи.",
        "fleet": ("Корни Valenwood", "patrol", "defend", [("корвет", 4), ("фрегат", 1)]),
        "kind": "state",
    },
    "Гничи": {
        "capital": "Zilargo",
        "pois": {
            "Zilargo": ["hub", "relay"],
            "Seraphia": ["hub", "outpost"],
            "Stellara": ["relay"],
            "Q'barra": ["asteroid"],
            "Nyx": ["pirate"],
        },
        "resources": ["руда", "редкоземы", "контрабанда", "данные-узлы"],
        "activity": "trade",
        "blurb": "Племенной торговый союз гничей: базары, посредничество, ночные сделки.",
        "fleet": ("Караван-стража Zilargo", "trade", "idle", [("корвет", 5), ("торговый", 3)]),
        "kind": "state",
    },
    "Дитвиры": {
        "capital": "Shavarath",
        "pois": {
            "Shavarath": ["fortress", "storm", "pirate"],
            "Risia": ["dead_zone", "pirate"],
            "Xoriat": ["anomaly", "black_hole", "pirate"],
            "Thrane": ["fortress", "minefield"],
        },
        "resources": ["обломки", "лом", "костяной сплав", "рабы-чёрный рынок"],
        "activity": "battle",
        "blurb": "Кочевые армады: волны вторжения каждые 5–10 лет. Сейчас — фаза давления на восток Галивана.",
        "fleet": ("Армада Первой Волны", "combat", "attack", [("рейдер", 8), ("крейсер", 2)]),
        "kind": "faction",
    },
    "Зеленые Эланы": {
        "capital": "Valinor",
        "pois": {
            "Valinor": ["sanctuary", "hub"],
            "Tirion": ["beacon", "relay"],
            "Tol Eressea": ["anomaly"],
            "Gondolin": ["fortress", "ruin"],
            "Nargothrond": ["ruin"],
            "Formenos": ["asteroid"],
        },
        "resources": ["пси-кристаллы", "реликты", "зелёный сплав", "благовония"],
        "activity": "none",
        "blurb": "Магические королевства долгих эланов: реликвии, академии, закрытые дворы.",
        "fleet": ("Стража Valinor", "patrol", "defend", [("фрегат", 3), ("корвет", 4)]),
        "kind": "state",
    },
    "Йу": {
        "capital": "Vanaheim",
        "pois": {
            "Vanaheim": ["fortress", "outpost"],
            "Svartalfheim": ["minefield"],
            "Tir na nÓg": ["beacon"],
            "Ljosalfheim": ["outpost"],
        },
        "resources": ["титан", "порох-сплав", "железо"],
        "activity": "garrison",
        "blurb": "Военный коллектив крошечных гуманоидов в скафандрах: числом и дерзостью.",
        "fleet": ("Рой Йу — Клин", "combat", "fortify", [("катер", 12), ("корвет", 3)]),
        "kind": "state",
    },
    "Кичир": {
        "capital": "Valenar",
        "pois": {"Valenar": ["outpost", "beacon"], "Хитин-Дозор": ["relay"]},
        "resources": ["мёртвый хитин", "яйца-мат", "оболочка-сырьё"],
        "activity": "garrison",
        "blurb": "Улей-разведчиков: дальние дозоры, крылатые десанты, холодная тактика.",
        "fleet": ("Рой-дозор Valenar", "patrol", "idle", [("разведчик", 10)]),
        "kind": "faction",
    },
    "Охи": {
        "capital": "Summerset",
        "pois": {
            "Summerset": ["hub", "relay"],
            "Skywatch": ["beacon"],
            "Shimmerene": ["nebula"],
            "Vulkhel Guard": ["fortress", "shipyard"],
            "Sentinel": ["outpost"],
            "Luna": ["comet"],
        },
        "resources": ["вода", "газ", "кристаллы", "лёд"],
        "activity": "trade",
        "blurb": "Водная конфедерация мореходов: аква-верфи, маяки туманностей, торговые флотилии.",
        "fleet": ("Флотилия Summerset", "trade", "idle", [("фрегат", 2), ("корвет", 5)]),
        "kind": "state",
    },
    "Союз Маркштейн": {
        "capital": "Tiranoc",
        "pois": {
            "Tiranoc": ["hub", "asteroid", "pirate"],
            "Galadriel": ["relay", "outpost"],
            "Eärendil": ["beacon"],
        },
        "resources": ["редкоземы", "данные-узлы", "контрабанда", "топливо"],
        "activity": "trade",
        "blurb": "Торговый нейтралитет Галивана. Tiranoc — биржа и магнит для пиратов «Вольных Стервятников».",
        "fleet": ("Эскорт Маркштейн", "patrol", "defend", [("корвет", 6), ("фрегат", 2)]),
        "kind": "state",
    },
    "Трины": {
        "capital": "Nevrast",
        "pois": {
            "Nevrast": ["hub", "shipyard", "relay"],
            "Orsinium": ["fortress"],
            "Wayrest": ["dead_zone"],
        },
        "resources": ["данные-узлы", "титан", "синхро-руда", "антиматерия"],
        "activity": "repair",
        "blurb": "Технократия людей-синтетиков: дроны, верфи, холодные протоколы войны с кланами.",
        "fleet": ("Синтет-эскадра Nevrast", "carrier", "repair", [("дрононосец", 1), ("фрегат", 4)]),
        "kind": "state",
    },
    "Туран": {
        "capital": "Ulthuan",
        "pois": {
            "Ulthuan": ["fortress", "shipyard"],
            "Thingol": ["fortress"],
            "Thranduil": ["outpost"],
            "Mithrim": ["minefield"],
            "Lothern": ["hub"],
        },
        "resources": ["клинок-руда", "железо", "тяжёлая броня", "порох-сплав"],
        "activity": "garrison",
        "blurb": "Кланы северян-экспансионистов: крепости, рейды, вечный спор с Тринами и Маркштейном.",
        "fleet": ("Клан-флот Ulthuan", "combat", "attack", [("рейдер", 5), ("крейсер", 2)]),
        "kind": "state",
    },
    "Эдэмоны": {
        "capital": "Nagarythe",
        "pois": {
            "Nagarythe": ["fortress", "shipyard"],
            "Tor Anlec": ["fortress"],
            "Tor Yvresse": ["outpost"],
            "Saphery": ["beacon", "anomaly"],
            "Chrace": ["outpost"],
            "Eataine": ["hub"],
        },
        "resources": ["клинок-руда", "титан", "реликвии", "тяжёлая броня"],
        "activity": "garrison",
        "blurb": "Империя красных эланов: честь, легионы, военные верфи востока.",
        "fleet": ("Красный Клин Nagarythe", "combat", "fortify", [("линкор", 1), ("фрегат", 3), ("корвет", 4)]),
        "kind": "state",
    },
    "Pax Terrialis": {
        "capital": "Avalon",
        "pois": {
            "Avalon": ["hub", "relay", "beacon"],
            "Beren": ["outpost"],
            "Celebrimbor": ["shipyard"],
            "Avaloria": ["sanctuary"],
            "Feanor": ["asteroid"],
            "Elrond": ["relay"],
        },
        "resources": ["топливо", "данные-узлы", "железо", "кристаллы"],
        "activity": "trade",
        "blurb": "Федерация людей-исследователей. Наследие корабля «Номад» (бывший «Вояжер-7») — западный якорь Галивана.",
        "fleet": ("Эскадра Номад-Pax", "patrol", "idle", [("фрегат", 3), ("корвет", 4), ("разведчик", 2)]),
        "kind": "state",
    },
}

# Border enmities for contested systems
ENEMIES = [
    ("Дитвиры", "Эдэмоны"),
    ("Дитвиры", "Зеленые Эланы"),
    ("Дитвиры", "Вайсы"),
    ("Туран", "Трины"),
    ("Туран", "Союз Маркштейн"),
    ("Трины", "Союз Маркштейн"),
    ("Йу", "Туран"),
]


def apply_enrichment(world: dict) -> dict:
    systems = world["systems"]
    nomad = [s for s in systems if (s.get("notes") or "").startswith("NOMAD")]
    if not nomad:
        raise SystemExit("No NOMAD systems found")

    by_id = {s["id"]: s for s in systems}
    factions = {f["id"]: f for f in world.get("factions", [])}
    nomad_factions = [f for f in world.get("factions", []) if str(f.get("id", "")).startswith("faction_nomad_")]

    # Resolve lore names and polish faction records
    lore_by_fid: dict[str, str] = {}
    for f in nomad_factions:
        lore = lore_name_from_notes(nomad, f["id"])
        lore_by_fid[f["id"]] = lore
        flavor = FACTION_FLAVOR.get(lore, {})
        f["name"] = f"{lore} · Галиван"
        f["notes"] = flavor.get("blurb", "Держава сектора Галиван (NOMAD).")
        if flavor.get("kind"):
            f["kind"] = flavor["kind"]
        # Distinct colour: Эдэмоны shared palette slot with Pax
        if lore == "Эдэмоны":
            f["color"] = "#c23b3b"

    fid_by_lore = {v: k for k, v in lore_by_fid.items()}

    # --- rebuild sectors from current star positions ---
    world["sectors"] = [
        s for s in world.get("sectors", []) if not (s.get("notes") or "").startswith("NOMAD")
    ]
    # also drop legacy broken names
    world["sectors"] = [
        s
        for s in world["sectors"]
        if "NOMAD" not in (s.get("name") or "") and "Галиван" not in (s.get("name") or "")
    ]

    new_sectors: list[dict] = []
    sector_id_by_fid: dict[str, str] = {}

    for f in nomad_factions:
        fid = f["id"]
        lore = lore_by_fid[fid]
        owned = [s for s in nomad if s.get("ownerFactionId") == fid]
        if not owned:
            continue
        pts = [(s["x"], s["y"]) for s in owned]
        hull = expand_hull(convex_hull(pts), PAD)
        poly = flat_poly(hull)
        sid = uid()
        sector_id_by_fid[fid] = sid
        new_sectors.append(
            {
                "id": sid,
                "name": SECTOR_TITLE.get(lore, f"Земли {lore}"),
                "polygon": poly,
                "color": f.get("color") or "#888888",
                "notes": f"NOMAD · сектор Галиван · {lore}. {FACTION_FLAVOR.get(lore, {}).get('blurb', '')}",
            }
        )

    # Outer Galivan envelope (subtle regional frame)
    all_pts = [(s["x"], s["y"]) for s in nomad]
    galivan_poly = flat_poly(expand_hull(convex_hull(all_pts), PAD * 1.6))
    galivan_id = uid()
    new_sectors.insert(
        0,
        {
            "id": galivan_id,
            "name": "Сектор Галиван",
            "polygon": galivan_poly,
            "color": "#6e7f8d",
            "notes": "NOMAD · Сектор Галиван — северное человечество и пограничные державы. 130+ систем, множество конфликтов.",
        },
    )

    world["sectors"] = world.get("sectors", []) + new_sectors

    # Assign systems to faction sectors (prefer faction sector over Galivan)
    for s in nomad:
        fid = s.get("ownerFactionId")
        if fid and fid in sector_id_by_fid:
            s["sectorId"] = sector_id_by_fid[fid]
        else:
            s["sectorId"] = galivan_id if point_in_poly(s["x"], s["y"], galivan_poly) else s.get("sectorId")

    # --- per-system flavor ---
    for s in nomad:
        fid = s.get("ownerFactionId")
        lore = lore_by_fid.get(fid or "", "")
        flavor = FACTION_FLAVOR.get(lore, {})
        base_name = s["name"].split("·")[0].strip()

        # reset capital flags we'll set
        s["isCapital"] = False

        pois = list(s.get("spaceObjects") or [])
        # map of name -> pois
        for key, extra in (flavor.get("pois") or {}).items():
            if base_name.lower() == key.lower() or base_name.lower().startswith(key.lower()):
                for p in extra:
                    if p == "garrison":
                        s["activity"] = "garrison"
                        continue
                    if p not in pois:
                        pois.append(p)
        # default light flavor if still empty
        if not pois and flavor:
            # sprinkle lightly by hash of name
            h = sum(ord(c) for c in base_name)
            pool = ["beacon", "asteroid", "nebula", "outpost", "relay"]
            pois.append(pool[h % len(pool)])

        s["spaceObjects"] = pois
        if pois and (not s.get("poiType") or s.get("poiType") == "none"):
            s["poiType"] = pois[0]

        res = list(s.get("resources") or [])
        for r in flavor.get("resources") or []:
            # assign 1-2 resources to subset of systems
            h = sum(ord(c) for c in base_name + r)
            if h % 3 == 0 and r not in res:
                res.append(r)
        if not res and flavor.get("resources"):
            res.append(flavor["resources"][0])
        s["resources"] = res[:4]

        # activity
        if flavor.get("activity") and s.get("activity") in (None, "none"):
            if base_name.lower() == (flavor.get("capital") or "").lower() or sum(ord(c) for c in base_name) % 5 == 0:
                s["activity"] = flavor["activity"]

        # traffic hubs
        if "hub" in pois:
            s["trafficHub"] = True

        # richer notes (keep NOMAD tag prefix for tooling)
        blurb = flavor.get("blurb", "")
        s["notes"] = f"NOMAD · {lore or 'нейтрал'} · {blurb}".strip(" ·")

    # Capitals
    for lore, flavor in FACTION_FLAVOR.items():
        cap = find_sys(nomad, flavor["capital"])
        if cap and lore_by_fid.get(cap.get("ownerFactionId") or "") == lore:
            cap["isCapital"] = True
            if "hub" not in (cap.get("spaceObjects") or []):
                cap.setdefault("spaceObjects", []).append("hub")
            cap["trafficHub"] = True
            cap["activity"] = flavor.get("activity") or cap.get("activity") or "garrison"

    # Contested border systems (nearest neighbors across enemy pairs)
    for a_lore, b_lore in ENEMIES:
        a_fid, b_fid = fid_by_lore.get(a_lore), fid_by_lore.get(b_lore)
        if not a_fid or not b_fid:
            continue
        a_sys = [s for s in nomad if s.get("ownerFactionId") == a_fid]
        b_sys = [s for s in nomad if s.get("ownerFactionId") == b_fid]
        if not a_sys or not b_sys:
            continue
        # mark a few closest pairs
        pairs = []
        for a in a_sys:
            b = min(b_sys, key=lambda x: dist2(a, x))
            pairs.append((dist2(a, b), a, b))
        pairs.sort(key=lambda t: t[0])
        for _, a, b in pairs[:2]:
            for s in (a, b):
                s["contested"] = True
                co = list(s.get("coOwnerFactionIds") or [])
                other = b_fid if s["id"] == a["id"] else a_fid
                if other not in co:
                    co.append(other)
                s["coOwnerFactionIds"] = co
                if s.get("activity") in (None, "none", "trade"):
                    s["activity"] = "battle"
                if "fortress" not in (s.get("spaceObjects") or []) and sum(ord(c) for c in s["name"]) % 2 == 0:
                    s.setdefault("spaceObjects", []).append("minefield")

    # Pirate specials from lore
    for name, pois in [
        ("Tiranoc", ["pirate", "asteroid", "hub"]),
        ("Shavarath", ["pirate", "fortress", "storm"]),
        ("Risia", ["pirate", "dead_zone"]),
        ("Xoriat", ["pirate", "anomaly", "black_hole"]),
    ]:
        s = find_sys(nomad, name)
        if not s:
            continue
        cur = list(s.get("spaceObjects") or [])
        for p in pois:
            if p not in cur:
                cur.append(p)
        s["spaceObjects"] = cur
        s["activity"] = "battle" if "pirate" in pois else s.get("activity")

    # Wormhole / storm corridors between distant hubs (living map spice)
    specials = [
        ("Avalon", ["wormhole", "beacon"], "Врата западного якоря — слухи о связи с дальним ядром галактики."),
        ("Valinor", ["pulsar", "sanctuary"], "Пульсар старых эланов — навигационный запрет для чужих."),
        ("Zilargo", ["relay", "hub"], "Главный торговый узел севера Галивана."),
        ("Nagarythe", ["fortress", "shipyard"], "Сердце красной империи."),
        ("Nevrast", ["shipyard", "dead_zone"], "Синтетические верфи; вокруг — глушилки сканеров."),
        ("Ulthuan", ["fortress", "storm"], "Штормовой фронт кланов Туран."),
    ]
    for name, pois, note in specials:
        s = find_sys(nomad, name)
        if not s:
            continue
        cur = list(s.get("spaceObjects") or [])
        for p in pois:
            if p not in cur:
                cur.append(p)
        s["spaceObjects"] = cur
        s["notes"] = f"{s.get('notes','')} · {note}"

    # Scanner dead zones
    for name in ("Wayrest", "Mirkwood", "Xoriat", "Risia"):
        s = find_sys(nomad, name)
        if s:
            s["scannerDeadZone"] = True
            if "dead_zone" not in (s.get("spaceObjects") or []):
                s.setdefault("spaceObjects", []).append("dead_zone")

    # --- fleets / legions (only if no prior NOMAD-tagged ones) ---
    world.setdefault("fleets", [])
    world.setdefault("legions", [])
    # remove previous enrich fleets
    world["fleets"] = [f for f in world["fleets"] if not str(f.get("name", "")).startswith("NOMAD ·")]
    world["legions"] = [L for L in world["legions"] if not str(L.get("name", "")).startswith("NOMAD ·")]

    for lore, flavor in FACTION_FLAVOR.items():
        fid = fid_by_lore.get(lore)
        if not fid:
            continue
        cap = find_sys(nomad, flavor["capital"])
        if not cap:
            owned = [s for s in nomad if s.get("ownerFactionId") == fid]
            if not owned:
                continue
            cap = owned[0]
        fname, kind, stance, comp = flavor["fleet"]
        world["fleets"].append(
            {
                "id": uid(),
                "name": f"NOMAD · {fname}",
                "factionId": fid,
                "systemId": cap["id"],
                "kind": kind,
                "composition": [{"type": t, "count": c} for t, c in comp],
                "stance": stance,
                "route": [],
            }
        )
        strength = 4000
        if lore in ("Эдэмоны", "Туран", "Дитвиры"):
            strength = 9000
        elif lore in ("Pax Terrialis", "Трины", "Зеленые Эланы"):
            strength = 6500
        world["legions"].append(
            {
                "id": uid(),
                "name": f"NOMAD · Гарнизон {flavor['capital']}",
                "factionId": fid,
                "systemId": cap["id"],
                "strength": strength,
                "status": "garrison",
                "route": [],
            }
        )

    # Extra pirate flotilla at Tiranoc
    tiranoc = find_sys(nomad, "Tiranoc")
    if tiranoc:
        world["fleets"].append(
            {
                "id": uid(),
                "name": "NOMAD · Вольные Стервятники",
                "factionId": tiranoc.get("ownerFactionId") or fid_by_lore.get("Союз Маркштейн"),
                "systemId": tiranoc["id"],
                "kind": "combat",
                "composition": [{"type": "рейдер", "count": 3}, {"type": "катер", "count": 4}],
                "stance": "attack",
                "route": [],
            }
        )

    # --- caravans ---
    world["caravans"] = [c for c in world.get("caravans") or [] if not str(c.get("name", "")).startswith("NOMAD ·")]
    caravan_routes = [
        ("Zilargo", "Tiranoc", "Гничи", "NOMAD · Караван Янтарного Рынка"),
        ("Summerset", "Avalon", "Охи", "NOMAD · Аква-караван Охи"),
        ("Valinor", "Seraphia", "Зеленые Эланы", "NOMAD · Караван Реликвий"),
        ("Eataine", "Zilargo", "Эдэмоны", "NOMAD · Военный обоз Эдэмонов"),
    ]
    for a, b, lore, name in caravan_routes:
        sa, sb = find_sys(nomad, a), find_sys(nomad, b)
        if not sa or not sb:
            continue
        world["caravans"].append(
            {
                "id": uid(),
                "name": name,
                "fromSystemId": sa["id"],
                "toSystemId": sb["id"],
                "progress": (sum(ord(c) for c in name) % 70) / 100.0,
                "factionId": fid_by_lore.get(lore),
            }
        )

    # --- quests ---
    world["quests"] = [q for q in world.get("quests") or [] if not str(q.get("name", "")).startswith("NOMAD ·")]
    quest_specs = [
        (
            "Tiranoc",
            "NOMAD · Охота на Стервятников",
            "Пираты «Вольные Стервятники» душат торговлю пояса Tiranoc.",
            "Маркштейн объявил награду. Сопроводить караван или выжечь базу в астероидах.",
        ),
        (
            "Shavarath",
            "NOMAD · Тень Волны",
            "Армады Дитвиров собираются у Shavarath — начало новой волны.",
            "Разведка: оценить состав флота и предупредить восточные дворы эланов.",
        ),
        (
            "Avalon",
            "NOMAD · Эхо Вояжера",
            "В архивах Pax Terrialis всплыл сигнал «Номад/Вояжер-7».",
            "Найти источник сигнала у западных врат и решить: открыть или запечатать.",
        ),
        (
            "Nevrast",
            "NOMAD · Холодный Протокол",
            "Трины усиливают глушилки у Nevrast — Маркштейн и Туран на взводе.",
            "Дипломатия или диверсия: не дать войне синтетов и кланов вспыхнуть по всему югу.",
        ),
    ]
    for sys_name, qname, summary, detail in quest_specs:
        s = find_sys(nomad, sys_name)
        if not s:
            continue
        world["quests"].append(
            {
                "id": uid(),
                "name": qname,
                "summary": summary,
                "detail": detail,
                "systemId": s["id"],
                "status": "active",
            }
        )

    # --- diplomacy ---
    world.setdefault("diplomacy", [])
    # drop prior nomad-nomad edges we may have added (heuristic: both nomad factions)
    def is_nomad_fid(x: str) -> bool:
        return str(x).startswith("faction_nomad_")

    world["diplomacy"] = [
        e
        for e in world["diplomacy"]
        if not (is_nomad_fid(e.get("aId")) and is_nomad_fid(e.get("bId")))
    ]
    dip_specs = [
        ("Гничи", "Союз Маркштейн", "alliance"),
        ("Гничи", "Винцепсы", "alliance"),
        ("Гничи", "Охи", "alliance"),
        ("Винцепсы", "Охи", "trade"),
        ("Pax Terrialis", "Союз Маркштейн", "trade"),
        ("Pax Terrialis", "Трины", "trade"),
        ("Зеленые Эланы", "Эдэмоны", "truce"),
        ("Туран", "Трины", "war"),
        ("Туран", "Союз Маркштейн", "war"),
        ("Трины", "Союз Маркштейн", "truce"),
        ("Дитвиры", "Эдэмоны", "war"),
        ("Дитвиры", "Зеленые Эланы", "war"),
        ("Дитвиры", "Вайсы", "war"),
        ("Йу", "Туран", "truce"),
        ("Вайсы", "Зеленые Эланы", "trade"),
        ("Кичир", "Эдэмоны", "trade"),
    ]
    allowed = {"neutral", "alliance", "trade", "war", "vassal", "truce"}
    for a, b, rel in dip_specs:
        if rel not in allowed:
            rel = "neutral"
        fa, fb = fid_by_lore.get(a), fid_by_lore.get(b)
        if not fa or not fb:
            continue
        a_id, b_id = sorted([fa, fb])
        world["diplomacy"].append({"id": uid(), "aId": a_id, "bId": b_id, "relation": rel})

    # meta note
    meta = world.setdefault("meta", {})
    note = meta.get("notes") or ""
    tag = "[Galivan enriched]"
    if tag not in note:
        meta["notes"] = (note + " " + tag).strip()

    return {
        "nomad_systems": len(nomad),
        "sectors_created": len(new_sectors),
        "fleets": sum(1 for f in world["fleets"] if str(f.get("name", "")).startswith("NOMAD ·")),
        "legions": sum(1 for L in world["legions"] if str(L.get("name", "")).startswith("NOMAD ·")),
        "caravans": len(world.get("caravans") or []),
        "quests": len(world.get("quests") or []),
        "faction_sectors": [
            {"name": s["name"], "color": s.get("color"), "verts": len(s["polygon"]) // 2}
            for s in new_sectors
        ],
        "sys_bbox": [
            round(min(s["x"] for s in nomad)),
            round(min(s["y"] for s in nomad)),
            round(max(s["x"] for s in nomad)),
            round(max(s["y"] for s in nomad)),
        ],
    }


def sync_published(campaign: dict) -> None:
    if not PUBLISHED.exists():
        return
    pub = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    # Replace nomad systems/links/sectors/factions and enrich artifacts
    camp_nomad_ids = {s["id"] for s in campaign["systems"] if (s.get("notes") or "").startswith("NOMAD")}
    pub["systems"] = [s for s in pub.get("systems", []) if not (s.get("notes") or "").startswith("NOMAD")]
    pub["systems"].extend([s for s in campaign["systems"] if s["id"] in camp_nomad_ids])

    # links touching nomad: rebuild from campaign
    pub_links = [
        L
        for L in pub.get("links", [])
        if L.get("fromId") not in camp_nomad_ids and L.get("toId") not in camp_nomad_ids
    ]
    pub_links.extend(
        [
            L
            for L in campaign.get("links", [])
            if L.get("fromId") in camp_nomad_ids or L.get("toId") in camp_nomad_ids
        ]
    )
    pub["links"] = pub_links

    pub["sectors"] = [
        s
        for s in pub.get("sectors", [])
        if not (s.get("notes") or "").startswith("NOMAD") and "NOMAD" not in (s.get("name") or "") and "Галиван" not in (s.get("name") or "")
    ]
    pub["sectors"].extend(
        [s for s in campaign.get("sectors", []) if (s.get("notes") or "").startswith("NOMAD") or "Галиван" in (s.get("name") or "")]
    )

    pub["factions"] = [f for f in pub.get("factions", []) if not str(f.get("id", "")).startswith("faction_nomad_")]
    pub["factions"].extend([f for f in campaign.get("factions", []) if str(f.get("id", "")).startswith("faction_nomad_")])

    pub["fleets"] = [f for f in pub.get("fleets", []) if not str(f.get("name", "")).startswith("NOMAD ·")]
    pub["fleets"].extend([f for f in campaign.get("fleets", []) if str(f.get("name", "")).startswith("NOMAD ·")])

    pub["legions"] = [L for L in pub.get("legions", []) if not str(L.get("name", "")).startswith("NOMAD ·")]
    pub["legions"].extend([L for L in campaign.get("legions", []) if str(L.get("name", "")).startswith("NOMAD ·")])

    pub["caravans"] = [c for c in pub.get("caravans", []) if not str(c.get("name", "")).startswith("NOMAD ·")]
    pub["caravans"].extend([c for c in campaign.get("caravans", []) if str(c.get("name", "")).startswith("NOMAD ·")])

    pub["quests"] = [q for q in pub.get("quests", []) if not str(q.get("name", "")).startswith("NOMAD ·")]
    pub["quests"].extend([q for q in campaign.get("quests", []) if str(q.get("name", "")).startswith("NOMAD ·")])

    # diplomacy: replace nomad-nomad
    def is_nomad_fid(x: str) -> bool:
        return str(x).startswith("faction_nomad_")

    pub["diplomacy"] = [
        e
        for e in pub.get("diplomacy", [])
        if not (is_nomad_fid(e.get("aId")) and is_nomad_fid(e.get("bId")))
    ]
    pub["diplomacy"].extend(
        [
            e
            for e in campaign.get("diplomacy", [])
            if is_nomad_fid(e.get("aId")) and is_nomad_fid(e.get("bId"))
        ]
    )

    if "meta" in campaign:
        pub["meta"] = campaign["meta"]

    PUBLISHED.write_text(json.dumps(pub, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    world = json.loads(CAMPAIGN.read_text(encoding="utf-8"))
    report = apply_enrichment(world)
    CAMPAIGN.write_text(json.dumps(world, ensure_ascii=False, indent=2), encoding="utf-8")
    sync_published(world)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
