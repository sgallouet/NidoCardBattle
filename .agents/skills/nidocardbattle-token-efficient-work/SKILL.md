---
name: nidocardbattle-token-efficient-work
description: Keep NidoCardBattle implementation, AI reviews and simulation testing economical in tokens through bounded inspection and automated summaries. Use for AI/simulation work or when the user asks to conserve tokens.
---

# Token-efficient project work

The user has repeatedly run short of tokens. Reduce information entering context and repeated reasoning, while completing the authorized task and required checks.

## Warning checklist before a tool read

- Name the decision this read will inform. Request only the fields or source range needed for it.
- Parse reports in code before returning output. A single JSON line can contain thousands of tokens: `Tail 1` is not a safe summary. Output truncation does not replace filtering.
- Locate symbols with `rg`; read bounded ranges. Do not dump several complete source files together. Read required instructions once and retain their conclusions; reread only after relevant changes or genuinely missing context.
- Default to about 800 output tokens for routine inspection; expand deliberately for a specific failure. Do not repeatedly print unchanged code, histories, rules, or telemetry containing unused planners.

## Implement and verify

- Make one coherent correction, then run a focused regression before expanding it. Keep changes attributable to evidence; avoid combining unrelated tuning ideas and then guessing which mattered.
- Put repeated analysis and testing into scripts. Save detailed logs to disk; return counts, failures and artifact paths. Reuse known baseline failures.
- Inspect aggregate results first with `npm run battlelog:inspect -- <report.json>`. Use `--list`, then `--game N`, then a narrow `--from T --count 1 --steps 4` only when a particular game can answer a concrete question. Paginate if necessary.
- Freeze code for benchmark runs and preserve source fingerprints. Earlier results do not validate later edits. Run a small regression/development check before a promotion tournament; do not start another tournament without a reason.
- Wait on running jobs rather than repeatedly reading their files. Keep required progress updates brief and meaningful; avoid explaining unchanged polls.
- Summarize the delivered change, validation and remaining uncertainty once. A token constraint does not justify claiming untested strength, skipping required checks, or leaving authorized work unfinished.
