# NidoCardBattle Audio Map

This file is the runtime audio contract and acceptance registry. Generated candidates remain outside the repository until accepted.

## Runtime folders

- `assets/game/audio/sfx/` — one-shot gameplay and UI effects.
- `assets/game/audio/ambience/` — environmental beds and loops.
- `assets/game/audio/music/` — accepted authored music.

## Accepted assets

| ID | File | Trigger | Kind | Volume | Cooldown / Pool | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| `commander-death` | `sfx/commander-death.mp3` | A Commander is removed under `GRV2` or `GRV3`, including end-turn Curse damage. | sting | 0.86 | Action-serialized / pool 1 | Composite of approved WorldXplore runtime `heavy-stomp.wav` and `tree-fall.wav`; replaces the ordinary faction death cue for Commanders; user approved 2026-08-23. |
| `combat-assist` | `sfx/combat-assist.mp3` | An Assist unit's supporting strike reaches its target and contributes damage. | impact | 0.62 | Animation-serialized / pool 1 | Derived from approved `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-melee` | `sfx/combat-hit-melee.mp3` | A close-range attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.85 | Animation-serialized / pool 1 | Adapted from WorldXplore `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-ranged` | `sfx/combat-hit-ranged.mp3` | A ranged attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.78 | Animation-serialized / pool 1 | Stable Audio candidate A; user approved 2026-08-23. |
| `combat-retaliation` | `sfx/combat-retaliation.mp3` | A defender begins a valid retaliation after the initiating attack successfully deals damage. | impact | 0.58 | Animation-serialized / pool 1 | Adapted from WorldXplore `sword-draw.mp3`; user approved 2026-08-23. |
| `site-capture` | `sfx/site-capture.mp3` | One or more existing site owners change during the active player's end-turn `MPC1`–`MPC3` capture resolution. | sting | 0.68 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `build-place.mp3`; one cue per capture group; user approved 2026-08-26. |
| `unit-death-human` | `sfx/unit-death-human.mp3` | A Human unit's zero-HP removal reaches its death animation. | impact | 0.70 | Animation-serialized / pool 1 | De-clipped and converted from WorldXplore runtime `heavy-stomp.wav`; user approved 2026-08-23. |
| `unit-death-undead` | `sfx/unit-death-undead.mp3` | An Undead unit's zero-HP removal reaches its death animation. | impact | 0.74 | Animation-serialized / pool 1 | Converted from WorldXplore runtime `bone-break.wav`; user approved 2026-08-23. |
| `unit-summon-human` | `sfx/unit-summon-human.mp3` | A Human unit is successfully created from a unit card. | sting | 0.72 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-confirm.mp3`; user approved 2026-08-23. |
| `unit-summon-undead` | `sfx/unit-summon-undead.mp3` | An Undead unit is successfully created from a unit card or by `UNT3`. | sting | 0.62 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-fail.mp3`; user approved 2026-08-23. |
| `turn-end` | `sfx/turn-end.mp3` | End Turn succeeds and control is handed to the other player. | ui | 0.52 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-select.mp3`; user approved 2026-08-23. |
| `ui-card-draw` | `sfx/ui-card-draw.mp3` | A card is successfully added to the newly active player's hand. | ui | 0.58 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `ui-paper-slide.wav`; user approved 2026-08-23. |
| `ui-card-play` | `sfx/ui-card-play.mp3` | A successful card play removes its card from the active player's hand. | ui | 0.62 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-paper-full.mp3`; user approved 2026-08-23. |
| `victory-countdown` | `sfx/victory-countdown.mp3` | An existing `GRV2` countdown advances by one end-turn checkpoint. | ui | 0.72 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `thunder-distant.mp3`; user approved 2026-08-26. |
| `tactic-build-bridge` | `sfx/tactic-build-bridge.mp3` | Build Bridge successfully adds a built bridge. | sting | 0.66 | Action-serialized / pool 1 | Converted from WorldXplore runtime `tree-fall.wav`; user approved 2026-08-23. |
| `tactic-grave-lock` | `sfx/tactic-grave-lock.mp3` | Grave Lock successfully creates its tile effect. | ui | 0.68 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-click-sharp-full.mp3`; user approved 2026-08-23. |
| `tactic-profane-well-complete` | `sfx/tactic-profane-well-complete.mp3` | A pending Profane Well becomes an actual Mana Well under `CRC8`. | sting | 0.72 | Turn-serialized / pool 1 | Stable Audio candidate B; user approved 2026-08-23. |
| `tactic-profane-well-sacrifice` | `sfx/tactic-profane-well-sacrifice.mp3` | Profane Well successfully consumes its unit target and creates a pending well. | impact | 0.72 | Action-serialized / pool 1 | Converted from WorldXplore runtime `melee-hit.mp3`; user approved 2026-08-23. |
| `tactic-profane-well-tick` | `sfx/tactic-profane-well-tick.mp3` | One or more pending Profane Wells remain pending after their `CRC8` remaining-turn count decreases. | ui | 0.46 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `heartbeat.mp3`; one pulse per resolution group; user approved 2026-08-23. |
| `tactic-raise-fort` | `sfx/tactic-raise-fort.mp3` | Raise Fort successfully creates the Fort site. | sting | 0.70 | Action-serialized / pool 1 | Converted from WorldXplore runtime `wood-deposit.mp3`; user approved 2026-08-23. |
| `tactic-scorch` | `sfx/tactic-scorch.mp3` | Scorch successfully marks a Forest hex as scorched. | impact | 0.78 | Action-serialized / pool 1 | Excerpted from WorldXplore runtime `campfire-crackle.mp3`; user approved 2026-08-23. |

## Planned event contracts

These are generation/integration targets, not accepted files. Do not add runtime playback until a candidate has been auditioned and accepted.

### P0 — core match readability

| Event ID | Exact trigger | Sound direction | Generation notes |
| --- | --- | --- | --- |
| `unit-move-step` | A rendered unit reaches a movement path hex after leaving its source hex. | Soft compact terrain-neutral movement tick. | Low volume; cooldown/pool required. |
| `match-victory` | `winner` changes from null to a player ID. | Short triumphant end-match sting. | Music-length celebration comes later. |

### P0 — tactic cards

| Event ID | Exact trigger | Sound direction | Generation notes |
| --- | --- | --- | --- |

### P1 — unit abilities and traits

| Event ID | Exact trigger | Sound direction |
| --- | --- | --- |
| `ability-displace` | Displace successfully moves its target. | Air displacement / magical shove. |
| `ability-restore` | Restore successfully heals its chosen ally. | Warm clean restorative chime. |
| `ability-rally` | Rally resolves successfully. | Short banner/command accent, not spoken dialogue. |
| `ability-soul-link` | Soul Link successfully attaches to its target. | Dark tether / spectral bond. |
| `ability-curse` | Curse is successfully applied. | Thin dark whisper/rune sting without intelligible speech. |
| `ability-curse-tick` | Curse deals its periodic damage. | Tiny dry dark pulse. |
| `ability-blood-drain` | Blood Drain heals after attack damage. | Short reverse-impact / vampiric siphon. |
| `ability-cleave` | Cleave damages at least one additional adjacent enemy. | Broad heavy sweep accent layered with attack. |
| `trait-dark-reflection` | Dark Reflection returns damage to an attacker. | Sharp dark mirror/rebound accent. |
| `trait-necromancy` | Necromancy successfully creates a Skeletal Infantry. | Bone-rise assembly burst. |

### P2 — ambience and music

| Event ID | Exact trigger | Sound direction |
| --- | --- | --- |
| `ambience-battlefield` | Match scene is active. | Very restrained fantasy battlefield/environment bed with room for SFX. |
| `music-match` | Match scene starts and gameplay music is enabled. | Tactical fantasy loop; colorful modern tone; Human and Undead motifs can coexist. |
| `music-victory` | Match victory presentation begins. | Short victory cue or transition from match music. |

## Generation order

1. Tactics: Grave Lock, Build Bridge, Scorch, Raise Fort, Profane Well events.
2. Objectives: site capture, Commander death, countdown, victory.
3. Abilities/traits.
4. Ambience and music only after the SFX language feels coherent.

## Integration rules

- One ID maps to one accepted gameplay meaning.
- Trigger timing is part of the asset contract; do not play success audio for failed or canceled actions.
- Prefer event-driven playback from confirmed engine/render outcomes rather than input clicks.
- Layer generic and specific sounds only when both communicate different information; avoid duplicate confirmation noise.
- Rapid/repeated sounds such as movement, Curse ticks, and multi-target combat need cooldowns or small variation pools.
- Reuse an asset only when the source and gameplay meaning genuinely match.
- Keep SFX, ambience, and music separate.
- Update this map whenever an accepted file, trigger, cooldown, pool, or integration path changes.
