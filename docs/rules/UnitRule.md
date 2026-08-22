# UnitRule.md

This file owns unit stats, activation, combat, movement, traits, abilities, faction rosters, and implementation gaps.

## Unit Data
- **UNS1** - Every unit has Mana Cost, HP, Attack, Move, Range, Traits, and at most one special Ability.
- **UNS2** - Every summonable unit belongs to exactly one faction.
- **UNS3** - Faction roster tables below define the target stats; the Implementation column shows whether the prototype currently matches the target and is not a second source of gameplay rules.

## Activation
- **UNA1** - A unit may Move once and Attack once during its activation.
- **UNA2** - Movement must happen before the attack; either action may be skipped.
- **UNA3** - An Exhausted unit cannot Move or Attack until its owner's next turn.

## Combat
- **UNC1** - Attacks deal deterministic damage; there is no hit/miss roll.
- **UNC2** - A unit whose HP reaches 0 is removed immediately.
- **UNC3** - Retaliation is a reaction and does not consume the defender's normal attack on its next activation.

## Movement
- **UNM1** - Movement uses movement points; entering a normal hex costs 1 point unless terrain says otherwise.
- **UNM2** - Units have no facing direction.
- **UNM3** - Units cannot enter or pass through occupied hexes.
- **UNM4** - Movement must obey enemy **Blocking** traits.

## Traits
- **UNT1** - **Blocking:** when an enemy enters a hex adjacent to this unit, that enemy's movement ends immediately. Most close-range units should have this trait.
- **UNT2** - **Retaliates:** after surviving an attack, this unit immediately deals its Attack damage back if the attacker is within its Range.
- **UNT3** - **Invoker:** this trait makes the unit a valid spawn source under `CRU3`.
- **UNT4** - **Ranged:** this label identifies a unit with base Range 3; its attacks use ranged terrain rules.
- **UNT5** - **Flying:** terrain does not restrict this unit's movement; every terrain hex costs 1 movement point to enter.
- **UNT6** - **Charge:** this unit enters play ready to Move and Attack instead of Exhausted.

## Special Abilities
- **UNB1** - **Displace:** instead of attacking, move one adjacent unit, allied or enemy, to another free hex adjacent to the Displacer.
- **UNB2** - Displacement is repositioning, not normal movement, so it ignores Blocking.
- **UNB6** - **Restore:** when this unit is summoned, its owner chooses one damaged adjacent ally and restores 2 HP to it, up to that ally's maximum HP. If there is no valid ally, the effect ends.
- **UNB7** - **Rally:** instead of attacking, give each adjacent allied unit +1 Move for the current turn; Rally cannot increase a unit that has already completed its movement this turn.

## Human Army

Human identity: formation, mobility, ranged support, and controlled repositioning.

| Rule | Unit | Mana | HP | DMG | Move | Range | Traits | Spell / Ability | Implementation |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| **HUR1** | Human Commander | — | 10 | 3 | 2 | 1 | Blocking, Retaliates | Rally | 🟡 Generic shared Commander has matching base stats/traits; faction identity and Rally are missing. |
| **HUR2** | Royal Guard | 2 | 3 | 2 | 2 | 1 | Blocking, Retaliates | — | ✅ Implemented and matches target. |
| **HUR3** | Longbow Ranger | 3 | 2 | 2 | 2 | 3 | Ranged | — | ✅ Implemented and matches target. |
| **HUR4** | Silverwing Cavalry | 6 | 5 | 4 | 4 | 1 | Flying, Charge | — | ✅ Implemented and matches target. |
| **HUR5** | Light Mage | 4 | 3 | 2 | 2 | 2 | — | Restore | ✅ Implemented and matches target. |
| **HUR6** | Banner Captain | 4 | 4 | 2 | 2 | 1 | Invoker | — | 🔴 Missing unit; Invoker system already exists. |
| **HUR7** | Wind Adept | 3 | 2 | 1 | 3 | 2 | — | Displace | 🔴 Missing unit; Displace system already exists. |

## Undead Army

- Target roster: **TBD after roster review**.
- Currently implemented Undead units: Skeletal Infantry, Necromancer, Banshee Displacer, and Grave Knight.
