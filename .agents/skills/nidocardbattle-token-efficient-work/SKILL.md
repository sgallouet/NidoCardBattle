---
name: nidocardbattle-token-efficient-work
description: Keep every NidoCardBattle task cheap in tokens. Use on all work in this repo; the user is token-poor.
---

# Token-efficient project work

The user runs short of tokens. Finish the authorized task with the smallest context, fewest tool payloads, and one short summary.

## Hard limits

- Do not load skills that do not apply. This is Vite/Phaser/HTML/CSS, not Unity. Skip Imagine unless generating/editing images. Skip TDD/long-running/browser-debug skill dumps; apply the one needed rule.
- Do not multimodal-read labeled user images. Copy by filename mapping; check size/mode/alpha with one short script if needed.
- Do not `git show --stat` or dump large commits. Resync is `fetch` + `pull --ff-only`/`rebase` + `status`.
- Grep first. Read at most ~80–120 lines around the hit. Never dump several full files in one turn.
- Default inspection budget: about 800 tokens of tool output. Expand only for a specific compile/test/layout failure.
- Do not reread files already in context. Do not print unchanged code, CSS, or histories.

## One pass, then edit

Name the decision each read answers. Typical UI/feature path:

1. `rg` the symbols (download button, finale, start side, asset import).
2. Read the owner files only (`BattlePresentation`, helper, `NewGameSetup`/`map` slots, `GameScene` HUD line).
3. Copy assets + write a focused helper test + implement + focused `vitest` + `tsc`/`npm run build`.

Do not tour Settings, MatchIntro, loading screens, or adjacent HUD unless a failure points there.

## Verify cheaply

- Prefer a pure helper/unit test over driving Phaser, the tutorial, or match intro.
- Do not start Chrome and walk the loading tutorial to prove layout. If a screenshot is required, inject the finale in-page after load (`state.winner` + `renderAll`) or skip the browser.
- Run the new/changed test file, then `npm run build`. Do not paste a full `npm test` failure log of known baseline engine/AI failures; report `N failed, known baseline` unless a new file failed.
- Put repeated analysis into scripts. Save logs to disk; return counts, failures, and paths.

## AI / simulation extras

- Parse reports in code before returning output. A JSON line can be thousands of tokens.
- Inspect with `npm run battlelog:inspect -- <report.json>`: `--list`, then `--game N`, then a narrow `--from T --count 1 --steps 4`.
- Freeze code for benchmarks. Small regression before any tournament.

## Reply

One short summary: what changed, how the logic works, what was verified. No tour of discarded approaches.


## Long simulations: completion-only workflow

- Launch the whole authorized batch once with `node tools/benchmark-v10-matrix.mjs`. It owns scheduling, detailed logs, aggregation and final matrix formatting. Its stdout contains only the completion summary; do not redirect that summary away from the waiting tool.
- Wait for the existing process to finish using the longest completion wait permitted by the host and higher-priority instructions. If the host yields, resume that same wait. Do not restart a batch because a tool wait expired.
- Do not count saved games, read progress files, inspect partial reports, or post voluntary periodic counts. That polling repeatedly wakes the model and wastes tokens while providing no decision value. Give only required host-level updates or respond to an explicit status request.
- Read the final summary once. For a simulation-and-matrix request, return the matrix without code reviews, additional tests, speculative analysis or follow-up tuning.
- Detailed logs remain on disk. Inspect them only when requested or when a concrete failure requires it. A single JSON line can be huge; never tail raw report lines into context.
- To display an already completed run, use `node tools/format-ai-matrix.mjs <summary.json>`; never rerun matches just to regenerate presentation.
- Completion waiting reduces model activity; it does not guarantee zero tokens if the host requires multiple tool calls. Never claim that output limits or quiet logs alone eliminate token use.
