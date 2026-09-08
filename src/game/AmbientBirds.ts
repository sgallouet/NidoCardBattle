import Phaser from 'phaser';
import birdUrl from '../../assets/game/vfx/environment/bird-overhead.svg?url&no-inline';
import { MAP_HEIGHT, MAP_WIDTH } from '../data/map';
import { SEA_HEX_SIZE, SEA_HEX_WIDTH } from './seaTerrain';
import { createBirdFlights, stepBirdFlights } from './ambientBirdFlight';

const KEY = 'ambient-bird-overhead';

export class AmbientBirds {
  readonly container: Phaser.GameObjects.Container;
  private readonly width = (MAP_WIDTH - 1) * SEA_HEX_WIDTH;
  private readonly height = (MAP_HEIGHT - 1) * SEA_HEX_SIZE * 1.5;
  private readonly flights = createBirdFlights(this.width, this.height);
  private readonly sprites: Phaser.GameObjects.Image[];
  private elapsed = 0;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  static preload(scene: Phaser.Scene): void {
    scene.load.svg(KEY, birdUrl, { width: 96, height: 64 });
  }

  constructor(scene: Phaser.Scene, origin: Phaser.Math.Vector2) {
    this.container = scene.add.container(origin.x, origin.y).setDepth(4000);
    this.container.setVisible(!this.reducedMotion);
    this.sprites = this.flights.map((bird, i) => {
      const sprite = scene.add.image(bird.x, bird.y, KEY)
        .setDisplaySize(13 + i % 3, 9 + i % 3).setAlpha(0.78);
      this.container.add(sprite);
      return sprite;
    });
  }

  update(delta: number): void {
    if (this.reducedMotion) return;
    const dt = Math.min(delta / 1000, 0.05);
    this.elapsed += dt;
    stepBirdFlights(this.flights, this.elapsed, dt, this.width, this.height);
    this.flights.forEach((bird, i) => {
      const sprite = this.sprites[i];
      // Short, asynchronous flapping bursts separated by long spread-wing glides.
      const cycle = (this.elapsed + bird.phase) % 9;
      const envelope = cycle < 2 ? Math.sin(cycle / 2 * Math.PI) : 0;
      const wings = 1 - envelope * (0.5 + 0.5 * Math.sin(this.elapsed * 15 + bird.phase)) * 0.42;
      sprite.setPosition(bird.x, bird.y).setRotation(bird.heading + Math.PI / 2);
      sprite.setDisplaySize((13 + i % 3) * wings, 9 + i % 3);
    });
  }

  destroy(): void { this.container.destroy(); }
}
