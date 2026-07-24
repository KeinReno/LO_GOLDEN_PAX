# -*- coding: utf-8 -*-
"""
Seed ~100 wild systems around existing map (no states — factions OK).
Tagged notes: "EXP · …" so re-runs replace previous EXP content.
Writes campaign + published.
"""
from __future__ import annotations

import json
import math
import random
import uuid
from pathlib import Path

CAMPAIGN = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/public/campaigns/lo_golden_pax.json")
PUBLISHED = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/data/published.json")
REPORT = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/tmp/exp_systems_report.json")

SEED = 2142
COUNT = 100
TAG = "EXP ·"

PREFIXES = [
    "Тень", "Пепел", "Осколок", "Шёпот", "Клык", "Ржавчина", "Эхо", "Пыл",
    "Скат", "Туман", "Кость", "Искра", "Молох", "Яма", "Зев", "Стык",
    "Вихрь", "Гниль", "Зеркало", "Обрыв", "Капкан", "Сигнал", "Курган",
]
SUFFIXES = [
    "Арк", "Нуль", "Вейл", "Дрейф", "Холд", "Риф", "Фордж", "Спит",
    "Гейт", "Роам", "Фейд", "Крак", "Лит", "Шард", "Войд", "Блинк",
]
GREEK = list("ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ")

POI_POOL = [
    "anomaly", "asteroid", "nebula", "debris", "pirate", "ruin", "dead_zone",
    "minefield", "relay", "storm", "wormhole", "black_hole", "comet", "pulsar",
    "outpost", "beacon", "sanctuary", "fortress", "shipyard", "hub",
]
RES_POOL = [
    "железо", "титан", "кристаллы", "газ", "вода", "редкоземы", "антиматерия",
    "реликты", "обломки", "контрабанда", "топливо", "лом", "пси-кристаллы",
    "биосмола", "данные-узлы", "пепел",
]

# Faction owners allowed (non-state)
FACTION_OWNERS = [
    (None, 0.55),
    ("faction_pirates", 0.22),
    ("faction_or", 0.12),
    ("faction_sahale", 0.06),
    ("faction_south_swarm", 0.05),
]

NEW_FACTIONS = [
    {
        "id": "faction_free_traders",
        "name": "Вольные караваны",
        "color": "#c4a35a",
        "password": "caravan",
        "kind": "faction",
        "notes": "EXP · нейтральные торговцы окраин",
    },
    {
        "id": "faction_scavengers",
        "name": "Сборщики Пепла",
        "color": "#7a6a58",
        "password": "ash",
        "kind": "faction",
        "notes": "EXP · мародёры руин и обломков",
    },
]


def uid() -> str:
    return str(uuid.uuid4())


def pick_owner(rng: random.Random) -> str | None:
    r = rng.random()
    acc = 0.0
    for fid, w in FACTION_OWNERS:
        acc += w
        if r <= acc:
            return fid
    return None


def make_name(rng: random.Random, i: int) -> str:
    roll = rng.random()
    if roll < 0.35:
        return f"{rng.choice(PREFIXES)}-{rng.choice(SUFFIXES)}"
    if roll < 0.55:
        return f"SYS-{300 + i}"
    if roll < 0.7:
        return f"{rng.choice(GREEK)}-{rng.randint(10, 99)}"
    if roll < 0.85:
        return f"Узел {rng.choice(PREFIXES)}"
    return f"{rng.choice(PREFIXES)} {rng.randint(2, 9)}"


