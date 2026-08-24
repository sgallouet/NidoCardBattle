import Phaser from 'phaser';
import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';

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
