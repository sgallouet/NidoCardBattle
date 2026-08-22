# NidoCardBattle audio contract

## Local pipeline

- SFX/environment generator: `D:\grok\stable-audio-3`
- Stable Audio CLI: `D:\grok\stable-audio-3\.venv\Scripts\stable-audio.exe`
- Authored music generator: `D:\Grok\ACE-Step-1.5`
- ACE-Step Python: `D:\Grok\ACE-Step-1.5\.venv\Scripts\python.exe`
- Candidate staging root: `D:\grok\stable-audio-3\outputs\nidocardbattle`
- Accepted runtime assets: repo-relative `assets\game\audio`
- Audio usage map: `assets\game\audio\AUDIO_MAP.md`

Do not generate directly into the repository. Generated files remain external candidates until accepted.

## Model selection

| Need | Model | Typical authored duration |
| --- | --- | --- |
| attack/impact/foley/UI/card sound | Stable Audio `small-sfx` | 0.15-1.5 s |
| spell, tactic, summon, creature/unit vocal | Stable Audio `small-sfx` | 0.4-3 s |
| capture/reward/countdown/victory sting | Stable Audio `small-sfx` | 0.5-5 s |
| environmental texture/ambience candidate | Stable Audio `small-sfx` | 8-30 s |
| authored menu/faction/battle music | ACE-Step `acestep-v15-sft` | 30-360 s |

Choose the shortest duration that can naturally contain the intended event and decay.

## Stable Audio SFX prompt contract

Start with `TrackType: SFX`. Describe one clear source/action, material or magical identity, perspective/distance, energy, and decay. Put important exclusions directly in the prompt.

Examples:

```text
TrackType: SFX, isolated fantasy strategy game impact, one heavy steel sword strike into an armored shield, compact metallic hit with a short resonant tail, close dry sound, no second strike, no footsteps, no voices, no music, no ambience
```

```text
TrackType: SFX, isolated undead tactical magic effect, one grave seal snapping shut around a battlefield hex, low spectral suction, brittle bone-like crack and brief dark magical decay, readable and compact, no explosion, no voice, no music, no ambience
```

```text
TrackType: SFX, isolated fantasy construction effect, one magical wooden-and-stone bridge rapidly forming across water, concise timber placement and stone locking accents with a small water response, no hammering loop, no voices, no music
```

```text
TrackType: SFX, isolated fantasy card game UI sound, one elegant card draw with paper slide and subtle magical shimmer, short clean decay, no second card, no voice, no music
```

Avoid vague prompts such as `sword sound`, `magic noise`, or `monster sound`. Avoid packing release, flight, impact, death, and reward into one file unless they are intentionally inseparable.

## SFX candidate command

Run from `D:\grok\stable-audio-3`. Generate at least two candidates with deterministic seeds:

```powershell
.\.venv\Scripts\stable-audio.exe --model small-sfx -p "<full prompt>" --duration 1.2 --seed 5101 -o outputs\nidocardbattle\candidates\event-a.mp3
.\.venv\Scripts\stable-audio.exe --model small-sfx -p "<full prompt>" --duration 1.2 --seed 15101 -o outputs\nidocardbattle\candidates\event-b.mp3
```

If both candidates share the same semantic defect, rewrite the prompt before trying more seeds.

## Technical gates

Runtime candidate target:

- MP3;
- 44.1 kHz;
- stereo;
- finite decoded samples;
- zero full-scale clipped samples;
- decoded peak no higher than -1 dBFS;
- meaningful RMS and crest factor;
- clean beginning and natural ending for one-shots;
- lowercase kebab-case filename matching its intended audio-map identifier.

Validator profiles are `impact`, `footstep`, `ui`, `creature`, `sting`, `ambient`, and `music`.

Example:

```powershell
D:\grok\stable-audio-3\.venv\Scripts\python.exe `
  .agents\skills\nidocardbattle-audio-pipeline\scripts\validate_game_audio.py `
  D:\grok\stable-audio-3\outputs\nidocardbattle\candidates\grave-lock-a.mp3 `
  --kind impact
```

Metrics do not prove semantic correctness. Audition whenever playback is available.

## ACE-Step authored music

Use the bundled wrapper rather than writing new inference code:

```powershell
$aiVariationPlan = "D:\grok\stable-audio-3\outputs\nidocardbattle\plans\battle-main.json"
.agents\skills\nidocardbattle-audio-pipeline\scripts\generate_ace_music.ps1 `
  -Name battle-main `
  -Caption "instrumental colorful modern fantasy tactical battle theme, memorable original motif, energetic but sustainable beneath strategy gameplay, no vocals, no choir" `
  -VariationsFile $aiVariationPlan -Duration 75 -Seed 812700
```

