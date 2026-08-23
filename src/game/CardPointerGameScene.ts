import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';

interface CardPointerInternals {
  selectCard: (index: number) => void;
}

export class CardPointerGameScene extends AnimatedPrototypeGameScene {
  create(): void {
    super.create();

    const internals = this as unknown as CardPointerInternals;
    let suppressPointerClickUntil = 0;

    const pickVisibleCard = (clientX: number, clientY: number): HTMLButtonElement | null => {
      const cards = Array.from(
        document.querySelectorAll<HTMLButtonElement>('#hand button.card:not(:disabled)'),
      );
      const candidates = cards.flatMap((button) => {
        const surface = button.querySelector<HTMLElement>('.card-surface');
        const rect = (surface ?? button).getBoundingClientRect();
        if (
          clientX < rect.left
          || clientX > rect.right
          || clientY < rect.top
          || clientY > rect.bottom
        ) return [];

        const halfWidth = Math.max(1, rect.width / 2);
        const halfHeight = Math.max(1, rect.height / 2);
        const normalizedDistance = Math.hypot(
          (clientX - (rect.left + rect.width / 2)) / halfWidth,
          (clientY - (rect.top + rect.height / 2)) / halfHeight,
        );
        return [{ button, normalizedDistance }];
      });

      candidates.sort((a, b) => a.normalizedDistance - b.normalizedDistance);
      return candidates[0]?.button ?? null;
    };

    const handlePointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || event.button !== 0) return;
      const button = pickVisibleCard(event.clientX, event.clientY);
      if (!button) return;
      const index = Number(button.dataset.handIndex);
      if (!Number.isInteger(index)) return;

      // Use the transformed visual card geometry instead of the browser's overlapping
      // button hitboxes. This also prevents the Phaser canvas from treating the same press
      // as the start of a map drag.
      event.preventDefault();
      event.stopPropagation();
      suppressPointerClickUntil = performance.now() + 500;
      internals.selectCard(index);
    };

    const handleClickCapture = (event: MouseEvent): void => {
      if (event.detail === 0 || performance.now() >= suppressPointerClickUntil) return;
      const card = pickVisibleCard(event.clientX, event.clientY);
      if (!card) return;

      // The pointer press already selected the card. Do not let the browser's later
      // synthesized click hit the freshly re-rendered hand and toggle selection back off.
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('click', handleClickCapture, true);
    this.events.once('shutdown', () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('click', handleClickCapture, true);
    });
  }
}
