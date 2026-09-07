import './InvalidActionFeedback.css';

interface FeedbackCopy {
  title: string;
  detail?: string;
}

const POP_DURATION_MS = 920;
const SHAKE_DURATION_MS = 420;

const ensureLayer = (): HTMLElement => {
  let layer = document.querySelector<HTMLElement>('#invalid-action-feedback-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'invalid-action-feedback-layer';
  layer.className = 'invalid-action-feedback-layer';
  layer.setAttribute('aria-live', 'polite');
  layer.setAttribute('aria-atomic', 'true');
  document.body.append(layer);
  return layer;
};

const replayClass = (element: HTMLElement, className: string, duration = SHAKE_DURATION_MS): void => {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
};

const showPop = (clientX: number, clientY: number, copy: FeedbackCopy): void => {
  const layer = ensureLayer();
  const pop = document.createElement('div');
  pop.className = 'invalid-action-pop';
  pop.style.left = `${Math.round(clientX)}px`;
  pop.style.top = `${Math.round(clientY)}px`;
  pop.innerHTML = `
    <span class="invalid-action-pop-ring" aria-hidden="true"></span>
    <strong>${escapeHtml(copy.title)}</strong>
    ${copy.detail ? `<small>${escapeHtml(copy.detail)}</small>` : ''}`;
  layer.replaceChildren(pop);
  window.setTimeout(() => {
    if (pop.isConnected) pop.remove();
  }, POP_DURATION_MS);
};

export const showInvalidCardFeedback = (
  button: HTMLButtonElement,
  copy: FeedbackCopy,
  emphasizeMana = false,
): void => {
  const rect = button.getBoundingClientRect();
  replayClass(button, 'invalid-action-shake');
  if (emphasizeMana) {
    const mana = document.querySelector<HTMLElement>('.mana-count');
    if (mana) replayClass(mana, 'invalid-resource-pulse', 520);
  }
  showPop(rect.left + rect.width / 2, Math.max(16, rect.top + 8), copy);
};

export const showInvalidBoardFeedback = (
  canvas: HTMLCanvasElement,
  pointerX: number,
  pointerY: number,
  copy: FeedbackCopy,
): void => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width > 0 ? rect.width / canvas.width : 1;
  const scaleY = canvas.height > 0 ? rect.height / canvas.height : 1;
  showPop(
    rect.left + pointerX * scaleX,
    rect.top + pointerY * scaleY - 10,
    copy,
  );
};

const escapeHtml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