def make_planet(rng: random.Random, idx: int, system_name: str) -> dict:
    ptype = rng.choice(["rocky", "ice", "desert", "gas", "ocean", "toxic", "artifact"])
    climate = rng.choice(["frozen", "cold", "temperate", "hot", "infernal", "tidal_locked"])
    pop = 0
    if ptype in ("rocky", "ocean", "desert") and climate in ("temperate", "cold", "hot") and rng.random() < 0.35:
        pop = int(50_000 + rng.random() * 2_000_000_000)
    res = []
    if rng.random() < 0.4:
        res.append(rng.choice(RES_POOL))
    return {
        "id": uid(),
        "name": f"{system_name}-{idx + 1}" if rng.random() < 0.5 else f"Мир {idx + 1}",
        "type": ptype,
        "climate": climate,
        "population": pop,
        "raceComposition": [],
        "resources": res,
        "habitable": pop > 0 or ptype in ("rocky", "ocean"),
        "colonizable": ptype in ("rocky", "ocean", "desert"),
        "surveyed": rng.random() < 0.7,
        "colonyType": "none",
        "orbitIndex": idx + 1,
        "size": 1,
        "notes": f"{TAG} wild",
        "surfaceSlots": 8,
        "orbitalSlots": 4,
        "surfaceBuildings": [],
        "orbitalBuildings": [],
        "ownerFactionId": None,
        "coOwnerFactionIds": [],
        "contested": False,
    }


def make_system(rng: random.Random, x: float, y: float, i: int, owner: str | None) -> dict:
    name = make_name(rng, i)
    kind = "corridor" if rng.random() < 0.12 else "stellar"
    stars = []
    if kind == "stellar":
        n = 1 if rng.random() < 0.75 else 2
        for _ in range(n):
            stars.append({
                "class": rng.choice(["M", "K", "G", "F", "A", "B"]),
                "luminosity": round(0.3 + rng.random() * 2.5, 2),
            })
    n_planets = 0 if kind == "corridor" else rng.randint(1, 4)
    planets = [make_planet(rng, j, name) for j in range(n_planets)]
    if not planets and kind == "stellar":
        planets = [make_planet(rng, 0, name)]

    pois: list[str] = []
    # Flavor bags
    bag = rng.random()
    if bag < 0.18:
        pois = ["pirate", "asteroid"]
    elif bag < 0.28:
        pois = ["ruin", "anomaly"]
    elif bag < 0.36:
        pois = ["nebula", "comet"]
    elif bag < 0.42:
        pois = ["storm", "dead_zone"]
    elif bag < 0.48:
        pois = ["wormhole", "beacon"]
    elif bag < 0.54:
        pois = ["black_hole"]
    elif bag < 0.60:
        pois = ["pulsar", "relay"]
    elif bag < 0.66:
        pois = ["outpost", "minefield"]
    elif bag < 0.72:
        pois = ["sanctuary"]
    elif bag < 0.78:
        pois = [rng.choice(POI_POOL)]
    # else empty wilderness

    if owner == "faction_pirates" and "pirate" not in pois:
        pois.append("pirate")
    if owner == "faction_or" and "dead_zone" not in pois:
        pois.append(rng.choice(["dead_zone", "anomaly", "ruin"]))
    if owner == "faction_free_traders":
        pois = list(dict.fromkeys(pois + ["hub", "relay"]))
    if owner == "faction_scavengers":
        pois = list(dict.fromkeys(pois + ["debris", "ruin"]))

    resources = []
    for _ in range(rng.randint(0, 2)):
        resources.append(rng.choice(RES_POOL))
    resources = list(dict.fromkeys(resources))

    activity = "none"
    if "pirate" in pois:
        activity = "battle"
    elif "hub" in pois:
        activity = "trade"
    elif owner == "faction_sahale":
        activity = "transit"

    motion = None
    if "comet" in pois or "anomaly" in pois and rng.random() < 0.4:
        motion = {
            "driftDx": round((rng.random() - 0.5) * 40, 2),
            "driftDy": round((rng.random() - 0.5) * 40, 2),
            "radius": round(40 + rng.random() * 80, 1),
            "note": "Дрейфует по окраине",
        }

    return {
        "id": uid(),
        "name": name,
        "x": round(x, 2),
        "y": round(y, 2),
        "kind": kind,
        "stars": stars,
        "planets": planets,
        "stations": [],
        "resources": resources,
        "ownerFactionId": owner,
        "sectorId": None,
        "locked": False,
        "isCapital": False,
        "poiType": pois[0] if pois else "none",
        "spaceObjects": pois,
        "visibleToFactionIds": [],
        "activity": activity,
        "tradeWithSystemId": None,
        "notes": f"{TAG} дикая окраина · {owner or 'нейтрал'}",
        "scannerDeadZone": "dead_zone" in pois or rng.random() < 0.08,
        "blockaded": False,
        "coOwnerFactionIds": [],
        "contested": False,
        "anomalyMotion": motion,
        "questId": None,
        "trafficHub": "hub" in pois,
    }


