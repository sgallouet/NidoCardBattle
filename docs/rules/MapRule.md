# MapRule.md

This file owns map geometry, capture, and terrain rules.

## Map Size
- **MPS1** - Use a small hex map that fits on one screen.
- **MPS2** - Prototype target is roughly **13 × 9 hexes**.
- **MPS3** - Normal play should not require map scrolling.

## Required Locations
- **MPL1** - The map contains 2 Home Keeps, one per player.
- **MPL2** - The map contains 2 neutral Forts.
- **MPL3** - The map contains 4 Mana Wells.
- **MPL4** - Layout should be roughly symmetrical, while still allowing different routes and flanking choices.

## Capture
- **MPC1** - Captures resolve only at the end of the active player's full turn.
- **MPC2** - At capture resolution, every capturable location occupied by one of the active player's units becomes owned by that player.
- **MPC3** - A captured location remains owned until ownership changes through `MPC2`.

## Terrain
- **MPT1** - Plain hexes have no modifier and cost 1 movement point to enter.
- **MPT2** - A unit on a Tree/Forest hex takes **30% less damage from ranged attacks**.
- **MPT3** - Movement through Tree/Forest is **30% slower**; entering one costs about **1.43 movement points** (`1 / 0.70`).
- **MPT4** - A ranged unit on a Hill gains **+1 Range**.
- **MPT5** - Water and Cliff hexes are impassable.

## Map Design
- **MPG1** - Important locations must be reachable quickly enough to create early conflict.
- **MPG2** - Avoid safe corners or layouts that support permanent turtling.
- **MPG3** - Side routes must allow meaningful flanking around the main frontline.
