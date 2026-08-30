# NidoCardBattle Audio Map

This file is the runtime audio contract, acceptance registry, and **master audio work checklist**. Generated candidates remain outside the repository until accepted.

Audit snapshot: **2026-08-30**.

## Status legend

- `[x]` = the required audio feedback is present and its runtime trigger was verified in code.
- `[ ]` = work remains: generate/accept an asset, integrate it, or clean up the runtime behavior.
- `asset ✅` = an accepted runtime file exists under `assets/game/audio/`.
- `runtime ✅` = the playback path is wired to the intended gameplay/UI event.
- Code-generated Web Audio tones do not require an MP3 unless playtesting shows they need replacement.

## Master work checklist

### Complete — accepted files and runtime integration

- [x] `commander-death` — asset ✅ `sfx/commander-death.mp3`; runtime ✅ Commander death, including end-turn Curse removal.
- [x] `ability-blood-drain` — asset ✅ `sfx/ability-blood-drain.mp3`; runtime ✅ Blood Drain healing after successful attack damage, including AI attacks.
- [x] `ability-cleave` — asset ✅ `sfx/ability-cleave.mp3`; runtime ✅ Cleave damages at least one additional adjacent enemy under `UNB11`, including AI attacks.
- [x] `ability-curse` — asset ✅ `sfx/ability-curse.mp3`; runtime ✅ successful player and AI Curse application under `UNB9`.
- [x] `ability-displace` — asset ✅ `sfx/ability-displace.mp3`; runtime ✅ successful player and AI Displace resolution.
- [x] `ability-rally` — asset ✅ `sfx/ability-rally.mp3`; runtime ✅ successful player and AI Rally resolution.
- [x] `ability-soul-link` — asset ✅ `sfx/ability-soul-link.mp3`; runtime ✅ successful player and AI Soul Link resolution under `UNB8`.
- [x] `ability-thunder` — asset ✅ `sfx/ability-thunder.mp3`; runtime ✅ successful player and AI `UNB6` resolution.
- [x] `combat-assist` — asset ✅ `sfx/combat-assist.mp3`; runtime ✅ Assist impact presentation.
- [x] `combat-hit-melee` — asset ✅ `sfx/combat-hit-melee.mp3`; runtime ✅ melee attack/retaliation impact.
- [x] `combat-hit-ranged` — asset ✅ `sfx/combat-hit-ranged.mp3`; runtime ✅ ranged attack/retaliation impact.
- [x] `combat-retaliation` — asset ✅ `sfx/combat-retaliation.mp3`; runtime ✅ retaliation start.
- [x] `music-match` — asset ✅ `music/battle-*.mp3`; runtime ✅ one randomly selected WorldXplore battle cue loops from match start until a winner is committed, with a persistent player-controlled volume slider in Settings.
- [x] `music-victory` — assets ✅ `music/music-victory-02-dawn-over-the-hexfield.mp3` and `music/music-victory-04-the-grave-falls-silent.mp3`; runtime ✅ one randomly selected non-looping track starts after winner commit. User approved this two-track pool as sufficient on 2026-08-29.
- [x] `location-village-heal` — asset ✅ `sfx/location-village-heal.mp3`; runtime ✅ actual `MPL8` Village healing at start of the active player's turn, including AI turns.
- [x] `demo-video-export-mix` — runtime ✅ the Settings sales-trailer generator records an approved battle cue with card, movement, combat, Assist, summon, and Thunder SFX into the exported MP4/WebM audio track.
- [x] `site-capture` — asset ✅ `sfx/site-capture.mp3`; runtime ✅ end-turn capture resolution with the duplicate synthesized cue removed.
- [x] `trait-healing-aura` — asset ✅ `sfx/trait-healing-aura.mp3`; runtime ✅ grouped `UNT13` start-turn healing.
- [x] `trait-dark-reflection` — asset ✅ `sfx/trait-dark-reflection.mp3`; runtime ✅ actual `UNT7` returned-damage presentation.
- [x] `turn-start-human` / `turn-start-undead` — assets ✅ `sfx/turn-start-human.mp3` and `sfx/turn-start-undead.mp3`; runtime ✅ faction fanfare after a committed player handoff under `GRT7`.
- [x] `unit-move-step` — asset ✅ `sfx/unit-move-step.mp3`; runtime ✅ each rendered movement-path arrival with cooldown.
- [x] `unit-death-human` — asset ✅ `sfx/unit-death-human.mp3`; runtime ✅ Human unit death.
- [x] `unit-death-undead` — asset ✅ `sfx/unit-death-undead.mp3`; runtime ✅ Undead unit death.
- [x] `unit-summon-human` — asset ✅ `sfx/unit-summon-human.mp3`; runtime ✅ Human card summon and `UNT3` Invoked Beast summon.
- [x] `unit-summon-undead` — asset ✅ `sfx/unit-summon-undead.mp3`; runtime ✅ Undead card summon.
- [x] `ui-card-draw` — asset ✅ `sfx/ui-card-draw.mp3`; runtime ✅ successful start-turn card draw.
- [x] `ui-card-play` — asset ✅ `sfx/ui-card-play.mp3`; runtime ✅ successful unit/tactic card play.
- [x] `victory-countdown` — asset ✅ `sfx/victory-countdown.mp3`; runtime ✅ survival countdown checkpoint.
- [x] `tactic-build-bridge` — asset ✅ `sfx/tactic-build-bridge.mp3`; runtime ✅ successful Build Bridge resolution.
- [x] `tactic-grave-lock` — asset ✅ `sfx/tactic-grave-lock.mp3`; runtime ✅ successful Grave Lock resolution.
- [x] `tactic-profane-well-complete` — asset ✅ `sfx/tactic-profane-well-complete.mp3`; runtime ✅ pending Well completes.
- [x] `tactic-profane-well-sacrifice` — asset ✅ `sfx/tactic-profane-well-sacrifice.mp3`; runtime ✅ Profane Well sacrifice resolves.
- [x] `tactic-profane-well-tick` — asset ✅ `sfx/tactic-profane-well-tick.mp3`; runtime ✅ pending Well countdown ticks.
- [x] `tactic-raise-fort` — asset ✅ `sfx/tactic-raise-fort.mp3`; runtime ✅ successful Raise Fort resolution.
- [x] `tactic-scorch` — asset ✅ `sfx/tactic-scorch.mp3`; runtime ✅ successful Scorch resolution.