def nearest(systems: list[dict], x: float, y: float, exclude: set[str] | None = None):
    best = None
    best_d = 1e18
    for s in systems:
        if exclude and s["id"] in exclude:
            continue
        d = (s["x"] - x) ** 2 + (s["y"] - y) ** 2
        if d < best_d:
            best_d = d
            best = s
    return best, math.sqrt(best_d)


def place_points(rng: random.Random, anchors: list[dict], n: int, min_dist: float = 95.0) -> list[tuple[float, float]]:
    """Scatter around random anchors with jitter rings."""
    pts: list[tuple[float, float]] = []
    existing = [(s["x"], s["y"]) for s in anchors]

    def ok(x, y):
        for ax, ay in existing + pts:
            if (ax - x) ** 2 + (ay - y) ** 2 < min_dist * min_dist:
                return False
        return True

    attempts = 0
    while len(pts) < n and attempts < n * 80:
        attempts += 1
        a = rng.choice(anchors)
        # Prefer fringe: 180–520 from anchor
        ang = rng.random() * math.tau
        rad = 160 + rng.random() * 420
        # occasional deep wild
        if rng.random() < 0.15:
            rad = 480 + rng.random() * 700
        x = a["x"] + math.cos(ang) * rad
        y = a["y"] + math.sin(ang) * rad
        if ok(x, y):
            pts.append((x, y))
    return pts


QUEST_TEMPLATES = [
    ("Сигнал из пепла", "Повторяющийся маяк без опознавательных знаков.", "Найти источник и решить: ответить, заглушить или продать координаты."),
    ("Охота на Скат", "Пиратский рейдер 'Скат' грабит караваны на окраине.", "Перехватить или договориться — награда спорная."),
    ("Чёрный пульсар", "Пульсар глушит сканеры в радиусе прыжка.", "Проложить маршрут и замерить зону мёртвой тишины."),
    ("Склад Умбры", "Следы ОР на заброшенной станции.", "Извлечь данные — или оставить гнить."),
    ("Караван без флага", "Вольные торговцы просят эскорт через шторм.", "Довести груз — половина в кредит, половина в слухах."),
    ("Костяной риф", "Астероидное поле с реликтами неизвестной эпохи.", "Разведка / добыча / засада — как повезёт."),
    ("Зеркальный узел", "Система отвечает на сканы собственным эхом с задержкой.", "Выяснить, кто (или что) повторяет."),
    ("Пепельный договор", "Сборщики Пепла предлагают обмен: лом на карту прыжков.", "Сделка может быть ловушкой."),
    ("Врата без пары", "Одиночный червоточиновый отпечаток.", "Куда ведёт — неизвестно. Прыжок добровольцев."),
    ("Тихий форпост", "Заброшенный маяк Сахале всё ещё мигает кодом эвакуации.", "Прочитать лог последнего дня."),
]


