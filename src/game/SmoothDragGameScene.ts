import Phaser from 'phaser';
import { AnimatedPrototypeGameScene } from './AnimatedPrototypeGameScene';

const DRAG_START_THRESHOLD = 7;

interface DragSample {
  startX: number;
  startY: number;
  scrollX: number;
  scrollY: number;
}

interface CameraInternals {
  constrainCamera: () => void;
}

export class SmoothDragGameScene extends AnimatedPrototypeGameScene {
  create(): void {
    super.create();

    const camera = this.cameras.main;
    const internals = this as unknown as CameraInternals;
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
  }
}
