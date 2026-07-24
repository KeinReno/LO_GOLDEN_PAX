# -*- coding: utf-8 -*-
"""
Import NOMAD_RPG galaxy canvas into LO GOLDEN PAX campaign,
placed substantially south of existing systems.
"""
from __future__ import annotations

import json
import re
import uuid
from collections import defaultdict
from pathlib import Path

NOMAD_GAL = Path(r"D:/NOMAD_RPG") / "ГАЛАКТИКА"
CAMPAIGN = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/public/campaigns/lo_golden_pax.json")
PUBLISHED = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/data/published.json")
REPORT = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/tmp/nomad_import_report.json")

SCHEMA_TAG = "nomad_rpg"
WIKI = re.compile(r"\[\[([^\]]+)\]\]")
SYS_PREFIX = re.compile(r"^Система\s+", re.I)

# Distinct colours for NOMAD polities (avoid Belator gold / Turon red clash)
FACTION_COLORS = [
    "#5b8def",
    "#c45c9a",
    "#3cb8a0",
    "#d4a05a",
    "#8e6bcf",
    "#6a9e3a",
    "#b85c5c",
    "#4a90a4",
    "#a67c52",
    "#7a8a9a",
    "#e07a3a",
    "#5c6bc0",
]


def uid() -> str:
    return str(uuid.uuid4())


def parse_label(raw: str) -> tuple[str | None, str | None]:
    """Return (faction_name, system_name) from canvas text."""
    text = (raw or "").strip()
    m = WIKI.search(text)
    label = m.group(1).strip() if m else text.split("\n")[0].strip()
    if not label or len(label) > 80:
        return None, None
    # Skip legends / non-systems
    low = label.lower()
    if any(x in low for x in ("легенда", "карта:", "неизучен", "группа")):
        return None, None
    if "система" not in low and " - " not in label:
        # lone name might still be a system if short
        if len(label) < 3 or ":" in label:
            return None, None
        return None, label

    faction = None
    name = label
    if " - " in label:
        left, right = label.split(" - ", 1)
        faction = left.strip() or None
        name = right.strip()
    name = SYS_PREFIX.sub("", name).strip()
    if not name or len(name) < 2:
        return None, None
    if name.lower().startswith("легенда"):
        return None, None
    return faction, name


def load_planets_for(system_name: str) -> list[dict]:
    planets_dir = NOMAD_GAL / "Планеты"
    if not planets_dir.exists():
        return []
    # Match Alfheim-1.md, Alqualondë-2.md etc.
    found: list[Path] = []
    for p in planets_dir.glob("*.md"):
        stem = p.stem  # Alfheim-1
        base = stem.rsplit("-", 1)[0]
        if base.lower() == system_name.lower():
            found.append(p)
    found.sort(key=lambda p: p.stem)
    planets = []
    for i, p in enumerate(found):
        body = p.read_text(encoding="utf-8")
        # First heading as name if present
        title = system_name + (f"-{i+1}" if len(found) > 1 else "")
        hm = re.search(r"^#\s+(.+)$", body, re.M)
        if hm:
            title = hm.group(1).strip()[:80]
        planets.append(
            {
                "id": uid(),
                "name": title,
                "type": "rocky",
                "climate": "temperate",
                "population": 0,
                "raceComposition": [],
                "resources": [],
                "habitable": True,
                "colonizable": True,
                "surveyed": True,
                "colonyType": "none",
                "orbitIndex": i + 1,
                "size": 1,
                "notes": f"NOMAD · {p.name}",
                "surfaceSlots": 8,
                "orbitalSlots": 4,
                "surfaceBuildings": [],
                "orbitalBuildings": [],
                "ownerFactionId": None,
                "coOwnerFactionIds": [],
                "contested": False,
            }
        )
    return planets


def make_default_planet(system_name: str) -> dict:
    return {
        "id": uid(),
        "name": f"Мир {system_name}",
        "type": "rocky",
        "climate": "temperate",
        "population": 0,
        "raceComposition": [],
        "resources": [],
        "habitable": True,
        "colonizable": True,
        "surveyed": True,
        "colonyType": "none",
        "orbitIndex": 1,
        "size": 1,
        "notes": "NOMAD import",
        "surfaceSlots": 8,
        "orbitalSlots": 4,
        "surfaceBuildings": [],
        "orbitalBuildings": [],
        "ownerFactionId": None,
        "coOwnerFactionIds": [],
        "contested": False,
    }


