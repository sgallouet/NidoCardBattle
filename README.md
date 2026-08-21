# NidoCardBattle

A small browser-based 2D turn-based strategy game combining tactical hex-map conquest with card-driven unit summoning.

## Core Loop

- Draw cards.
- Spend mana to summon units from controlled spawn points.
- Move and fight on a compact hex map.
- Capture Mana Wells for income.
- Capture Forts for forward spawn points.
- Fight over the Crown Shrine or capture the enemy Home Keep to win.

## Design Goal

Keep the game small, fast, readable, and highly replayable. The map should determine the value of the cards in your hand, while card draw creates tactical adaptation without adding random combat rolls.

## Target

- Browser-first 2D game.
- 1v1 MVP.
- 20–30 minute matches.
- Small one-screen map.
- 6 core unit types.
- Fixed prototype deck before any deck-building system.

## Rules

See [`docs/rules`](docs/rules/).

## Assets

The first visual asset pack will live under `assets/`. Keep imported source assets organized and do not modify originals destructively.
