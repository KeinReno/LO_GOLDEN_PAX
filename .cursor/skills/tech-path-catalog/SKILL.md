---
name: tech-path-catalog
description: >-
  Authors GMap path-signature technologies for empty RoleScore clusters
  (offensive, defensive, mobility, cognitive, biological, exotic). Use when
  filling tech_paths.json clusters, adding breakthrough/signature techs,
  catalog slice, or delegating tech content. Prefer retagging live techs over
  inventing. Never hardcode tech ids in UI. Read before editing
  technologies.json for paths. One path per chat.
---

# Path-signature catalog (content agents)

Продукт = **GMap**. Не v0.5 UI. Не доктрины Воплощения. Не новые расы.

Полный протокол: [reference.md](reference.md).  
Хэнд-офф папка: `GMap/docs/agents-content/PATH_SIGNATURE_CATALOG/`.

## Задача одним предложением

Игрок копит RoleScore → платит cognitio за Прорыв → получает **живые** технологии пути. Сейчас кластеры 6 ролей пустые — Прорыв врёт. Закрой **один** путь за чат.

## Порядок (не пропускать)

1. Прочитать `TASKS.md` этой папки целиком.
2. Назначенный `PATH_ID` — единственный скоуп. Остальные пути не трогать.
3. **Исследование до записи:** reference.md §Исследование. Не выдумывать лор и id.
4. Решение по каждой технологии: **retag live** / **новая** / **не класть**. Записать почему.
5. Правка JSON (не UI, не новый effect type).
6. `cd GMap && npm run validate:tech`
7. Вернуть отчёт из TASKS §Отчёт. Не коммитить без просьбы владельца.

## Жёсткие запреты

- Целый `technologies.json` / `app.css` / sqlite / `MapCanvas.tsx`
- `raceLock` на путь (только `tech_paths.raceAffinity`, и то не выдумывать без улики в расе)
- Era 1–2 с `researchPath` (песочница)
- `generateTechCatalog.mjs --cluster` на этот проход
- Новая валюта, новый экран, Пути Силы в кластер, Доктрины
- Хардкод tech/unit id в `.tsx`/`.mjs`
- Здания/юниты из §10.1, если их нет в JSON — **не создавать** в этом проходе (только техи)

## Якорь качества

Живой кластер `structural`: `tech.crystal_integration` (era 3, cognitio 42, реальные effects). Новая сигнатура не сильнее и не «пустее» этого якоря без записи в отчёте.
