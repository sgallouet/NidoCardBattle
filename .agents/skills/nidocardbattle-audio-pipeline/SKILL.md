---
name: nidocardbattle-audio-pipeline
description: "Generate, validate, repair, and integrate NidoCardBattle sound effects, UI sounds, tactical ability audio, ambience, and music with local Stable Audio 3 and ACE-Step 1.5 pipelines. Use whenever a gameplay element creates an important audible event or when game audio needs generation, replacement, timing, cataloging, or QA."
---

# NidoCardBattle Audio Pipeline

Use local AI to create game audio, but treat every generated file as a candidate until it passes technical validation and semantic review. Read `references/audio-contract.md`, the relevant gameplay rules in `docs/rules/`, and `assets/game/audio/AUDIO_MAP.md` before generating or integrating audio.

## When to use this skill

Consider audio whenever a feature creates a meaningful player-perceived event, especially:

- card draw, card selection, card play, and tactic resolution;
- unit summon, movement, attack, retaliation, Assist, death, and special abilities;
- Commander damage, death, victory countdown, and victory;
- capture of Keeps, Forts, and Mana Wells;
- terrain-changing tactics such as Grave Lock, Build Bridge, Scorch, Fort construction, or future delayed site creation;
- menu/UI confirmation, warning, invalid-action feedback, and end-turn feedback;
- battlefield ambience and faction/battle music.

Do not add sound only because a feature exists. Add it when audio improves readability, weight, timing, mood, faction identity, or feedback without becoming repetitive noise.

## Local generators

- Use Stable Audio 3 `small-sfx` for SFX, foley, UI, creature/unit vocals, magical effects, impacts, short stings, and environmental textures.
- Use ACE-Step 1.5 SFT for authored music.
- Stage all generated candidates outside the repository under `D:\grok\stable-audio-3\outputs\nidocardbattle`.
- Copy only accepted runtime assets into `assets/game/audio/`.
- Never generate directly over a committed runtime asset.

## Required SFX workflow

1. Define the audio contract before generation: event meaning, exact playback trigger, source/material/faction identity, expected duration, overlap behavior, cooldown, in-game volume intent, and exclusions.
2. Write a precise Stable Audio prompt using the patterns in `references/audio-contract.md`.
3. Generate at least two deterministic candidates with different seeds.
4. Validate each candidate:

   ```powershell
   D:\grok\stable-audio-3\.venv\Scripts\python.exe .agents\skills\nidocardbattle-audio-pipeline\scripts\validate_game_audio.py <candidate.mp3> --kind <kind>
   ```

5. Audition candidates when audio playback is available. Automated metrics cannot prove semantic correctness.
6. Keep the best candidate only after it is technically valid and semantically correct.
7. Copy the accepted file into the appropriate `assets/game/audio/` subfolder and update `assets/game/audio/AUDIO_MAP.md`.
8. Add the smallest runtime playback integration needed for the exact gameplay/UI lifecycle event. Failed or canceled actions must not play success audio.

If the current environment cannot audition the candidate, clearly leave semantic audition as the remaining acceptance item rather than calling the asset polished.

## Authored music workflow

Use `scripts/generate_ace_music.ps1` for battle, faction, menu, or other authored music.

For every requested music cue, first create a JSON plan with exactly five substantially different arrangements chosen specifically for that scene. Do not use a fixed five-style template. Vary meaningful musical dimensions such as composition, instrumentation, rhythm, harmony, tempo, structure, intensity, or production aesthetic.

Example:

```powershell
$plan = "D:\grok\stable-audio-3\outputs\nidocardbattle\plans\battle-main.json"
.agents\skills\nidocardbattle-audio-pipeline\scripts\generate_ace_music.ps1 `
  -Name battle-main `
  -Caption "instrumental colorful modern fantasy tactical battle theme, memorable original motif, energetic but not exhausting beneath gameplay, no vocals, no choir" `
  -VariationsFile $plan -Duration 75 -Seed 812700
```

The variation file must contain exactly five unique objects:

```json
[
  {
    "label": "AI-chosen descriptive name",
    "prompt": "candidate-specific composition, arrangement, energy, and production direction",
    "structure": "[candidate-specific instrumental section plan]",
    "bpm": 112,
    "keyscale": "D Minor",
    "timesignature": "4/4"
  }
]
```

`label` and `prompt` are required. Other fields are optional.

The ACE-Step wrapper uses the known-good local SFT settings, creates lossless masters plus MP3 audition files, records deterministic seeds and hashes, refuses overwrite, and validates outputs.

Always present the five numbered audition files to the user and ask which exact three to keep. Do not copy, catalog, or wire any candidate into the game until the user explicitly selects three. Record that selection with:

```powershell
D:\Grok\ACE-Step-1.5\.venv\Scripts\python.exe `
  .agents\skills\nidocardbattle-audio-pipeline\scripts\record_ace_music_selection.py `
  <candidate-dir> --keep 1 3 5
```

Only integrate music when `selection.json` contains `integration_allowed: true`.

If exactly one ACE music candidate fails automated validation, preserve all passing candidates and regenerate only the rejected index with `repair_ace_music_candidate.py`. Never rerender a passing candidate merely to repair another one.

## NidoCardBattle audio direction

Favor a colorful, modern fantasy strategy identity with strong tactical readability. Human audio can lean toward polished metal, banners, wind, cavalry, warm arcane tones, and clean heroic accents. Undead audio can lean toward bone, grave-earth, spectral air, restrained dark magic, dry impacts, and unsettling but readable magical textures.

Keep effects compact enough for turn-based tactical play. Attacks, Assist triggers, retaliation, movement, and UI events must remain distinct when several occur close together.

For music, prefer memorable original motifs, strong faction/battle identity, emotional harmonic movement, and a blend of orchestral/acoustic fantasy colors with tasteful modern or game-synth texture. Do not imitate a recognizable existing soundtrack, melody, arrangement, or recording.

## Integration rules

- Runtime accepted assets belong under `assets/game/audio/`, not `assets/source/`.
- Keep SFX, ambience, and music separate.
- Update `assets/game/audio/AUDIO_MAP.md` whenever an asset is added, replaced, or its trigger changes.
- Prefer data-driven audio references when several events accumulate rather than scattering raw filenames through gameplay code.
- Trigger audio at the event players perceive: attack impact when damage resolves, summon when creation succeeds, capture at capture resolution, tactic sound when the tactic actually resolves, and victory sound only when victory is committed.
- Use cooldown/pooling when repeated or overlapping events can occur; do not fire sounds continuously from an update loop.
- Never replace unrelated accepted audio while implementing one sound.

## Acceptance level

Default to **Fast / usable** for prototype assets: at least two SFX candidates, automated validation, semantic audition when available, correct runtime mapping, and exact trigger placement.

Use **Full / polished** for shared audio infrastructure, music, release-quality assets, or broad mixing changes. Add comparative loudness checks, rapid-repeat/overlap checks, multiple gameplay contexts, and a production build when appropriate.

Never waive decode, sample-rate, channel, clipping, finite-sample, filename, or trigger failures.
