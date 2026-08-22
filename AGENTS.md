# AGENTS.md

## Project Intent

NidoCardBattle is deliberately small. Prefer the simplest implementation that makes the core match fun.

## Rule Source of Truth

- Read all files in `docs/rules/` before changing gameplay.
- Every gameplay rule has a stable rule ID.
- Never duplicate a gameplay rule in another document, code comment, test description, or prompt; reference its rule ID instead.
- When gameplay changes, edit the single rule that owns that behavior and update references only when necessary.
- If two rules appear to overlap, consolidate them before implementation.

## Implementation

- Follow `ScopeRule.md` for MVP boundaries instead of restating them here.
- Prefer data-driven cards, units, maps, traits, and abilities so balance changes do not require rewriting gameplay code.
- Keep rules and abilities easy to inspect and test individually.
- Avoid introducing large frameworks or services unless the current scope genuinely requires them.

## Git Workflow

- Never create a new Git branch or worktree branch unless the user explicitly asks you to create one. Work on the currently checked-out branch by default.

## Assets

- Treat `assets/source/` as untouched source material when that folder is introduced.
- Do not overwrite or destructively edit source art.
- Put generated, cropped, converted, or processed game-ready assets under `assets/game/`.

## Visual FX

- Use `$nidocardbattle-vfx-pipeline` whenever adding, copying, replacing, or tuning combat, projectile, spell, summon, death, terrain, or tactical visual effects.
- Reuse existing accepted NidoCardBattle VFX patterns before inventing a parallel visual language.
- Runtime VFX belong under `assets/game/vfx/`.
- Keep VFX presentation-only: engine/gameplay state decides what happened; FX visualize that committed result.
- Keep transient effects bounded, short-lived, deterministic to clean up, and readable at the normal tactical zoom.
- Visual FX work must not silently add or modify audio. Audio remains a separate user decision and pipeline.

## Local AI Audio

- Use `$nidocardbattle-audio-pipeline` when a feature needs new or changed SFX, UI audio, tactical/ability audio, ambience, or authored music.
- During gameplay feature design, explicitly decide whether the action, impact, state change, warning, reward, or environment benefits from audio feedback; do not add sound mechanically to every feature.
- Generate candidates outside the repository with the local Stable Audio 3 / ACE-Step pipelines defined by the skill. Only accepted runtime audio belongs under `assets/game/audio/`.
- Keep `assets/game/audio/AUDIO_MAP.md` synchronized with accepted files and exact playback triggers.
- Do not call generated audio polished without semantic audition; automated validation is necessary but not sufficient.

## Development Order

- Build the smallest playable vertical slice first.
- Validate the rules with placeholder visuals before spending time on polish.
- Add presentation only after the core match is enjoyable.
