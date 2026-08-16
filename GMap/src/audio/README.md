# src/audio

Staff-radio SFX for the live table. Chrome is silent. Music beds are out of scope.

Sonic family (memorable, meditative, native materials): `SONIC_BIBLE.md`.
Credits / source: `GMap/public/audio/CREDITS.md`. Brief: `GMap/docs/SOUND_DESIGNER_AGENT_BRIEF.md`.

Call `playStaffCue(id)` from session/UI events — not from MapCanvas redraw loops.

| id | GMap trigger |
|---|---|
| `radio_squelch` | new RP message (`rpNotify`) |
| `turn_advance` | `TurnStampHud` turn change |
| `contact_alert` | new active engagement (live poll) |
| `seal_stamp` | `HoldButton` confirm |
| `token_drop` | `flashSystem` (card/order drop) |

Assets: `public/audio/sfx/*__01..04.wav`. Preview: `/audio/index.html`.

```text
node scripts/assembleStaffRecorded.mjs
ELEVENLABS_API_KEY=... node scripts/genSfxEleven.mjs
```
