# Assets

- `assets/source/cards/` contains user-supplied card images, copied without image processing. Rule-aligned revisions use descriptive suffixes instead of overwriting earlier source art.
- `assets/source/generated/` contains generated source sheets, copied without image processing.
- `assets/source/terrain/` contains user-supplied terrain paintings, copied without image processing.
- `assets/source/units/` contains user-supplied battlefield unit art, copied without image processing.
- `assets/source/sites/` contains user-supplied keep, fort, and Mana Well art, copied without image processing.
- `assets/source/decorations/` contains user-supplied non-gameplay map decoration art, copied without image processing.
- `assets/source/ui/tutorial/` contains the untouched portrait and landscape How to Play artwork used by the loading screen.
- `assets/source/marketing/itch/` contains untouched generated/source candidates and briefs for itch.io promotional art. Approved publishing exports live under `release/itch/art/`, not under runtime assets.
- Exact duplicate attachments were not copied a second time.
- `assets/game/cards/` contains 512 × 768 lossless WebP cards selected for the live card-art map. Regenerate an accepted card with `tools/process_card_art.ps1`.
- `assets/game/units/` contains compact game-ready battlefield art; animated units keep their state sheets in a unit-specific folder. Normalize supplied black-background unit art with `tools/process_black_background_unit.py`.
- `assets/game/units/shadows/` contains static unit sprites with baked contact shadows. Install the tooling with `python -m pip install -r tools/requirements-shadows.txt`, then regenerate with `python tools/bake_unit_shadows.py`; generation settings and source mappings live in `manifest.json` beside the outputs. Animated units retain their authored frame shadows.
- `assets/game/sites/` contains cropped, compact battlefield site art.
- `assets/game/decorations/` contains cropped, compact non-gameplay map decorations.
- Other `assets/game/` folders contain processed, cropped, or exported game-ready assets for their named systems.
- `assets/game/ui/tutorial/` contains responsive WebP loading-screen tutorials. Regenerate them with `tools/process_tutorial_art.ps1`.

Keep source art separate from generated game-ready files so automated processing remains safe and reversible.
