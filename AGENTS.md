# AGENTS.md

## Project Intent

NidoCardBattle is deliberately a small game. Prefer the simplest implementation that makes the core match fun.

## Before Changing Gameplay

- Read every file in `docs/rules/`.
- Preserve the core loop: Draw → Summon → Move/Fight → Capture → Expand.
- Keep combat deterministic unless a rule document explicitly changes it.
- Keep the MVP 1v1 and browser-based.

## Scope Discipline

- Do not add campaign systems, progression, card rarity, equipment, online accounts, backend services, procedural maps, or complex status systems unless explicitly requested.
- Do not introduce a large framework or service when a lightweight browser implementation is enough.
- Prefer data-driven cards, units, and maps so balance changes do not require rewriting gameplay code.
- Keep individual rules and abilities easy to explain in one short tooltip.

## Assets

- Treat files under `assets/source/` as source material when that folder is introduced.
- Do not overwrite or destructively edit source art.
- Generated/cropped/processed game-ready assets should live separately from originals.

## Development Priorities

1. Playable board and turn flow.
2. Summoning and mana.
3. Movement and deterministic combat.
4. Capturable Mana Wells and Forts.
5. Crown Shrine / Home Keep victory.
6. Cards and basic balance.
7. Presentation and final art only after the loop is fun.
