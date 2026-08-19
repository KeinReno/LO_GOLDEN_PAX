# agent-tasks

Координация агентов без раздувания always-on контекста.

| Файл | Зачем |
|------|--------|
| `STATUS.md` | Живой статус сессии (≤~120 строк) |
| `MEMORY.md` | Короткие устойчивые факты |
| `TECH_SOCKETS_SPEC.md` | Спецификация слотов/сокетов ресурсов в технологиях |
| `CURRENCY_UNIONS_AND_EXCHANGE_SPEC.md` | Спецификация валютных союзов, валютных сделок и пега |
| `COURT_NPC_TASKS_SPEC.md` | Спецификация двора, постов NPC, задач и модификаторов |
| `DEPOSIT_ALIASES_SPEC.md` | Контентная правка: 40 русских названий депозитов без alias (366 инстансов, 228 планет) — для отдельного агента |
| `RP_CHAT_CONSOLIDATION_SPEC.md` | Слияние RpGmDesk+RpChat в один GM-чат (intent-attach, chapter/episode admin) + UX-правки RpStage — для отдельного агента |
| `SCIENCE_ORBIT_REDESIGN_SPEC.md` | Пересборка экрана "Наука": 3-ярусная раскладка, орбита направлений (d3-hierarchy), фазы 0-4 по прогрессу, силуэт-кластеры, drag-to-combine вместо кнопки "Прорыв" — владелец подтвердил направление, см. [дизайн-канвас](https://claude.ai/code/artifact/1cb5dfb4-9f7f-4fc0-a866-8efe2a1c5d31) |
| `FILE_DECOMPOSITION_SPEC.md` | Продолжение разбивки крупных файлов (cardBattle.mjs 2932 строки и др.) — для отдельного Claude, пока владелец экономит лимиты Cursor |
| `AUDIT_PARITY_GMAP_V05.md` | Аудит паритета GMap vs Golden_PAX_v0_5 спек (2026-08-16); один найденный баг (`standDown`) исправлен 2026-08-17 |
| `GAME_DATA_AUDIT_2026-08-18.md` | Аудит контента + живого стола (ход 17): модули/руды, расы, бои, карта; реестр AUD-01…33 и план волн W0–W6 |
| `_archive/status/` | Старые STATUS-блоки |
| `knowledge/patterns.md` | Классы сбоев агента (не тикеты) |
| `knowledge/improvement-backlog.md` | Идеи улучшений дисциплины |

Канон проекта: корневой `PROJECT.md`. Skills: `.cursor/skills/` (не always-on).
