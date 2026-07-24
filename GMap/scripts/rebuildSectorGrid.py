# -*- coding: utf-8 -*-
"""Replace political NOMAD sectors with a faint 3×3 geographic grid over the whole map."""
from __future__ import annotations

import json
import uuid
from pathlib import Path

CAMPAIGN = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/public/campaigns/lo_golden_pax.json")
PUBLISHED = Path(r"c:/Users/Reno/Desktop/LO_GOLDEN_PAX/GMap/data/published.json")

NAMES = [
    ["Северо-запад", "Север", "Северо-восток"],
    ["Запад", "Центр", "Восток"],
    ["Юго-запад", "Юг", "Юго-восток"],
]
# Subtle cool greys — visibility comes from drawSectors alpha, not saturated fills
COLORS = [
    ["#7a8494", "#808a98", "#7a8494"],
    ["#768090", "#8a94a2", "#768090"],
    ["#7a8494", "#808a98", "#7a8494"],
]


def uid() -> str:
    return str(uuid.uuid4())


def rebuild(world: dict) -> dict:
    systems = world.get("systems") or []
    if not systems:
        raise SystemExit("no systems")

    xs = [s["x"] for s in systems]
    ys = [s["y"] for s in systems]
    pad = 420.0
    xmin, xmax = min(xs) - pad, max(xs) + pad
    ymin, ymax = min(ys) - pad, max(ys) + pad
    # Snap grid so the gulf between core (north) and Nomad (south) sits in the middle row
    # when possible: prefer equal thirds of the full bbox (matches user's red sketch).
    dx = (xmax - xmin) / 3.0
    dy = (ymax - ymin) / 3.0

    # Drop previous auto / NOMAD / Galivan sectors; keep hand-drawn if any without those tags
    kept = []
    for sec in world.get("sectors") or []:
        notes = sec.get("notes") or ""
        name = sec.get("name") or ""
        if notes.startswith("NOMAD") or notes.startswith("GRID3"):
            continue
        if "Галиван" in name or name.startswith("Земли ") or name.startswith("Сектор Галиван"):
            continue
        if name in {
            "Северо-запад",
            "Север",
            "Северо-восток",
            "Запад",
            "Центр",
            "Восток",
            "Юго-запад",
            "Юг",
            "Юго-восток",
            "Федерация Pax Terrialis",
            "Земли Вайсов",
            "Земли Винцепсов",
            "Земли Гничей",
            "Земли Дитвиров",
            "Королевства Зелёных Эланов",
            "Земли Йу",
            "Улей Кичир",
            "Земли Охи",
            "Нейтралитет Маркштейн",
            "Земли Тринов",
            "Кланы Туран",
            "Империя Эдэмонов",
        }:
            continue
        kept.append(sec)

    new_sectors = []
    cells = []  # (sector, x0,x1,y0,y1)
    for row in range(3):
        for col in range(3):
            x0 = xmin + col * dx
            x1 = xmin + (col + 1) * dx
            y0 = ymin + row * dy
            y1 = ymin + (row + 1) * dy
            poly = [x0, y0, x1, y0, x1, y1, x0, y1]
            sid = uid()
            sec = {
                "id": sid,
                "name": NAMES[row][col],
                "polygon": [round(v, 2) for v in poly],
                "color": COLORS[row][col],
                "notes": f"GRID3 · ряд {row + 1} · колонка {col + 1}",
            }
            new_sectors.append(sec)
            cells.append((sec, x0, x1, y0, y1))

    world["sectors"] = kept + new_sectors

    # Assign systems to containing cell (inclusive edges on max side for last cell)
    for s in systems:
        sx, sy = s["x"], s["y"]
        assigned = None
        for sec, x0, x1, y0, y1 in cells:
            # Use half-open intervals except last row/col
            col_ok = (x0 <= sx < x1) if x1 < xmax - 1e-6 else (x0 <= sx <= x1)
            row_ok = (y0 <= sy < y1) if y1 < ymax - 1e-6 else (y0 <= sy <= y1)
            # Simpler: inclusive all
            if x0 <= sx <= x1 and y0 <= sy <= y1:
                assigned = sec["id"]
                break
        s["sectorId"] = assigned

    return {
        "bbox": [round(xmin), round(ymin), round(xmax), round(ymax)],
        "sectors": [s["name"] for s in new_sectors],
        "assigned": sum(1 for s in systems if s.get("sectorId")),
        "total_systems": len(systems),
    }


def sync_published(campaign: dict) -> None:
    if not PUBLISHED.exists():
        return
    pub = json.loads(PUBLISHED.read_text(encoding="utf-8"))
    # Replace all sectors with campaign sectors (grid is global)
    pub["sectors"] = campaign.get("sectors", [])
    # Sync sectorId on systems by id
    camp_by_id = {s["id"]: s for s in campaign.get("systems", [])}
    for s in pub.get("systems", []):
        c = camp_by_id.get(s["id"])
        if c:
            s["sectorId"] = c.get("sectorId")
    PUBLISHED.write_text(json.dumps(pub, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    world = json.loads(CAMPAIGN.read_text(encoding="utf-8"))
    report = rebuild(world)
    CAMPAIGN.write_text(json.dumps(world, ensure_ascii=False, indent=2), encoding="utf-8")
    sync_published(world)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