### Complete — code-generated feedback, no dedicated file currently required

- [x] `ui-card-hover/select` — runtime ✅ short synthesized UI tones in `PremiumFeedback`.
- [x] `ui-button/board-confirm` — runtime ✅ short synthesized UI tones in `PremiumFeedback`.
- [x] `ui-rejected-action` — runtime ✅ synthesized rejection cue when the status message reports an invalid/rejected action.
- [x] `mana-gain` / `mana-spend` — runtime ✅ synthesized mana feedback. This currently also covers the new `ECM6` Ruin +1 mana reward, so a separate Ruin MP3 is **not required** unless playtesting shows the source is unclear.
- [x] `invoke-beast` — covered by the accepted Human summon cue rather than a separate file.

### P0 — work left for core match readability

- [ ] `turn-end` — current runtime cue rejected on 2026-08-29. Four distinct single-shot-gated concepts—battle horn, shield command, banner relay, and arcane signal—await audition.
- [ ] `match-defeat` — asset ❌; runtime ❌. Trigger when the opposing player becomes the winner. Short restrained defeat/failure finale sting.

### P1 — unit abilities and traits

- [ ] `ability-curse-tick` — asset ❌; runtime audio ❌. Trigger when Curse deals periodic damage. Tiny dry dark pulse; cooldown/pooling for multiple ticks.
- [ ] `trait-necromancy` — asset ❌; runtime audio ❌. Trigger when Necromancy successfully creates Skeletal Infantry. Bone-rise assembly burst.

### P2 — ambience and music

