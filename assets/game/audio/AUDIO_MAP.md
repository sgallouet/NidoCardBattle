# NidoCardBattle Audio Map

This file tracks accepted runtime audio only. Generated candidates remain outside the repository until accepted.

## Runtime folders

- `assets/game/audio/sfx/` — one-shot gameplay and UI effects.
- `assets/game/audio/ambience/` — environmental beds and loops.
- `assets/game/audio/music/` — accepted authored music.

## Accepted assets

None yet.

When adding an asset, record:

| ID | File | Trigger | Kind | Volume | Cooldown / Pool | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| example-id | `sfx/example-id.mp3` | Exact gameplay/UI lifecycle event | impact/ui/etc. | 1.0 | e.g. 120 ms / pool 2 | Replace this example row when first real asset is accepted. |

## Rules

- One ID maps to one accepted gameplay meaning.
- Trigger timing is part of the asset contract; do not play success audio for failed or canceled actions.
- Reuse an asset only when the source and gameplay meaning genuinely match.
- Keep SFX, ambience, and music separate.
- Update this map whenever an accepted file, trigger, cooldown, pool, or integration path changes.