Create the variation JSON immediately before generation. It must contain exactly five unique objects and should compare five genuinely useful creative directions for the current scene rather than a reusable fixed style list.

```json
[
  {
    "label": "AI-chosen descriptive name",
    "prompt": "candidate-specific composition, ensemble, rhythm, harmony, intensity, and production direction",
    "structure": "[candidate-specific instrumental section plan]",
    "bpm": 112,
    "keyscale": "D Minor",
    "timesignature": "4/4"
  }
]
```

The wrapper uses the known-good local RTX 3080 profile inherited from the WorldXplore pipeline:

- DiT `acestep-v15-sft`;
- LM `acestep-5Hz-lm-0.6B`;
- sequential batch size 1;
- 50 inference steps;
- guidance 7.0;
- shift 3.0;
- ODE sampler;
- ADG disabled;
- experimental DCW disabled;
- CPU offload enabled as needed for the 10 GB GPU;
- instrumental mode;
- deterministic consecutive seeds;
- 48 kHz stereo FLAC masters;
- 44.1 kHz stereo VBR MP3 audition files with encoding headroom.

Do not use generic ACE-Step SFT defaults. In particular, do not change the accepted `shift=3.0` / `dcw_enabled=False` combination casually; the WorldXplore pipeline found that bad defaults could produce broadband accelerated-sounding output while still looking superficially valid.

Candidate sets are written under:

`D:\grok\stable-audio-3\outputs\nidocardbattle\candidates\ace-step-music`

Generation creates `selection.json` with integration blocked. Present all five numbered MP3s to the user and ask which exact three to keep. Do not integrate before explicit selection.

Record selection with:

```powershell
D:\Grok\ACE-Step-1.5\.venv\Scripts\python.exe `
  .agents\skills\nidocardbattle-audio-pipeline\scripts\record_ace_music_selection.py `
  <candidate-dir> --keep 1 3 5
```

If one candidate alone fails validation, regenerate only that index:

```powershell
D:\Grok\ACE-Step-1.5\.venv\Scripts\python.exe `
  .agents\skills\nidocardbattle-audio-pipeline\scripts\repair_ace_music_candidate.py `
  <candidate-dir> --index 4 --seed 912704
```

## Runtime integration guidance

NidoCardBattle does not yet need a large audio framework. Start small.

- Accepted files go under `assets/game/audio/sfx`, `assets/game/audio/ambience`, or `assets/game/audio/music`.
- Register every accepted file and its exact event in `assets/game/audio/AUDIO_MAP.md`.
- When enough sounds accumulate, introduce a compact data-driven catalog rather than embedding raw paths throughout gameplay code.
- Attack audio should resolve at attack impact/damage resolution.
- Assist audio should be distinguishable but lighter than the primary impact.
- Retaliation should sound at retaliation resolution, not when the attack is merely selected.
- Summon audio plays only after a legal summon succeeds.
- Grave Lock and Build Bridge audio plays only after the tactic resolves successfully.
- Capture audio plays at end-of-turn capture resolution.
- Victory countdown cues should correspond to actual checkpoints.
- Failed, canceled, or illegal actions must never play success audio.

## Mixing and repetition

Use the nearest accepted sound as a loudness reference once the library exists. Do not solve a low in-game volume by baking excessive gain into the file.

Use short cooldowns and small pools for impacts/footsteps when overlap is plausible. UI and long stings generally use pool 1. Do not trigger repeated sounds from an update loop.

Keep battle music beneath decision-making and SFX. The game should remain readable on phone speakers as well as headphones.

## Failure diagnosis

| Symptom | Likely cause | Corrective action |
| --- | --- | --- |
| harsh constant noise | decoder output clipped/collapsed | regenerate with the known-good local pipeline; do not repair the clipped MP3 |
| tiny click or missing attack | over-aggressive crop | regenerate or preserve pre-roll and natural decay |
| MP3 peak above 0 dBFS | insufficient encoding headroom | re-encode from a clean source with headroom |
| correct metrics, wrong sound | prompt drift | rewrite source/action/material wording and audition new deterministic seeds |
| repeated machine-gun playback | trigger in update loop/cooldown too short | move playback to the lifecycle edge and add cooldown/pooling |
| sound never plays | bad asset path/preload/event branch | trace AUDIO_MAP to loading to exact gameplay trigger |