- [ ] `ambience-battlefield` — asset ❌; runtime ❌. Fresh validated A/B candidates are ready externally; accept one after audition. Restrained looping fantasy battlefield/environment bed with plenty of room for tactical SFX.

## Runtime folders

- `assets/game/audio/sfx/` — one-shot gameplay and UI effects.
- `assets/game/audio/ambience/` — environmental beds and loops.
- `assets/game/audio/music/` — accepted authored music.

## Accepted asset contracts

| ID | File | Trigger | Kind | Volume | Cooldown / Pool | Notes |
| --- | --- | --- | --- | ---: | --- | --- |
| `ability-blood-drain` | `sfx/ability-blood-drain.mp3` | Blood Drain actually restores HP after successful normal attack damage under `UNT10`. | sting | 0.64 | Action-serialized / pool 1 | Candidate A; user approved 2026-08-29; runtime integrated. |
| `ability-cleave` | `sfx/ability-cleave.mp3` | Cleave damages at least one additional adjacent enemy under `UNB11`, layered with the normal attack hit. | impact | 0.72 | Action-serialized / pool 1 | Candidate A; user approved 2026-08-29; runtime integrated. |
| `ability-curse` | `sfx/ability-curse.mp3` | Curse successfully applies under `UNB9`. | sting | 0.62 | Action-serialized / pool 1 | Candidate B; user approved 2026-08-29; runtime integrated. |
| `ability-displace` | `sfx/ability-displace.mp3` | Displace successfully commits its target to the selected destination. | sting | 0.68 | Action-serialized / pool 1 | Converted from WorldXplore runtime `arrow-fly.mp3`; user approved 2026-08-28. |
| `ability-rally` | `sfx/ability-rally.mp3` | Rally successfully resolves under `UNB7`. | sting | 0.66 | Action-serialized / pool 1 | Candidate A; user approved 2026-08-29; runtime integrated. |
| `ability-thunder` | `sfx/ability-thunder.mp3` | Thunder successfully commits under `UNB6`, immediately before its area VFX presentation. | sting | 0.78 | Action-serialized / pool 1 | Three-second strike and natural rumble excerpt from Pixabay `Thunder Strike (Wav)`; user approved 2026-08-29. |
| `commander-death` | `sfx/commander-death.mp3` | A Commander is removed under `GRV2` or `GRV3`, including end-turn Curse damage. | sting | 0.86 | Action-serialized / pool 1 | `commander-death-r3-20260829-a.mp3`; short single-shot-gated replacement selected by user 2026-08-30. |
| `combat-assist` | `sfx/combat-assist.mp3` | An Assist unit's supporting strike reaches its target and contributes damage. | impact | 0.62 | Animation-serialized / pool 1 | Derived from approved `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-melee` | `sfx/combat-hit-melee.mp3` | A close-range attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.85 | Animation-serialized / pool 1 | Adapted from WorldXplore `crit-crack.mp3`; user approved 2026-08-23. |
| `combat-hit-ranged` | `sfx/combat-hit-ranged.mp3` | A ranged attack or retaliation reaches its visual impact after successfully dealing damage. | impact | 0.78 | Animation-serialized / pool 1 | Stable Audio candidate A; user approved 2026-08-23. |
| `combat-retaliation` | `sfx/combat-retaliation.mp3` | A defender begins a valid retaliation after the initiating attack successfully deals damage. | impact | 0.58 | Animation-serialized / pool 1 | Adapted from WorldXplore `sword-draw.mp3`; user approved 2026-08-23. |
| `music-match` | `music/battle-*.mp3` (13 tracks) | Match scene starts; one randomly selected track loops until either player becomes the winner. `?music=off` disables this lifecycle. | music | Player setting; 0.25 default | One track per match | Exact accepted WorldXplore runtime battle playlist; Settings persists and applies a 0–100% player volume, including mute at 0%; user requested reuse 2026-08-29. |
| `music-victory` | `music/music-victory-02-dawn-over-the-hexfield.mp3`, `music/music-victory-04-the-grave-falls-silent.mp3` | After `GRV1` winner commit, one track is selected for the result presentation and does not loop. `?music=off` disables this lifecycle. | music | 0.34 | One track per result | Sole local-victory result audio. User approved both existing tracks as sufficient and removed the separate `match-victory` sting on 2026-08-29. |
| `ability-soul-link` | `sfx/ability-soul-link.mp3` | Soul Link successfully attaches under `UNB8`. | sting | 0.64 | Action-serialized / pool 1 | Candidate B; user approved 2026-08-29; runtime integrated. |
| `location-village-heal` | `sfx/location-village-heal.mp3` | At `MPL8`, a unit standing on a Village actually gains HP at the start of its owner's turn. | sting | 0.58 | Turn-serialized / pool 1 | Candidate B; user approved 2026-08-29; runtime integrated. |
| `site-capture` | `sfx/site-capture.mp3` | One or more existing site owners change during the active player's end-turn `MPC1`–`MPC3` capture resolution. | sting | 0.68 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `build-place.mp3`; one cue per capture group; user approved 2026-08-26. |
| `trait-healing-aura` | `sfx/trait-healing-aura.mp3` | At least one adjacent ally actually gains HP from `UNT13` at start of turn. | sting | 0.64 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `respawn-chime.mp3`; grouped once per start-turn healing resolution; user approved 2026-08-28. |
| `trait-dark-reflection` | `sfx/trait-dark-reflection.mp3` | `UNT7` actually returns at least 1 damage to the direct attacker, at the reflection presentation. | sting | 0.70 | Action-serialized / pool 1 | Converted from WorldXplore runtime `arrow-impact.mp3`; user approved 2026-08-29. |
| `turn-start-human` | `sfx/turn-start-human.mp3` | After `GRT7` commits control to a Human player and no winner exists. | sting | 0.68 | Turn-serialized / pool 1 | Two-second ACE-Step cut `Sunlit Keep`; user approved 2026-08-30; replaces the synthesized Human turn tone. |
| `turn-start-undead` | `sfx/turn-start-undead.mp3` | After `GRT7` commits control to an Undead player and no winner exists. | sting | 0.68 | Turn-serialized / pool 1 | Two-second ACE-Step cut `Grave Moon`; user approved 2026-08-30; replaces the synthesized Undead turn tone. |
| `unit-move-step` | `sfx/unit-move-step.mp3` | A rendered unit reaches each movement path hex after leaving its source. | footstep | 0.34 | 100 ms / pool 1 | Converted from WorldXplore runtime `footstep-dirt-b.mp3`; user approved 2026-08-28. |
| `unit-death-human` | `sfx/unit-death-human.mp3` | A Human unit's zero-HP removal reaches its death animation. | impact | 0.70 | Animation-serialized / pool 1 | De-clipped and converted from WorldXplore runtime `heavy-stomp.wav`; user approved 2026-08-23. |
| `unit-death-undead` | `sfx/unit-death-undead.mp3` | An Undead unit's zero-HP removal reaches its death animation. | impact | 0.74 | Animation-serialized / pool 1 | Converted from WorldXplore runtime `bone-break.wav`; user approved 2026-08-23. |
| `unit-summon-human` | `sfx/unit-summon-human.mp3` | A Human unit is successfully created from a Unit Card or an Invoked Beast is created under `UNT3`. | sting | 0.72 | Action-serialized / pool 1 | `unit-summon-human-r2-20260829-b.mp3`; short single-shot-gated replacement selected by user 2026-08-30. |
| `unit-summon-undead` | `sfx/unit-summon-undead.mp3` | An Undead unit is successfully created from a Unit Card. | sting | 0.66 | Action-serialized / pool 1 | `unit-summon-undead-r5-20260829-b.mp3`; short single-shot-gated replacement selected by user 2026-08-30. |
| `ui-card-draw` | `sfx/ui-card-draw.mp3` | A card is successfully added to the newly active player's hand. | ui | 0.58 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `ui-paper-slide.wav`; user approved 2026-08-23. |
| `ui-card-play` | `sfx/ui-card-play.mp3` | A successful card play removes its card from the active player's hand. | ui | 0.62 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-paper-full.mp3`; user approved 2026-08-23. |
| `victory-countdown` | `sfx/victory-countdown.mp3` | An existing `GRV2` countdown advances by one nonfinal end-turn checkpoint; the final checkpoint uses the result sting. | ui | 0.72 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `thunder-distant.mp3`; user approved 2026-08-26. |
| `tactic-build-bridge` | `sfx/tactic-build-bridge.mp3` | Build Bridge successfully adds a built bridge. | sting | 0.66 | Action-serialized / pool 1 | Converted from WorldXplore runtime `tree-fall.wav`; user approved 2026-08-23. |
| `tactic-grave-lock` | `sfx/tactic-grave-lock.mp3` | Grave Lock successfully creates its tile effect. | ui | 0.68 | Action-serialized / pool 1 | Converted from WorldXplore runtime `ui-click-sharp-full.mp3`; user approved 2026-08-23. |
| `tactic-profane-well-complete` | `sfx/tactic-profane-well-complete.mp3` | A pending Profane Well becomes an actual Mana Well under `CRC8`. | sting | 0.72 | Turn-serialized / pool 1 | Stable Audio candidate B; user approved 2026-08-23. |
| `tactic-profane-well-sacrifice` | `sfx/tactic-profane-well-sacrifice.mp3` | Profane Well successfully consumes its unit target and creates a pending well. | impact | 0.72 | Action-serialized / pool 1 | Converted from WorldXplore runtime `melee-hit.mp3`; user approved 2026-08-23. |
| `tactic-profane-well-tick` | `sfx/tactic-profane-well-tick.mp3` | One or more pending Profane Wells remain pending after their `CRC8` remaining-turn count decreases. | ui | 0.46 | Turn-serialized / pool 1 | Converted from WorldXplore runtime `heartbeat.mp3`; one pulse per resolution group; user approved 2026-08-23. |
| `tactic-raise-fort` | `sfx/tactic-raise-fort.mp3` | Raise Fort successfully creates the Fort site. | sting | 0.70 | Action-serialized / pool 1 | Converted from WorldXplore runtime `wood-deposit.mp3`; user approved 2026-08-23. |
| `tactic-scorch` | `sfx/tactic-scorch.mp3` | Scorch successfully marks a Forest hex as scorched. | impact | 0.78 | Action-serialized / pool 1 | Excerpted from WorldXplore runtime `campfire-crackle.mp3`; user approved 2026-08-23. |