def faction_slug(name: str) -> str:
    """ASCII-safe id fragment from faction display name."""
    # Prefer latin letters; otherwise stable hash
    latin = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    if len(latin) >= 3 and re.search(r"[a-z]", latin):
        return latin[:40]
    h = uuid.uuid5(uuid.NAMESPACE_URL, f"nomad-faction:{name}").hex[:10]
    return f"f_{h}"


def main() -> None:
    canvas_path = next(NOMAD_GAL.glob("*.canvas"))
    canvas = json.loads(canvas_path.read_text(encoding="utf-8"))
    nodes = {n["id"]: n for n in canvas["nodes"]}

    # --- parse systems ---
    systems_raw = []
    for n in canvas["nodes"]:
        if n.get("type") != "text":
            continue
        faction, name = parse_label(n.get("text") or "")
        if not name:
            continue
        cx = n["x"] + n.get("width", 250) / 2
        cy = n["y"] + n.get("height", 60) / 2
        # drop far-right legend outliers
        if cx > 8000:
            continue
        systems_raw.append(
            {
                "node_id": n["id"],
                "name": name,
                "faction": faction,
                "x": cx,
                "y": cy,
            }
        )

    # dedupe names (keep first)
    seen_names: set[str] = set()
    systems_raw2 = []
    for s in systems_raw:
        key = s["name"].lower()
        if key in seen_names:
            s["name"] = f"{s['name']}·{s['node_id'][:4]}"
        seen_names.add(s["name"].lower())
        systems_raw2.append(s)
    systems_raw = systems_raw2

    # --- GMap bounds ---
    world = json.loads(CAMPAIGN.read_text(encoding="utf-8"))
    # Remove previous NOMAD import if re-running
    old_sys = [s for s in world["systems"] if (s.get("notes") or "").startswith("NOMAD")]
    old_ids = {s["id"] for s in old_sys}
    if old_ids:
        world["systems"] = [s for s in world["systems"] if s["id"] not in old_ids]
        world["links"] = [
            L
            for L in world.get("links", [])
            if L.get("fromId") not in old_ids and L.get("toId") not in old_ids
        ]
        world["sectors"] = [
            sec
            for sec in world.get("sectors", [])
            if not (sec.get("notes") or "").startswith("NOMAD")
        ]
        world["factions"] = [
            f
            for f in world.get("factions", [])
            if not str(f.get("id", "")).startswith("faction_nomad_")
        ]

    gxs = [s["x"] for s in world["systems"]]
    gys = [s["y"] for s in world["systems"]]
    g_xmin, g_xmax = min(gxs), max(gxs)
    g_ymin, g_ymax = min(gys), max(gys)
    g_cx = (g_xmin + g_xmax) / 2

    nxs = [s["x"] for s in systems_raw]
    nys = [s["y"] for s in systems_raw]
    n_xmin, n_xmax = min(nxs), max(nxs)
    n_ymin, n_ymax = min(nys), max(nys)
    n_w = max(n_xmax - n_xmin, 1)
    n_h = max(n_ymax - n_ymin, 1)

    # Fit NOMAD into ~same width as GMap, place well below
    target_w = (g_xmax - g_xmin) * 1.05
    scale = target_w / n_w
    gap = 1400  # substantial vertical gap
    # After scale, shift so top of NOMAD block = g_ymax + gap
    # Canvas Y grows downward like GMap Y (south).

    def xform(x: float, y: float) -> tuple[float, float]:
        nx = (x - n_xmin) * scale
        ny = (y - n_ymin) * scale
        # center under GMap
        out_x = g_cx - target_w / 2 + nx
        out_y = g_ymax + gap + ny
        return out_x, out_y

    # --- factions ---
    faction_names = sorted({s["faction"] for s in systems_raw if s["faction"]})
    faction_id_by_name: dict[str, str] = {}
    new_factions = []
    for i, fname in enumerate(faction_names):
        fid = f"faction_nomad_{faction_slug(fname)}"
        # ensure unique
        base = fid
        k = 1
        while any(f["id"] == fid for f in world["factions"] + new_factions):
            fid = f"{base}_{k}"
            k += 1
        faction_id_by_name[fname] = fid
        new_factions.append(
            {
                "id": fid,
                "name": f"{fname} (NOMAD)",
                "color": FACTION_COLORS[i % len(FACTION_COLORS)],
                "password": f"nomad{i+1}",
                "kind": "state",
                "notes": "Импорт из NOMAD_RPG",
            }
        )

    # --- sectors from named groups ---
    new_sectors = []
    sector_for_point: list[tuple[dict, dict]] = []  # (sector, bbox)
    for n in canvas["nodes"]:
        if n.get("type") != "group":
            continue
        label = (n.get("label") or "").strip()
        if not label or label.startswith("Группа") or "Неизучен" in label:
            continue
        if not label.startswith("Сектор"):
            continue
        # transform bbox corners
        x0, y0 = xform(n["x"], n["y"])
        x1, y1 = xform(n["x"] + n["width"], n["y"] + n["height"])
        poly = [
            x0, y0,
            x1, y0,
            x1, y1,
            x0, y1,
        ]
        sec = {
            "id": uid(),
            "name": f"{label} · NOMAD",
            "polygon": poly,
            "color": FACTION_COLORS[len(new_sectors) % len(FACTION_COLORS)],
            "notes": "NOMAD sector",
        }
        new_sectors.append(sec)
        sector_for_point.append(
            (sec, {"xmin": min(x0, x1), "xmax": max(x0, x1), "ymin": min(y0, y1), "ymax": max(y0, y1)})
        )

    # --- build systems ---
    node_to_sys: dict[str, str] = {}
    new_systems = []
    for s in systems_raw:
        ox, oy = xform(s["x"], s["y"])
        fid = faction_id_by_name.get(s["faction"]) if s["faction"] else None
        planets = load_planets_for(s["name"])
        if not planets:
            planets = [make_default_planet(s["name"])]
        sid = uid()
        node_to_sys[s["node_id"]] = sid
        sector_id = None
        for sec, bb in sector_for_point:
            if bb["xmin"] <= ox <= bb["xmax"] and bb["ymin"] <= oy <= bb["ymax"]:
                sector_id = sec["id"]
                break
        new_systems.append(
            {
                "id": sid,
                "name": s["name"],
                "x": ox,
                "y": oy,
                "kind": "stellar",
                "stars": [{"class": "G", "luminosity": 1}],
                "planets": planets,
                "stations": [],
                "resources": [],
                "ownerFactionId": fid,
                "sectorId": sector_id,
                "locked": False,
                "isCapital": False,
                "poiType": "none",
                "spaceObjects": [],
                "visibleToFactionIds": [],
                "activity": "none",
                "tradeWithSystemId": None,
                "notes": f"NOMAD · {s['faction'] or 'нейтрал'}",
                "scannerDeadZone": False,
                "blockaded": False,
                "coOwnerFactionIds": [],
                "contested": False,
                "anomalyMotion": None,
                "questId": None,
                "trafficHub": False,
            }
        )

    # --- links ---
    new_links = []
    link_keys: set[tuple[str, str]] = set()
    for e in canvas.get("edges", []):
        a, b = e.get("fromNode"), e.get("toNode")
        sa, sb = node_to_sys.get(a), node_to_sys.get(b)
        if not sa or not sb or sa == sb:
            continue
        key = tuple(sorted((sa, sb)))
        if key in link_keys:
            continue
        link_keys.add(key)
        new_links.append(
            {
                "id": uid(),
                "fromId": sa,
                "toId": sb,
                "type": "corridor",
            }
        )

    world["factions"] = world.get("factions", []) + new_factions
    world["sectors"] = world.get("sectors", []) + new_sectors
    world["systems"] = world.get("systems", []) + new_systems
    world["links"] = world.get("links", []) + new_links
    world.setdefault("meta", {})["name"] = world["meta"].get("name") or "LO GOLDEN PAX"
    # annotate
    note = world["meta"].get("notes") or ""
    tag = f"[imported NOMAD {len(new_systems)} systems]"
    if tag not in note:
        world["meta"]["notes"] = (note + " " + tag).strip()

    CAMPAIGN.write_text(json.dumps(world, ensure_ascii=False, indent=2), encoding="utf-8")

    # Also refresh published if it looks like same campaign (optional sync of systems only — skip if different)
    # Safer: only update campaign file; user reloads lore / republishes.

    nys2 = [s["y"] for s in new_systems]
    nxs2 = [s["x"] for s in new_systems]
    report = {
        "source_canvas": canvas_path.name,
        "imported_systems": len(new_systems),
        "imported_links": len(new_links),
        "imported_factions": len(new_factions),
        "imported_sectors": len(new_sectors),
        "removed_previous_nomad": len(old_ids),
        "gmap_y_max": g_ymax,
        "nomad_y_range": [min(nys2), max(nys2)],
        "nomad_x_range": [min(nxs2), max(nxs2)],
        "scale": scale,
        "gap": gap,
        "faction_names": faction_names,
        "sample_systems": [
            {"name": s["name"], "x": round(s["x"], 1), "y": round(s["y"], 1), "owner": s["ownerFactionId"]}
            for s in new_systems[:12]
        ],
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
