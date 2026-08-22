# NidoCardBattle Audio Map

This file is the runtime audio contract and acceptance registry. Generated candidates remain outside the repository until accepted.

## Runtime folders

- `assets/game/audio/sfx/` — one-shot gameplay and UI effects.
- `assets/game/audio/ambience/` — environmental beds and loops.
- `assets/game/audio/music/` — accepted authored music.

## Accepted assets

None yet.

When adding an accepted asset, record:

| ID | File | Trigger | Kind | Volume | Cooldown / Pool | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| example-id | `sfx/example-id.mp3` | Exact gameplay/UI lifecycle event | impact/ui/etc. | 1.0 | e.g. 120 ms / pool 2 | Replace this example row when first real asset is accepted. |

## Planned event contracts

These are generation/integration targets, not accepted files. Do not add runtime playback until a candidate has been auditioned and accepted.

### P0 — core match readability

| Event ID | Exact trigger | Sound direction | Generation notes |
| --- | --- | --- | --- |
| `ui-card-draw` | A card is successfully added to the active player's hand. | Short paper/card flick with restrained magical sheen. | 2+ candidates; very short. |
| `ui-card-play` | A card play succeeds and its card leaves the hand. | Crisp card cast/release accent. | Generic layer; tactic-specific events may layer after it. |
| `unit-summon-human` | A Human unit is successfully created from a unit card. | Clean heroic arcane arrival, light metal/wind accent. | Avoid long fanfare. |
| `unit-summon-undead` | An Undead unit is successfully created from a unit card. | Bone/grave-air magical arrival. | Readable, not horror-heavy. |
| `unit-move-step` | A rendered unit reaches a movement path hex after leaving its source hex. | Soft compact terrain-neutral movement tick. | Low volume; cooldown/pool required. |
| `combat-hit-melee` | A normal close-range attack reaches its impact frame and deals damage. | Dry weapon/body impact. | Small pool preferred. |
| `combat-hit-ranged` | A normal ranged attack reaches its impact frame and deals damage. | Sharp projectile impact. | Small pool preferred. |
| `combat-retaliation` | Retaliation begins after a successful triggering attack. | Fast counter-attack accent layered with normal hit. | Must not play when no retaliation occurs. |
| `combat-assist` | Assist contributes damage to a successful attack. | Brief supporting strike accent. | Distinct from the main hit; no full attack sound. |
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

1. Core combat: `combat-hit-melee`, `combat-hit-ranged`, `combat-retaliation`, `combat-assist`.
2. Unit lifecycle: summons and deaths.
3. Card/UI: draw, play, turn handoff.
4. Tactics: Grave Lock, Build Bridge, Scorch, Raise Fort, Profane Well events.
5. Objectives: site capture, Commander death, countdown, victory.
6. Abilities/traits.
7. Ambience and music only after the SFX language feels coherent.

## Integration rules

- One ID maps to one accepted gameplay meaning.
- Trigger timing is part of the asset contract; do not play success audio for failed or canceled actions.
- Prefer event-driven playback from confirmed engine/render outcomes rather than input clicks.
- Layer generic and specific sounds only when both communicate different information; avoid duplicate confirmation noise.
- Rapid/repeated sounds such as movement, Curse ticks, and multi-target combat need cooldowns or small variation pools.
- Reuse an asset only when the source and gameplay meaning genuinely match.
- Keep SFX, ambience, and music separate.
- Update this map whenever an accepted file, trigger, cooldown, pool, or integration path changes.
