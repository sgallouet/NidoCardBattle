import Phaser from 'phaser';
import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';

const DRAG_START_THRESHOLD = 7;
const POINTER_CLICK_SUPPRESSION_MS = 500;

interface DragSample {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
}

interface SceneInternals {
  constrainCamera: () => void;
  selectCard: (index: number) => void;
}

export class SmoothDragGameScene extends AnimatedPrototypeGameScene {
  create(): void {
    super.create();

    const camera = this.cameras.main;
    const internals = this as unknown as SceneInternals;
    let drag: DragSample | null = null;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown) return;
      drag = {
        startX: pointer.x,
        startY: pointer.y,
        scrollX: camera.scrollX,
        scrollY: camera.scrollY,
      };
    });

    // GameScene intentionally waits 7 px before deciding a pointer gesture is a drag.
    // Its original handler then applies those 7 px in one frame, which creates a visible snap.
    // This listener runs after the original handler and rewrites the final camera position so
    // the dead-zone distance is consumed smoothly instead of being applied all at once.
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !drag) return;

      const dx = pointer.x - drag.startX;
      const dy = pointer.y - drag.startY;
      const distance = Math.hypot(dx, dy);
      if (distance < DRAG_START_THRESHOLD) return;

      const movableDistance = distance - DRAG_START_THRESHOLD;
      const ratio = distance === 0 ? 0 : movableDistance / distance;
      camera.setScroll(
        drag.scrollX - (dx * ratio) / camera.zoom,
        drag.scrollY - (dy * ratio) / camera.zoom,
      );
      internals.constrainCamera();
    });

    this.input.on('pointerup', () => {
      drag = null;
    });

    // A card surface lifts/scales on hover. Near an edge that transform can move the DOM
    // element away between pointerdown and pointerup, so the browser never synthesizes click.
    // Select on the stable pointerdown instead, while retaining click for keyboard activation.
    const hand = document.querySelector<HTMLElement>('#hand');
    let suppressCardClickUntil = 0;

    const cardFromEvent = (event: Event): HTMLButtonElement | null => {
      const target = event.target;
      return target instanceof Element
        ? target.closest('button.card') as HTMLButtonElement | null
        : null;
    };

    const handleCardPointerDown = (event: PointerEvent): void => {
      if (!event.isPrimary || event.button !== 0) return;
      const button = cardFromEvent(event);
      if (!button || button.disabled) return;
      const index = Number(button.dataset.handIndex);
      if (!Number.isInteger(index)) return;

      event.preventDefault();
      suppressCardClickUntil = performance.now() + POINTER_CLICK_SUPPRESSION_MS;
      internals.selectCard(index);
    };

    const handleCardClickCapture = (event: MouseEvent): void => {
      if (performance.now() >= suppressCardClickUntil || !cardFromEvent(event)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    hand?.addEventListener('pointerdown', handleCardPointerDown);
    hand?.addEventListener('click', handleCardClickCapture, true);
    this.events.once('shutdown', () => {
      hand?.removeEventListener('pointerdown', handleCardPointerDown);
      hand?.removeEventListener('click', handleCardClickCapture, true);
    });
  }
}
