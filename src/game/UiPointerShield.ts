export class UiPointerShield {
  private installed = false;

  constructor(private readonly hideTileInsight: () => void) {}

  install(): void {
    if (this.installed) return;
    this.installed = true;
    document.addEventListener('pointerover', this.handlePointerOver, true);
    document.addEventListener('pointerdown', this.handlePointerOver, true);
  }

  destroy(): void {
    if (!this.installed) return;
    this.installed = false;
    document.removeEventListener('pointerover', this.handlePointerOver, true);
    document.removeEventListener('pointerdown', this.handlePointerOver, true);
  }

  private readonly handlePointerOver = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('#app')) return;
    if (target.closest('#game-container')) return;

    // DOM HUD elements sit above the Phaser canvas. Phaser does not receive a
    // pointerout for the hex underneath them, so a previously visible/scheduled
    // tile tooltip can otherwise remain on screen while the pointer is over UI.
    this.hideTileInsight();
  };
}
