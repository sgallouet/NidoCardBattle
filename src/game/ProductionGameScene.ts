import Phaser from 'phaser';
import type { Coord } from '../data/types';
import {
  CelShadedRiverSurface,
  type CelShadedRiverSceneInternals,
} from './CelShadedRiverSurface';
import { PlayerCameraChoreographyGameScene } from './PlayerCameraChoreographyGameScene';
import { SettingsMenu } from './SettingsMenu';

interface ProductionSceneInternals extends CelShadedRiverSceneInternals {
  addRiverSurface: () => void;
  clearRiverSurface: () => void;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

export class ProductionGameScene extends PlayerCameraChoreographyGameScene {
  private settingsMenu?: SettingsMenu;
  private celRiver?: CelShadedRiverSurface;

  create(): void {
    const game = this as unknown as ProductionSceneInternals;

    // Replace only the visual river surface before GameScene performs its first render.
    // Terrain topology, bridge rules and movement remain owned by the existing engine.
    game.clearRiverSurface = () => {
      this.celRiver?.destroy();
      this.celRiver = undefined;
    };
    game.addRiverSurface = () => {
      this.celRiver?.destroy();
      this.celRiver = new CelShadedRiverSurface(this, game);
      this.celRiver.render();
    };

    super.create();

    this.settingsMenu = new SettingsMenu();
    this.settingsMenu.install();

    this.events.once('shutdown', () => {
      this.celRiver?.destroy();
      this.celRiver = undefined;
      this.settingsMenu?.destroy();
      this.settingsMenu = undefined;
    });
  }
}
