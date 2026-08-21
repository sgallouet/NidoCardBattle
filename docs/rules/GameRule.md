# GameRule.md

## Core Fantasy
- A small turn-based hex strategy game where **cards create your army**.
- The map is your economy: **Mana Wells = more mana**, **Forts = new spawn points**.
- Main loop: **Draw → Summon → Move/Fight → Capture → Expand**.
- Target match length: **20–30 minutes**.
- MVP: **1v1 only**.

## Match Start
- Each player starts with:
  - 1 Home Keep.
  - 1 Commander on the map.
  - 3 Mana.
  - 4 random cards.
- Each player uses the same small prebuilt deck in the first prototype.
- One mulligan is allowed before turn 1.

## Turn
- 1. Gain mana.
- 2. Draw 1 card.
- 3. Play any number of cards if mana allows.
- 4. Activate units in any order.
- 5. Capture locations by ending a unit on them.
- 6. End turn.

## Unit Actions
- Each unit may **Move once + Attack once** per turn.
- Move may happen before the attack only.
- No hit chance: attacks are deterministic.
- A surviving defender retaliates if the attacker is inside its attack range.
- Newly summoned units are **Exhausted** and cannot move or attack until the next turn.

## Victory
- The central objective is the **Crown Shrine**.
- Control it at the end of your turn to gain **1 Crown Point**.
- First player to **3 Crown Points** wins.
- Capturing the enemy Home Keep also gives an immediate victory.
- This creates two paths: win the center or break through the enemy base.

## Design Rules
- Hidden information exists only in cards in hand.
- No random hit/miss rolls.
- No unit leveling.
- No inventory.
- No equipment.
- No long tech tree.
- A player should understand every important rule after one match.
