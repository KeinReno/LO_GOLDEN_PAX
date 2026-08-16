# src/audio

Sound effects and music, driven by the same `GameEvent` bus as `src/fx` (see `src/fx/eventBus.ts`). Never called directly from renderers or React components — a game event fires, this subsystem decides what (if anything) to play.

Keep a data-driven mapping from `GameEvent.type` to asset (`cues.json`), rather than a switch that grows unbounded.

## Staff-radio cues (SFX only — do not mix with music beds)

Five interrupts, chrome stays silent. Token material is **brass on glass**, not wood.

| id | when |
|---|---|
| `radio_squelch` | shared channel-open attack |
| `turn_advance` | turn changed (often offscreen) |
| `contact_alert` | combat/capture on an owned system not in view |
| `seal_stamp` | irreversible HoldButton commit |
| `token_drop` | card/force dropped onto a system |

Prompts: `cues.json`. Local stand-in WAVs (4 variants each):

```text
node scripts/synthStaffSfx.mjs
```

→ `client-web/public/audio/sfx/*.wav`

ElevenLabs (needs `ELEVENLABS_API_KEY` on a **permitted** network; RU/BY are blocked by their ToS — do not proxy around it from this repo):

```text
node scripts/genSfxEleven.mjs
```

Playback is still the event-bus stub (`startAudioSubsystem`). Wire a cue → file map after picking variants.
