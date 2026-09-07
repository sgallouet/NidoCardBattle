export class TileInsightUiGuard {
  private app?: HTMLElement;
  private pointerOverUi = false;
  private observer?: MutationObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hideTileInsight: () => void,
  ) {}

  install(): void {
    this.app = document.querySelector<HTMLElement>('#app') ?? undefined;
    if (!this.app) return;

    document.addEventListener('pointermove', this.handlePointerEvent, true);
    document.addEventListener('pointerover', this.handlePointerEvent, true);
    document.addEventListener('pointerdown', this.handlePointerEvent, true);
    document.addEventListener('focusin', this.handleFocusIn, true);

    const panel = document.querySelector<HTMLElement>('#tile-insight');
    if (panel) {
      this.observer = new MutationObserver(() => {
        if (this.pointerOverUi) this.forceHidePanel();
      });
      this.observer.observe(panel, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-hidden'],
      });
    }
  }

  destroy(): void {
    document.removeEventListener('pointermove', this.handlePointerEvent, true);
    document.removeEventListener('pointerover', this.handlePointerEvent, true);
    document.removeEventListener('pointerdown', this.handlePointerEvent, true);
    document.removeEventListener('focusin', this.handleFocusIn, true);
    this.observer?.disconnect();
    this.observer = undefined;
    this.app = undefined;
    this.pointerOverUi = false;
  }

  private readonly handlePointerEvent = (event: PointerEvent): void => {
    const topmost = document.elementFromPoint(event.clientX, event.clientY);
    const overUi = this.isUiElement(topmost ?? (event.target instanceof Element ? event.target : null));
    if (overUi === this.pointerOverUi) {
      if (overUi) this.forceHidePanel();
      return;
    }

    this.pointerOverUi = overUi;
    if (overUi) this.suppressBoardTip();
  };

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (!this.isUiElement(target)) return;
    this.pointerOverUi = true;
    this.suppressBoardTip();
  };

  private isUiElement(element: Element | null): boolean {
    if (!element || !this.app?.contains(element)) return false;
    if (element === this.canvas || element.closest('canvas') === this.canvas) return false;
    if (element.closest('#tile-insight')) return this.pointerOverUi;
    return true;
  }

  private suppressBoardTip(): void {
    // The scene callback clears both the pending timeout and hoveredTileKey. This is
    // important: simply hiding the DOM panel would let an already-scheduled Phaser
    // hover restore a stale tooltip while the pointer is still over a HUD control.
    this.hideTileInsight();
    this.forceHidePanel();
  }

  private forceHidePanel(): void {
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = true;
  }
}
