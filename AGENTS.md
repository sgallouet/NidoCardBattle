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

## Assets

- Treat `assets/source/` as untouched source material when that folder is introduced.
- Do not overwrite or destructively edit source art.
- Put generated, cropped, converted, or processed game-ready assets under `assets/game/`.

## Development Order

- Build the smallest playable vertical slice first.
- Validate the rules with placeholder visuals before spending time on polish.
- Add presentation only after the core match is enjoyable.
