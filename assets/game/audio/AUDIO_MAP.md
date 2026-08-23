# NidoCardBattle Audio Map

This file is the runtime audio contract and acceptance registry. Generated candidates remain outside the repository until accepted.

## Runtime folders

- `assets/game/audio/sfx/` — one-shot gameplay and UI effects.
- `assets/game/audio/ambience/` — environmental beds and loops.
- `assets/game/audio/music/` — accepted authored music.

## Accepted assets

| ID | File | Trigger | Kind | Volume | Cooldown / Pool | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| `combat-assist` | `sfx/combat-assist.mp3` | An Assist unit's supporting strike reaches its target and contributes damage. | impact | 0.62 | Animation-serialized / pool 1 | Derived from approved `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-melee` | `sfx/combat-hit-melee.mp3` | A close-range attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.85 | Animation-serialized / pool 1 | Adapted from WorldXplore `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-ranged` | `sfx/combat-hit-ranged.mp3` | A ranged attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.78 | Animation-serialized / pool 1 | Stable Audio candidate A; user approved 2026-08-23. |
| `combat-retaliation` | `sfx/combat-retaliation.mp3` | A defender begins a valid retaliation after the initiating attack successfully deals damage. | impact | 0.58 | Animation-serialized / pool 1 | Adapted from WorldXplore `sword-draw.mp3`; user approved 2026-08-23. |
| `unit-summon-human` | `sfx/unit-summon-human.mp3` | A Human unit is successfully created from a unit card. | sting | 0.72 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-confirm.mp3`; user approved 2026-08-23. |

## Planned event contracts

These are generation/integration targets, not accepted files. Do not add runtime playback until a candidate has been auditioned and accepted.

### P0 — core match readability

| Event ID | Exact trigger | Sound direction | Generation notes |
| --- | --- | --- | --- |
| `ui-card-draw` | A card is successfully added to the active player's hand. | Short paper/card flick with restrained magical sheen. | 2+ candidates; very short. |
| `ui-card-play` | A card play succeeds and its card leaves the hand. | Crisp card cast/release accent. | Generic layer; tactic-specific events may layer after it. |
| `unit-summon-undead` | An Undead unit is successfully created from a unit card. | Bone/grave-air magical arrival. | Readable, not horror-heavy. |
| `unit-move-step` | A rendered unit reaches a movement path hex after leaving its source hex. | Soft compact terrain-neutral movement tick. | Low volume; cooldown/pool required. |
| `unit-death-human` | A Human unit is removed because its HP reached zero. | Short armor/body fall accent. | No long vocal by default. |
| `unit-death-undead` | An Undead unit is removed because its HP reached zero. | Bone/spectral collapse accent. | Compact. |
| `site-capture` | A site owner actually changes during capture resolution. | Positive tactical claim chime. | Same sound for either faction initially. |
| `turn-end` | End Turn succeeds and control is handed to the other player. | Subtle turn handoff pulse. | Very short, low fatigue. |
| `commander-death` | A Commander is removed and the victory countdown begins/changes accordingly. | Heavy decisive impact/sting. | High priority; should cut through other SFX. |
| `victory-countdown` | A surviving Commander's victory checkpoint count advances. | Rising short tension pulse. | One sound can be pitch/volume varied in code later. |
| `match-victory` | `winner` changes from null to a player ID. | Short triumphant end-match sting. | Music-length celebration comes later. |

### P0 — tactic cards

| Event ID | Exact trigger | Sound direction | Generation notes |
| --- | --- | --- | --- |
| `tactic-grave-lock` | Grave Lock successfully creates its tile effect. | Spectral rune seal + restrained chain snap. | Distinct positional event. |
| `tactic-build-bridge` | Build Bridge successfully adds a built bridge. | Fast wood construction/clack with light magical accent. | Avoid realistic long construction sequence. |
| `tactic-scorch` | Scorch successfully marks a Forest hex as scorched. | Brief magical ignition, ember burst, vegetation collapse. | Short; no sustained fire loop. |
| `tactic-raise-fort` | Raise Fort successfully creates the Fort site. | Stone/metal assembly impact with heroic magic accent. | One compact construction burst. |
| `tactic-profane-well-sacrifice` | Profane Well successfully consumes its unit target and creates a pending well. | Dark sacrifice pulse + grave-earth suction. | Important confirmation event. |
| `tactic-profane-well-tick` | A pending Profane Well decreases its remaining-turn count. | Quiet ritual pulse. | Low volume; avoid fatigue. |
| `tactic-profane-well-complete` | A pending Profane Well becomes an actual Mana Well. | Dark magical bloom/completion sting. | Stronger than tick. |

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

1. Unit lifecycle: summons and deaths.
2. Card/UI: draw, play, turn handoff.
3. Tactics: Grave Lock, Build Bridge, Scorch, Raise Fort, Profane Well events.
4. Objectives: site capture, Commander death, countdown, victory.
5. Abilities/traits.
6. Ambience and music only after the SFX language feels coherent.

## Integration rules

- One ID maps to one accepted gameplay meaning.
- Trigger timing is part of the asset contract; do not play success audio for failed or canceled actions.
- Prefer event-driven playback from confirmed engine/render outcomes rather than input clicks.
- Layer generic and specific sounds only when both communicate different information; avoid duplicate confirmation noise.
- Rapid/repeated sounds such as movement, Curse ticks, and multi-target combat need cooldowns or small variation pools.
- Reuse an asset only when the source and gameplay meaning genuinely match.
- Keep SFX, ambience, and music separate.
- Update this map whenever an accepted file, trigger, cooldown, pool, or integration path changes.