## Recommended work order

1. Decide whether `turn-end` still needs a separate cue now that the faction turn-start fanfares are integrated.
2. Validate and accept regenerated `match-defeat`.
3. Validate and accept regenerated `ability-curse-tick` and `trait-necromancy` candidates.
4. Validate and accept regenerated battlefield ambience.

## Remaining work by expected trigger count

Directional baseline: two deterministic 60-half-turn AI matches on 2026-08-28. Both reached the turn limit, so this sample is useful for repeated-action frequency but not end-match frequency.

1. `match-defeat` — at most once per match and only on a local loss; low count but high presentation importance.
2. `ability-curse-tick` and `trait-necromancy` — zero active uses in this small sample; the Necromancer was summoned 0.5 times per match, so these conditional cues are expected to be comparatively rare. Fresh candidate sets are ready externally.
3. `ambience-battlefield` — one lifecycle trigger with full-session exposure; prioritize by listening impact rather than trigger count.

## Integration rules

- One ID maps to one accepted gameplay meaning.
- Trigger timing is part of the asset contract; do not play success audio for failed or canceled actions.
- Prefer event-driven playback from confirmed engine/render outcomes rather than input clicks.
- Layer generic and specific sounds only when both communicate different information; avoid duplicate confirmation noise.
- Rapid/repeated sounds such as movement, Curse ticks, and multi-target combat need cooldowns or small variation pools.
- Reuse an asset only when the source and gameplay meaning genuinely match.
- Keep SFX, ambience, and music separate.
- Update this map whenever an accepted file, trigger, cooldown, pool, or integration path changes.
