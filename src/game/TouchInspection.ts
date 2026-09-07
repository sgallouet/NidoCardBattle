import './TouchInspection.css';

const LONG_PRESS_MS = 360;
const MOVE_CANCEL_DISTANCE = 12;
const CLICK_SUPPRESSION_MS = 650;

export class TouchInspection {
  private pointerId: number | null = null;
  private target?: HTMLButtonElement;
  private preview?: HTMLButtonElement;
  private startX = 0;
  private startY = 0;
  private timer: number | null = null;
  private inspected = false;
  private suppressClickUntil = 0;
  private suppressTarget?: HTMLButtonElement;

  install(): void {
    document.addEventListener('pointerdown', this.handlePointerDown, true);
    document.addEventListener('pointermove', this.handlePointerMove, true);
    document.addEventListener('pointerup', this.handlePointerUp, true);
    document.addEventListener('pointercancel', this.handlePointerCancel, true);
    document.addEventListener('click', this.handleClick, true);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.handlePointerDown, true);
    document.removeEventListener('pointermove', this.handlePointerMove, true);
    document.removeEventListener('pointerup', this.handlePointerUp, true);
    document.removeEventListener('pointercancel', this.handlePointerCancel, true);
    document.removeEventListener('click', this.handleClick, true);
    this.cancel();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('.card[data-hand-index]')
      : null;
    if (!target) return;

    this.cancel();
    this.pointerId = event.pointerId;
    this.target = target;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.inspected = false;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      if (!this.target?.isConnected) return;
      this.inspected = true;
      this.suppressTarget = this.target;
      this.suppressClickUntil = performance.now() + CLICK_SUPPRESSION_MS;
      this.target.classList.add('is-touch-inspecting');
      this.target.focus({ preventScroll: true });
      this.showPreview(this.target);
      window.setTimeout(() => this.target?.classList.remove('is-touch-inspecting'), 520);
    }, LONG_PRESS_MS);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.target) return;
    if (Math.hypot(event.clientX - this.startX, event.clientY - this.startY) <= MOVE_CANCEL_DISTANCE) return;
    this.cancelTimer();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.cancelTimer();
    if (this.inspected) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.removePreview();
    this.pointerId = null;
    this.target = undefined;
    this.inspected = false;
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.cancel();
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (performance.now() > this.suppressClickUntil || !this.suppressTarget) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('.card[data-hand-index]')
      : null;
    if (target !== this.suppressTarget) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.suppressClickUntil = 0;
    this.suppressTarget = undefined;
  };

  private showPreview(card: HTMLButtonElement): void {
    this.removePreview();
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const preview = card.cloneNode(true) as HTMLButtonElement;
    preview.disabled = false;
    preview.tabIndex = -1;
    preview.className = 'card touch-card-preview';
    preview.removeAttribute('id');
    preview.removeAttribute('aria-disabled');
    preview.setAttribute('aria-hidden', 'true');
    delete preview.dataset.availabilityBlocked;
    delete preview.dataset.hardDisabled;
    delete preview.dataset.persistentHand;
    preview.style.removeProperty('--fan-angle');
    preview.style.removeProperty('--fan-y');
    app.append(preview);
    this.preview = preview;
  }

  private removePreview(): void {
    this.preview?.remove();
    this.preview = undefined;
  }

  private cancelTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  private cancel(): void {
    this.cancelTimer();
    this.removePreview();
    this.pointerId = null;
    this.target?.classList.remove('is-touch-inspecting');
    this.target = undefined;
    this.inspected = false;
  }
}
