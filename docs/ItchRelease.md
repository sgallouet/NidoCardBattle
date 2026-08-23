# Itch.io Release

NidoCardBattle follows the same deliberately small local release pattern used by WorldXplore: build the web game, package only the built web output, validate the archive, then upload it manually to itch.io.

## Build the upload ZIP

From Windows, run:

```bat
refresh-itch-build.bat
```

The wrapper runs `tools/package_itch.ps1`, which:

1. runs `npm run build`;
2. requires `dist/index.html`;
3. creates a temporary ZIP from the *contents* of `dist/`, so `index.html` is at archive root;
4. validates portable `/` paths, a JavaScript bundle, packaged image art, and a known NidoCardBattle card asset;
5. rejects root-absolute `src`/`href` URLs that would break when itch.io serves the game below a subpath;
6. only replaces `release/itch/NidoCardBattle-itch.zip` after every check succeeds.

Never upload the temporary `.next.zip` archive.

## Upload to itch.io

Create or edit the NidoCardBattle itch.io project as an HTML/browser game, upload `release/itch/NidoCardBattle-itch.zip`, and mark that upload as playable in the browser.

Before publishing a new upload, smoke-test the hosted version rather than only the local Vite server:

- the game reaches the playable battlefield;
- cards and unit/site artwork load;
- mouse/touch interaction works;
- a turn can be completed and the enemy turn runs;
- no asset requests fail because of root-relative URLs;
- the page fits the intended phone/desktop viewport without requiring browser controls to play.

## Store art

Use `$nidocardbattle-static-art-pipeline` for cover art, page hero/banner art, screenshots, promotional composites, or other static itch.io imagery.

- Untouched generated/source candidates live under `assets/source/marketing/itch/`.
- Approved exports used on the itch.io page live under `release/itch/art/`.
- Store art is not part of the playable ZIP unless the game itself imports that asset at runtime.
- Prefer real gameplay screenshots for screenshots. Generated composites are for cover/hero/promotional slots and must not pretend to be gameplay captures.

The current visual brief is `assets/source/marketing/itch/ART_BRIEF.md`.
