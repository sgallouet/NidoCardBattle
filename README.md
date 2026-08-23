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

Generate deterministic, action-by-action AI matches with compact state deltas and an analysis summary:

```bash
npm run battlelog -- --matches 2 --seed 20260823
```

The report path is printed after the run. Optional flags are `--max-half-turns`, `--repetition-limit`, `--out`, and `--pretty`.
