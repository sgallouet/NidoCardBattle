# NidoCardBattle Itch.io Art Brief

## Goal

Make the store page immediately read as a modern, colorful 2D tactical card battler: a navigable fantasy hex battlefield, dramatic faction units, and premium cards, with almost no decorative UI clutter.

The art must feel like the same game as the current runtime assets, not a separate illustrated universe.

## Visual anchors

Use accepted NidoCardBattle assets as the reference set before generating anything new:

- `assets/game/cards/` for faction identity, rendering quality, frames, and character designs;
- `assets/game/units/` for battlefield scale, top-down/three-quarter viewing angle, and sprite readability;
- `assets/game/sites/` and terrain assets for map architecture;
- current gameplay screenshots for the actual camera, hex density, and minimal UI composition.

Core look:

- beautiful modern 2D fantasy strategy game;
- crisp, colorful, high-contrast shapes readable on phone screens;
- tactical map is the star;
- Human and Undead armies should both be visibly represented across the full store-art set;
- cards can be larger and more luxurious in promotional compositions than in gameplay, but must remain recognizably the in-game card language;
- dramatic light and atmosphere are welcome, but never at the cost of tactical readability;
- no fake 3D game camera, generic mobile-game chrome, giant HUD panels, or unrelated realism.

## Required first-pass set

### Cover / thumbnail

A simple iconic composition that still works when tiny. Prefer one Human hero/commander opposed by one Undead hero/commander, with a hint of the hex battlefield and one premium card silhouette. Keep the center silhouette strong and reserve clean negative space if a title lockup is added later.

### Wide hero / banner

Show the fantasy battlefield at the actual NidoCardBattle viewing logic: forests, hills/mountains, river/bridge, fort or Mana Well overlays, and opposing armies. Use cards as a restrained foreground accent rather than covering the map. The image should communicate "Wesnoth-like tactical map + modern card battler" in one glance.

### Screenshots

Screenshots must come from the real game. Capture moments that explain the game without text:

1. opening tactical position with both factions and hand visible;
2. a clear attack/kill-shot opportunity;
3. a tactical card changing the map or board state;
4. a more developed mid-game with captured sites and multiple units;
5. commander/end-game pressure once that flow is visually ready.

Do not AI-generate fake screenshots.

## Generation rules

- Generate one concept per image when comparing directions; do not bake four proposals into one sheet unless explicitly requested.
- Keep generated source files untouched in this folder or a named subfolder.
- Never overwrite an earlier candidate; use descriptive names or revision suffixes.
- Do not bake small descriptive text, fake buttons, ratings, platform logos, or unreadable card copy into generated imagery.
- A deliberate NidoCardBattle title treatment is allowed only when requested; otherwise leave title-safe negative space.
- Reject malformed hands/weapons, inconsistent card frames, impossible hex geometry, mismatched unit camera angles, or terrain that could not plausibly belong to the game.
- Promotional compositions may exaggerate lighting and scale, but should not imply gameplay systems the game does not have.

## Approval and export

A generated image is a candidate, not an accepted store asset.

Before promotion:

1. compare it against the live game at normal phone scale;
2. confirm faction/unit/card identity is consistent with accepted assets;
3. crop/export it specifically for the target itch.io image slot;
4. inspect the export at thumbnail size and full size;
5. place only approved final exports in `release/itch/art/`.

Keep the original generation/source candidate here so future revisions remain reversible.
