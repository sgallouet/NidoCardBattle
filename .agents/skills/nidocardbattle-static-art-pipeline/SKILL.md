---
name: nidocardbattle-static-art-pipeline
description: "Create, review, process, and promote NidoCardBattle static art. Use for card art, unit/site/terrain source art, key art, itch.io cover/banner art, promotional composites, and static marketing exports."
---

# NidoCardBattle Static Art Pipeline

Treat generated art as a candidate until it is explicitly accepted and processed. Preserve source generations so iteration is reversible, and make the live game the visual source of truth.

## Before creating art

1. Identify the target: runtime card/unit/site/terrain art, or promotional/store art.
2. Inspect the closest accepted assets in `assets/game/` and the current game camera/UI before writing a prompt.
3. Reuse established faction designs, camera angles, proportions, card language, lighting direction, terrain grammar, and readability rules.
4. For itch.io/static promotion, read `assets/source/marketing/itch/ART_BRIEF.md` and `docs/ItchRelease.md`.

## Source versus accepted output

- Untouched supplied/generated source art belongs under `assets/source/` in the matching category.
- Never destructively replace source art; keep earlier candidates and use descriptive revision suffixes.
- Processed runtime assets belong under `assets/game/` only after acceptance.
- Untouched itch.io marketing candidates belong under `assets/source/marketing/itch/`.
- Approved itch.io exports belong under `release/itch/art/` and are not runtime assets unless separately imported by the game.

## Generation rules

- Generate one clear proposal per image when exploring alternatives unless a comparison sheet is explicitly requested.
- Match the actual tactical camera. Battlefield units must read correctly from the game's top-down/three-quarter distance, not as side-view character illustrations.
- Keep silhouettes strong at phone scale; prioritize value separation and faction readability over tiny detail.
- Do not bake fake UI, fake gameplay text, ratings, platform badges, or invented mechanics into art.
- Do not generate fake screenshots. Store screenshots must be captures of the real running game.
- Promotional key art may exaggerate atmosphere and composition, but it must remain recognizably the same game and factions.
- Transparent runtime assets must have genuinely transparent backgrounds, not blur, checkerboard, white, or painted pseudo-transparency.
- Preserve usable padding around overlays/sprites so runtime cropping can be deliberate instead of destructive.

## Review gate

Before promoting a candidate, check:

- correct faction/character/site identity;
- correct game camera and orientation;
- no malformed anatomy, weapons, card frames, hex geometry, or impossible terrain joins;
- readable silhouette at intended gameplay/thumbnail size;
- no accidental background where transparency is required;
- no visual implication of mechanics that do not exist;
- source remains preserved and the accepted export has a clear destination.

If any of these fail, revise the source candidate instead of silently compensating in gameplay code.

## Processing

Use deterministic image processing when possible for crop, resize, transparency cleanup, conversion, atlasing, or shadow baking. Record reusable scripts/settings when the same operation will recur. Do not manually edit many copies when a small tool can make the transformation repeatable.

Runtime art must follow the conventions documented in `assets/README.md`. Marketing exports should be cropped for their final store slot and checked both at full size and thumbnail size.

## Itch.io release art

The first promotional set should cover:

- a strong cover/thumbnail;
- a wide hero/banner showing the tactical map plus Human/Undead identity;
- real gameplay screenshots that demonstrate map readability, cards, combat, tactical terrain changes, and later-game commander pressure.

Keep promotional imagery visually richer than the minimal in-game UI, but never hide the core proposition: a modern colorful 2D tactical hex game fused with a card battler.
