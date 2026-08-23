export type DebugStatusTone = 'idle' | 'active' | 'success' | 'warning' | 'error';

const formatElapsed = (elapsedMs: number): string => elapsedMs < 1_000
  ? `${Math.round(elapsedMs)} ms`
  : `${(elapsedMs / 1_000).toFixed(1)} s`;

export const elapsedSince = (startedAt: number): string => formatElapsed(performance.now() - startedAt);

export const setDebugStatus = (message: string, tone: DebugStatusTone = 'idle'): void => {
  const status = document.querySelector<HTMLElement>('#debug-status');
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
};
