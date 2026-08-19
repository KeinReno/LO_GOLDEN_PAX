---
name: save-systems
description: Save/load design — serialize data not objects, version field, atomic write, migrate old saves. Use for GMap campaign zip/json, tableRevision, published.json, backups.
---

Source: [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/main/skills/disciplines/save-systems).

# Save systems (GMap)

Authoritative state is the **board JSON** (`published.json` / client `world`), not Pixi objects.

- Stamp schema/`tableRevision`. Client save that overwrites server paint without reload is a data-loss bug.
- Write: temp + rename; keep backup (`backupTurnSnapshot`). Windows rename is not always atomic — keep `.bak`.
- Load: version → migrate → validate. Refuse newer-than-code saves.
- Don't treat GM "Сохранить" as a merge — it's a full world PUT. After server-side paint, reload table into `worldStore`.
- Never run a tick as a "save test" on the live board.

Related: `tableStore.mjs` `writeLiveBoard`, cockpit backups (list ≠ restore).
