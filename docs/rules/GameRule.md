# GameRule.md

Gameplay rules in this file own match flow and victory only. Other rule files own their own domains; reference their rule IDs instead of repeating them here.

## Match Start
- **GRS1** - Each player begins with one Commander on the map.

## Turn
- **GRT1** - Resolve start-of-turn mana income according to `EconomyRule.md`.
- **GRT2** - Draw 1 card.
- **GRT3** - Card plays may occur before, between, or after unit activations while mana allows.
- **GRT4** - Activate units in any order.
- **GRT5** - Resolve end-of-turn captures according to `MapRule.md`.
- **GRT6** - Resolve any active Commander victory countdown.
- **GRT7** - End the turn.

## Victory
- **GRV1** - A player wins by either completing the Commander survival countdown under **GRV2**-**GRV3** or eliminating the opposing army under **GRV4**.
- **GRV2** - The 3-turn countdown starts immediately when the enemy Commander dies; only the killer's own end-of-turn checkpoints count.
- **GRV3** - If the killer's Commander dies before the third checkpoint is completed, that victory countdown is cancelled.
- **GRV4** - When a player has no units remaining, the opposing player wins immediately.
