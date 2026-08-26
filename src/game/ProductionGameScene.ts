import Phaser from 'phaser';
import type { Coord } from '../data/types';
import type { AiPlan } from './ai';
import { LIVE_AI_OPTIONS_V2, planSmartAiTurnV2 } from './aiPlannerV2';
import {
  CelShadedRiverSurface,
  type CelShadedRiverSceneInternals,
} from './CelShadedRiverSurface';
import { setDebugStatus } from './DebugStatus';
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

interface AiFallbackInternals {
  aiTurnInProgress: boolean;
  aiWorker: Worker | null;
  fallbackToMainThread: () => void;
  stopAiHeartbeat: () => void;
  finishAiUi: (scene: unknown) => void;
  playAiPlan: (scene: unknown, plan: AiPlan) => Promise<void>;
  reportAiFailure: (error: unknown) => void;
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

    // Modern browsers use ai.worker.ts, but keep the rare no-Worker/error fallback on the same
    // repaired planner rather than silently reverting to the broken one-action legacy search.
    const ai = this as unknown as AiFallbackInternals;
    ai.fallbackToMainThread = () => {
      if (!ai.aiTurnInProgress || game.state.winner || game.state.currentPlayer !== 2) {
        ai.finishAiUi(game);
        return;
      }
      ai.aiWorker?.terminate();
      ai.aiWorker = null;
      ai.stopAiHeartbeat();
      setDebugStatus('AI: Worker unavailable; using repaired V2 planner on main thread.', 'warning');
      try {
        const plan = planSmartAiTurnV2(game.state, LIVE_AI_OPTIONS_V2);
        void ai.playAiPlan(game, plan).catch((error: unknown) => ai.reportAiFailure(error));
      } catch (error) {
        ai.reportAiFailure(error);
      }
    };

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
