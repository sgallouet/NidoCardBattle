import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const valueAfter = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
};

const positiveInteger = (name, fallback) => {
  const raw = valueAfter(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
};

const timeoutMs = positiveInteger('--timeout-ms', 3_600_000);
const forwardedArgs = process.argv.slice(2).filter((argument, index, argumentsList) =>
  argument !== '--timeout-ms' && argumentsList[index - 1] !== '--timeout-ms');
const viteNodePath = resolve(workspaceRoot, 'node_modules/vite-node/vite-node.mjs');
const childScriptPath = resolve(workspaceRoot, 'tools/simulate-planners-child.mjs');

console.log(`AI_PLANNER_DUEL_START ${JSON.stringify({ timeoutMs, args: forwardedArgs })}`);

const child = spawn(process.execPath, [viteNodePath, childScriptPath, ...forwardedArgs], {
  cwd: workspaceRoot,
  stdio: 'inherit',
});

let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  console.error(`AI_PLANNER_DUEL_TIMEOUT ${JSON.stringify({ timeoutMs })}`);
  child.kill();
}, timeoutMs);

const exitCode = await new Promise((resolveExitCode) => {
  child.once('error', (error) => {
    console.error(`AI_PLANNER_DUEL_LAUNCH_ERROR ${error.message}`);
    resolveExitCode(1);
  });
  child.once('exit', (code, signal) => {
    if (timedOut) resolveExitCode(124);
    else if (signal) {
      console.error(`AI_PLANNER_DUEL_SIGNAL ${signal}`);
      resolveExitCode(1);
    } else resolveExitCode(code ?? 1);
  });
});

clearTimeout(timeout);
process.exitCode = exitCode;
