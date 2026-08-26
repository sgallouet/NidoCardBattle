import Phaser from 'phaser';
import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';
import './TouchCardPolish.css';

interface StableDragState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
  threshold: number;
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

interface CameraPanKeys {
  upW: Phaser.Input.Keyboard.Key;
  downS: Phaser.Input.Keyboard.Key;
  leftA: Phaser.Input.Keyboard.Key;
  rightD: Phaser.Input.Keyboard.Key;
  upArrow: Phaser.Input.Keyboard.Key;
  downArrow: Phaser.Input.Keyboard.Key;
  leftArrow: Phaser.Input.Keyboard.Key;
  rightArrow: Phaser.Input.Keyboard.Key;
}

const CAMERA_KEYBOARD_SPEED = 620;
const MOUSE_DRAG_THRESHOLD = 5;
const TOUCH_DRAG_THRESHOLD = 12;
const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

/**
 * Keeps pointer behavior intentionally simple and deterministic:
 * - map pan = pointer-down anchor + total pointer displacement
 * - keyboard pan = WASD or arrow keys
 * - card input = the transformed visible card surface itself
 */
export class StableInputGameScene extends AnimatedPrototypeGameScene {
  private cameraPanKeys?: CameraPanKeys;

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
        if (!pointer.isDown || internals.dragState) return;
        internals.dragState = {
          pointerId: pointer.id,
          startX: pointer.x,
          startY: pointer.y,
          scrollX: camera.scrollX,
          scrollY: camera.scrollY,
          threshold: pointer.wasTouch ? TOUCH_DRAG_THRESHOLD : MOUSE_DRAG_THRESHOLD,
          moved: false,
        };
      });

      this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
        const drag = internals.dragState;
        if (!pointer.isDown || !drag || pointer.id !== drag.pointerId) return;

        const dx = pointer.x - drag.startX;
        const dy = pointer.y - drag.startY;
        if (!drag.moved) {
          if (Math.hypot(dx, dy) < drag.threshold) return;

          drag.moved = true;
          drag.startX = pointer.x;
          drag.startY = pointer.y;
          drag.scrollX = camera.scrollX;
          drag.scrollY = camera.scrollY;
          this.game.canvas.classList.add('dragging');
          return;
        }

        // Derive the camera from the point where the drag threshold was crossed.
        // Finger jitter remains a tap, while a real pan cannot accumulate drift.
        camera.setScroll(
          drag.scrollX - dx / camera.zoom,
          drag.scrollY - dy / camera.zoom,
        );
        internals.constrainCamera();
      });

      const finishDrag = (pointer?: Phaser.Input.Pointer): void => {
        if (pointer && internals.dragState && pointer.id !== internals.dragState.pointerId) return;
        if (internals.dragState?.moved) {
          internals.suppressBoardClickUntil = performance.now() + 150;
        }
        internals.dragState = null;
        this.game.canvas.classList.remove('dragging');
      };
      this.input.on('pointerup', finishDrag);
      this.input.on('pointerupoutside', finishDrag);

      const cancelDrag = (): void => finishDrag();
      this.game.canvas.addEventListener('pointercancel', cancelDrag);
      this.events.once('shutdown', () => {
        this.game.canvas.removeEventListener('pointercancel', cancelDrag);
      });
    };

    internals.renderHand = () => {
      originalRenderHand();
      this.bindVisibleCardSurfaces(internals);
    };

    super.create();

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cameraPanKeys = keyboard.addKeys({
        upW: Phaser.Input.Keyboard.KeyCodes.W,
        downS: Phaser.Input.Keyboard.KeyCodes.S,
        leftA: Phaser.Input.Keyboard.KeyCodes.A,
        rightD: Phaser.Input.Keyboard.KeyCodes.D,
        upArrow: Phaser.Input.Keyboard.KeyCodes.UP,
        downArrow: Phaser.Input.Keyboard.KeyCodes.DOWN,
        leftArrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
        rightArrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      }) as unknown as CameraPanKeys;
    }

    const preventBrowserPan = (event: KeyboardEvent): void => {
      const target = event.target;
      if (target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select'))) return;
      if (PAN_KEYS.has(event.key.toLowerCase())) event.preventDefault();
    };
    window.addEventListener('keydown', preventBrowserPan, { passive: false });
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', preventBrowserPan);
      this.cameraPanKeys = undefined;
    });
  }

  update(): void {
    super.update();
    const keys = this.cameraPanKeys;
    if (!keys) return;

    const horizontal = (keys.leftA.isDown || keys.leftArrow.isDown ? -1 : 0)
      + (keys.rightD.isDown || keys.rightArrow.isDown ? 1 : 0);
    const vertical = (keys.upW.isDown || keys.upArrow.isDown ? -1 : 0)
      + (keys.downS.isDown || keys.downArrow.isDown ? 1 : 0);
    if (horizontal === 0 && vertical === 0) return;

    const length = Math.hypot(horizontal, vertical) || 1;
    const camera = this.cameras.main;
    const frameSeconds = Math.min(this.game.loop.delta, 50) / 1000;
    const distance = CAMERA_KEYBOARD_SPEED * frameSeconds / camera.zoom;
    camera.setScroll(
      camera.scrollX + horizontal / length * distance,
      camera.scrollY + vertical / length * distance,
    );
    (this as unknown as StableInputInternals).constrainCamera();
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

        if (event.pointerType === 'touch' || event.pointerType === 'pen') {
          this.beginTouchCardInteraction(button, surface, event, () => internals.selectCard(index));
          return;
        }

        internals.selectCard(index);
      });

      // GameScene already owns the native button click for keyboard accessibility.
      // Suppress only mouse/touch synthesized clicks because pointer input already
      // selected the card; keyboard activation still reaches the normal click path.
      button.addEventListener('click', (event) => {
        if (event.detail === 0) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
    }
  }

  private beginTouchCardInteraction(
    button: HTMLButtonElement,
    surface: HTMLElement,
    initialEvent: PointerEvent,
    select: () => void,
  ): void {
    const pointerId = initialEvent.pointerId;
    let finished = false;

    const updateTilt = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      const rect = surface.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
      button.style.setProperty('--tilt-x', `${(0.5 - y) * 16}deg`);
      button.style.setProperty('--tilt-y', `${(x - 0.5) * 20}deg`);
      button.style.setProperty('--shine-x', `${x * 100}%`);
      button.style.setProperty('--shine-y', `${y * 100}%`);
      button.style.setProperty('--holo-x', `${(1 - x) * 100}%`);
      button.style.setProperty('--holo-y', `${(1 - y) * 100}%`);
    };

    const resetTilt = (): void => {
      button.style.setProperty('--tilt-x', '0deg');
      button.style.setProperty('--tilt-y', '0deg');
      button.style.setProperty('--shine-x', '50%');
      button.style.setProperty('--shine-y', '50%');
      button.style.setProperty('--holo-x', '50%');
      button.style.setProperty('--holo-y', '50%');
    };

    const cleanup = (): void => {
      surface.removeEventListener('pointermove', handleMove);
      surface.removeEventListener('pointerup', handleUp);
      surface.removeEventListener('pointercancel', handleCancel);
      button.classList.remove('touch-hover');
      resetTilt();
      try {
        if (surface.hasPointerCapture(pointerId)) surface.releasePointerCapture(pointerId);
      } catch {
        // Pointer capture may already have been released by the browser.
      }
    };

    const finish = (shouldSelect: boolean): void => {
      if (finished) return;
      finished = true;
      cleanup();
      if (shouldSelect) select();
    };

    const handleMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      updateTilt(event);
    };
    const handleUp = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      finish(true);
    };
    const handleCancel = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) return;
      finish(false);
    };

    button.classList.add('touch-hover');
    updateTilt(initialEvent);
    try {
      surface.setPointerCapture(pointerId);
    } catch {
      // Pointer capture is optional; the interaction still works without it.
    }
    surface.addEventListener('pointermove', handleMove, { passive: false });
    surface.addEventListener('pointerup', handleUp, { passive: false });
    surface.addEventListener('pointercancel', handleCancel);
  }
}
