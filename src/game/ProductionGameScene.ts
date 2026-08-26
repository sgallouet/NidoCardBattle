import Phaser from 'phaser';
import type { Coord } from '../data/types';
import {
  CelShadedRiverSurface,
  type CelShadedRiverSceneInternals,
} from './CelShadedRiverSurface';
import { PlayerCameraChoreographyGameScene } from './PlayerCameraChoreographyGameScene';
import {
  PremiumFeedback,
  type PremiumFeedbackSceneInternals,
} from './PremiumFeedback';
import { SettingsMenu } from './SettingsMenu';

interface ProductionSceneInternals extends CelShadedRiverSceneInternals, PremiumFeedbackSceneInternals {
  addRiverSurface: () => void;
  clearRiverSurface: () => void;
  renderAll: () => void;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
}

export class ProductionGameScene extends PlayerCameraChoreographyGameScene {
  private settingsMenu?: SettingsMenu;
  private celRiver?: CelShadedRiverSurface;
  private premiumFeedback?: PremiumFeedback;

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

    this.premiumFeedback = new PremiumFeedback(this, game);
    this.premiumFeedback.install();
    const originalRenderAll = game.renderAll.bind(this);
    game.renderAll = () => {
      originalRenderAll();
      this.premiumFeedback?.sync(game.state, game.message);
    };

    this.events.once('shutdown', () => {
      this.premiumFeedback?.destroy();
      this.premiumFeedback = undefined;
      this.celRiver?.destroy();
      this.celRiver = undefined;
      this.settingsMenu?.destroy();
      this.settingsMenu = undefined;
    });
  }
}
