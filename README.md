# NidoCardBattle

## Run locally

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Checks

```bash
npm test
npm run build
```

## AI battle logs

Live Human-vs-AI battle logs are persisted atomically with the saved match. Reloading or resuming keeps the original turn-1 snapshot and prior events; exported schema-v2 logs report `historyComplete`, `initialTurnNumber`, `resumeCount`, and `resumedAt` so partial recordings cannot be mistaken for complete matches.

Generate deterministic, action-by-action AI matches with compact state deltas and an analysis summary:

```bash
npm run battlelog -- --matches 2 --seed 20260823
```

The report path is printed after the run. Optional flags are `--max-half-turns`, `--repetition-limit`, `--out`, and `--pretty`.

Compare Planner V2 and Planner V3 over paired seeds with progress after every pair:

```bash
npm run simulate:planners
```

Optional flags are `--pairs`, `--seed`, `--max-half-turns`, `--repetition-limit`, and `--timeout-ms`. The default one-hour timeout is enforced by a parent process, so it can terminate a CPU-bound simulator that cannot service an in-process timer.

Compare V3 against the data-driven V4 portfolio:

```bash
npm run simulate:v4
```

Compare V4 against experimental Planner V5:

```bash
npm run simulate:v5
```
