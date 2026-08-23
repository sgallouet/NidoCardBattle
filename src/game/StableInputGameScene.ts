import Phaser from 'phaser';
import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';

interface StableDragState {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
  moved: boolean;
}

interface StableInputInternals {
  setupCameraControls: () => void;
  renderHand: () => void;
  selectCard: (index: number) => void;
  dragState: StableDragState | null;
  suppressBoardClickUntil: number;
  constrainCamera: () => void;
}

/**
 * Keeps pointer behavior intentionally simple and deterministic:
 * - map pan = pointer-down anchor + total pointer displacement
 * - card input = the transformed visible card surface itself
 */
export class StableInputGameScene extends AnimatedPrototypeGameScene {
  create(): void {
    const internals = this as unknown as StableInputInternals;
    const originalSetupCameraControls = internals.setupCameraControls.bind(this);
    const originalRenderHand = internals.renderHand.bind(this);

    internals.setupCameraControls = () => {
      // Keep the existing wheel zoom + resize behavior, but replace only the three
      // pointer handlers that used the more complicated drag state machine.
      originalSetupCameraControls();
      this.input.off('pointerdown');
      this.input.off('pointermove');
      this.input.off('pointerup');

      const camera = this.cameras.main;

      this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (!pointer.isDown) return;
        internals.dragState = {
          startX: pointer.x,
          startY: pointer.y,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY,
          moved: false,
        };
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const drag = internals.dragState;
        if (!pointer.isDown || !drag) return;

        const dx = pointer.x - drag.startX;
        const dy = pointer.y - drag.startY;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

        drag.moved = true;
        this.game.canvas.classList.add('dragging');

        // Always derive the camera from the original mouse-down state. There is no
        // accumulated delta, threshold catch-up, or rebase, so the map cannot teleport.
        camera.setScroll(
          drag.scrollX - dx / camera.zoom,
          drag.scrollY - dy / camera.zoom,
        );
        internals.constrainCamera();
      });

      this.input.on('pointerup', () => {
        if (internals.dragState?.moved) {
          internals.suppressBoardClickUntil = performance.now() + 150;
        }
        internals.dragState = null;
        this.game.canvas.classList.remove('dragging');
      });
    };

    internals.renderHand = () => {
      originalRenderHand();
      this.bindVisibleCardSurfaces(internals);
    };

    super.create();
  }

  private bindVisibleCardSurfaces(internals: StableInputInternals): void {
    const cards = document.querySelectorAll<HTMLButtonElement>('#hand button.card');
    for (const button of cards) {
      const surface = button.querySelector<HTMLElement>('.card-surface');
      if (!surface || surface.dataset.pointerBound === 'true') continue;
      surface.dataset.pointerBound = 'true';

      surface.addEventListener('pointerdown', (event) => {
        if (!event.isPrimary || event.button !== 0 || button.disabled) return;
        const index = Number(button.dataset.handIndex);
        if (!Number.isInteger(index)) return;

        event.preventDefault();
        event.stopPropagation();
        internals.selectCard(index);
      });

      // GameScene already owns the native button click for keyboard accessibility.
      // Suppress only mouse/touch synthesized clicks because pointer-down above already
      // selected the card; otherwise the later click can toggle the fresh selection off.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    }
  }
}