def main() -> None:
    rng = random.Random(SEED)
    world = json.loads(CAMPAIGN.read_text(encoding="utf-8"))

    # Strip previous EXP
    old_ids = {s["id"] for s in world["systems"] if (s.get("notes") or "").startswith(TAG)}
    world["systems"] = [s for s in world["systems"] if s["id"] not in old_ids]
    world["links"] = [
        L
        for L in world.get("links", [])
        if L.get("fromId") not in old_ids and L.get("toId") not in old_ids
        and not str(L.get("id", "")).startswith("exp-link-")
        and not (L.get("notes") or "").startswith(TAG)
    ]
    # mark links we add with notes
    world["quests"] = [q for q in world.get("quests") or [] if not str(q.get("name", "")).startswith("EXP ·")]
    world["fleets"] = [f for f in world.get("fleets") or [] if not str(f.get("name", "")).startswith("EXP ·")]
    world["caravans"] = [c for c in world.get("caravans") or [] if not str(c.get("name", "")).startswith("EXP ·")]
    world["factions"] = [
        f for f in world.get("factions", []) if not str(f.get("id", "")).startswith("faction_free_")
        and f.get("id") != "faction_scavengers"
    ]

    # Ensure flavor factions
    existing_fids = {f["id"] for f in world["factions"]}
    for nf in NEW_FACTIONS:
        if nf["id"] not in existing_fids:
            world["factions"].append(nf)
            existing_fids.add(nf["id"])
            FACTION_OWNERS.append((nf["id"], 0.08 if "traders" in nf["id"] else 0.07))

    anchors = list(world["systems"])
    pts = place_points(rng, anchors, COUNT)
    new_systems = []
    for i, (x, y) in enumerate(pts):
        owner = pick_owner(rng)
        # bump new factions into pool after they're added
        if owner is None and rng.random() < 0.12:
            owner = rng.choice(["faction_free_traders", "faction_scavengers"])
        new_systems.append(make_system(rng, x, y, i, owner))

    # Links: each new system → 1–2 nearest (prefer existing, sometimes another EXP)
    new_links = []
    all_for_near = anchors + new_systems
    link_keys: set[tuple[str, str]] = set()
    for s in new_systems:
        candidates = []
        for other in all_for_near:
            if other["id"] == s["id"]:
                continue
            d = (other["x"] - s["x"]) ** 2 + (other["y"] - s["y"]) ** 2
            candidates.append((d, other))
        candidates.sort(key=lambda t: t[0])
        n_links = 1 if rng.random() < 0.55 else 2
        for _, other in candidates[:n_links]:
            key = tuple(sorted((s["id"], other["id"])))
            if key in link_keys:
                continue
            link_keys.add(key)
            ltype = "corridor"
            if rng.random() < 0.12:
                ltype = "unstable"
            new_links.append({
                "id": uid(),
                "fromId": s["id"],
                "toId": other["id"],
                "type": ltype,
                "notes": f"{TAG} fringe link",
            })

    # Quests on interesting EXP systems
    spicy = [s for s in new_systems if s.get("spaceObjects")]
    rng.shuffle(spicy)
    new_quests = []
    for s, (title, summary, detail) in zip(spicy[:14], QUEST_TEMPLATES + QUEST_TEMPLATES):
        qid = uid()
        new_quests.append({
            "id": qid,
            "name": f"EXP · {title}",
            "summary": summary,
            "detail": detail,
            "systemId": s["id"],
            "status": "active",
        })
        s["questId"] = qid
        if "quest" not in (s.get("spaceObjects") or []):
            # keep poi list; quest marker uses questsAtSystem
            pass

    # Pirate / scavenger fleets
    new_fleets = []
    dens = [s for s in new_systems if "pirate" in (s.get("spaceObjects") or [])][:6]
    for s in dens:
        new_fleets.append({
            "id": uid(),
            "name": f"EXP · Рейд {s['name']}",
            "factionId": s.get("ownerFactionId") or "faction_pirates",
            "systemId": s["id"],
            "kind": "combat",
            "composition": [
                {"type": "рейдер", "count": rng.randint(1, 3)},
                {"type": "катер", "count": rng.randint(2, 5)},
            ],
            "stance": "attack",
            "route": [],
        })

    # Caravans between trader hubs and nearest core/nomad hub-ish
    new_caravans = []
    hubs = [s for s in new_systems if s.get("trafficHub")]
    for h in hubs[:4]:
        dest, _ = nearest(anchors, h["x"], h["y"])
        if not dest:
            continue
        new_caravans.append({
            "id": uid(),
            "name": f"EXP · Караван {h['name']}",
            "fromSystemId": h["id"],
            "toSystemId": dest["id"],
            "progress": round(rng.random() * 0.7, 2),
            "factionId": h.get("ownerFactionId") or "faction_free_traders",
        })

    # Assign sector by point-in-polygon if sectors exist
    def in_poly(x, y, poly):
        n = len(poly) // 2
        if n < 3:
            return False
        inside = False
        j = n - 1
        for i in range(n):
            xi, yi = poly[i * 2], poly[i * 2 + 1]
            xj, yj = poly[j * 2], poly[j * 2 + 1]
            inter = (yi > y) != (yj > y) and x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
            if inter:
                inside = not inside
            j = i
        return inside

    for s in new_systems:
        for sec in world.get("sectors") or []:
            poly = sec.get("polygon") or []
            if in_poly(s["x"], s["y"], poly):
                s["sectorId"] = sec["id"]
                break

    world["systems"].extend(new_systems)
    world["links"].extend(new_links)
    world["quests"] = (world.get("quests") or []) + new_quests
    world["fleets"] = (world.get("fleets") or []) + new_fleets
    world["caravans"] = (world.get("caravans") or []) + new_caravans

    meta = world.setdefault("meta", {})
    note = meta.get("notes") or ""
    tag = f"[EXP +{len(new_systems)} wild]"
    if "[EXP" in note:
        import re
        note = re.sub(r"\[EXP[^\]]*\]", tag, note)
    else:
        note = (note + " " + tag).strip()
    meta["notes"] = note
    meta["updatedAt"] = __import__("datetime").datetime.utcnow().isoformat() + "Z"

    CAMPAIGN.write_text(json.dumps(world, ensure_ascii=False, indent=2), encoding="utf-8")

    if PUBLISHED.exists():
        pub = json.loads(PUBLISHED.read_text(encoding="utf-8"))
        # Full replace of EXP pieces from campaign
        pub_old = {s["id"] for s in pub.get("systems", []) if (s.get("notes") or "").startswith(TAG)}
        pub["systems"] = [s for s in pub.get("systems", []) if s["id"] not in pub_old]
        pub["systems"].extend(new_systems)
        pub["links"] = [
            L for L in pub.get("links", [])
            if L.get("fromId") not in pub_old and L.get("toId") not in pub_old
            and not (L.get("notes") or "").startswith(TAG)
        ]
        pub["links"].extend(new_links)
        pub["quests"] = [q for q in pub.get("quests") or [] if not str(q.get("name", "")).startswith("EXP ·")]
        pub["quests"].extend(new_quests)
        pub["fleets"] = [f for f in pub.get("fleets") or [] if not str(f.get("name", "")).startswith("EXP ·")]
        pub["fleets"].extend(new_fleets)
        pub["caravans"] = [c for c in pub.get("caravans") or [] if not str(c.get("name", "")).startswith("EXP ·")]
        pub["caravans"].extend(new_caravans)
        for nf in NEW_FACTIONS:
            if not any(f["id"] == nf["id"] for f in pub.get("factions", [])):
                pub.setdefault("factions", []).append(nf)
        pub["meta"] = world["meta"]
        PUBLISHED.write_text(json.dumps(pub, ensure_ascii=False, indent=2), encoding="utf-8")

    report = {
        "added_systems": len(new_systems),
        "added_links": len(new_links),
        "quests": len(new_quests),
        "fleets": len(new_fleets),
        "caravans": len(new_caravans),
        "total_systems": len(world["systems"]),
        "owners": {},
        "sample": [{"name": s["name"], "pois": s["spaceObjects"], "owner": s["ownerFactionId"]} for s in new_systems[:12]],
    }
    from collections import Counter
    report["owners"] = dict(Counter(s["ownerFactionId"] or "neutral" for s in new_systems))
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
