# Staff radio cues — credits

Live files: `public/audio/sfx/{id}__01.wav` … `__04.wav`. Default `__01`. Heroes `__01`/`__02`.

## Current source

Recorded objects, not oscillators. Treat: crystal/gold attack + pitched-down bowl/canister as low body, HP ~55 Hz, bass shelf, deeper plate + stereo slap (Kpow / Banner Saga). Сборка: `scripts/assembleStaffRecorded.mjs`.

Raw cuts in `public/audio/src/` from **BigSoundBank / Joseph Sardin**, CC0 (public domain):

| file | sound # | what |
|---|---|---|
| `1330_wine_cheers.ogg` | 1330 | crystal glass clink |
| `2886_glass_clink.ogg` | 2886 | glass + cutlery ring |
| `1204_glass_table.ogg` | 1204 | glass placed (HP cuts wood body) |
| `0358_chain.ogg` | 358 | small metal chain |
| `0053_metal_lid.ogg` | 53 | metal box lid |
| `1410_book.ogg` | 1410 | book close (paper) |
| `1110_bowl1.ogg` | 1110 | Tibetan bowl struck (low body, pitched down) |
| `2553_bowl2.ogg` | 2553 | bowl struck #2 |
| `2554_bowl3.ogg` | 2554 | bowl struck #3 (short thump) |
| `0796_canister.ogg` | 796 | metal canister (stamp weight) |

Attribution not required by CC0; listed anyway.

Not Kenney, Mixkit, jsfxr, OST, or `synthStaffSfx.mjs` / `renderStaffFoley.mjs`.

## ElevenLabs

Still valid from a permitted network: `ELEVENLABS_API_KEY=... node scripts/genSfxEleven.mjs`  
Prompts in `src/audio/cues.json` now describe gold/crystal, not hiss.
