import Phaser from 'phaser';
import type { Coord } from '../data/types';
import type { AiPlan } from './ai';
import { LIVE_AI_OPTIONS_V8, planAiTurnV8 } from './aiPlannerV8';
import {
  ActionAvailabilityTips,
  type ActionAvailabilitySceneInternals,
} from './ActionAvailabilityTips';
import { CardAvailabilityTips } from './CardAvailabilityTips';
import { CaptureHint } from './CaptureHint';
import {
  CelShadedRiverSurface,
  type CelShadedRiverSceneInternals,
} from './CelShadedRiverSurface';
import { setDebugStatus } from './DebugStatus';
import {
  DemoVideoRecorder,
  type DemoVideoSceneInternals,
} from './DemoVideoRecorder';
import { FirstTurnGuide, type FirstTurnGuideSceneInternals } from './FirstTurnGuide';
import { PlayerCameraChoreographyGameScene } from './PlayerCameraChoreographyGameScene';
import {
  PremiumFeedback,
  type PremiumFeedbackSceneInternals,
} from './PremiumFeedback';
import {
  MatchMusicDirector,
  isMatchMusicEnabled,
  loadMatchMusicVolume,
  saveMatchMusicVolume,
} from './MatchMusic';
import { SettingsMenu } from './SettingsMenu';
import { VictoryMusicDirector } from './VictoryMusic';
import { VictoryObjectiveHud } from './VictoryObjectiveHud';
import {
  MatchIntroPresentation,
  type MatchIntroSceneInternals,
} from './MatchIntroPresentation';

interface ProductionSceneInternals extends
  CelShadedRiverSceneInternals,
  PremiumFeedbackSceneInternals,
  FirstTurnGuideSceneInternals,
  ActionAvailabilitySceneInternals {
  addRiverSurface: () => void;
  clearRiverSurface: () => void;
  renderAll: () => void;
  hideTileInsight: (clearHover?: boolean) => void;
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
  private cardAvailabilityTips?: CardAvailabilityTips;
  private actionAvailabilityTips?: ActionAvailabilityTips;
  private captureHint?: CaptureHint;
  private victoryObjective?: VictoryObjectiveHud;
  private firstTurnGuide?: FirstTurnGuide;
  private matchMusic?: MatchMusicDirector;
  private victoryMusic?: VictoryMusicDirector;
  private victoryMusicStarted = false;
  private demoVideo?: DemoVideoRecorder;
  private matchIntro?: MatchIntroPresentation;

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

    this.cardAvailabilityTips = new CardAvailabilityTips({
      getState: () => game.state,
      tileTipsEnabled: () => this.areTileTipsEnabled(),
      hideTileInsight: () => game.hideTileInsight(true),
    });
    this.cardAvailabilityTips.install();
    this.actionAvailabilityTips = new ActionAvailabilityTips(
      this,
      game,
      () => this.areTileTipsEnabled(),
    );
    this.actionAvailabilityTips.install();
    this.captureHint = new CaptureHint(this, game);
    this.captureHint.install();

    this.victoryObjective = new VictoryObjectiveHud({ getState: () => game.state });
    this.victoryObjective.install();
    this.firstTurnGuide = new FirstTurnGuide(this, game);
    this.firstTurnGuide.install();

    // Production and the shared AiGameScene both plan with V8. Keep this override so a
    // no-Worker/error fallback cannot silently revert to an older planner.
    const ai = this as unknown as AiFallbackInternals;
    ai.fallbackToMainThread = () => {
      if (!ai.aiTurnInProgress || game.state.winner || game.state.currentPlayer !== 2) {
        ai.finishAiUi(game);
        return;
      }
      ai.aiWorker?.terminate();
      ai.aiWorker = null;
      ai.stopAiHeartbeat();
      setDebugStatus('AI: Worker unavailable; using V8 planner on main thread.', 'warning');
      try {
        const plan = planAiTurnV8(game.state, LIVE_AI_OPTIONS_V8);
        void ai.playAiPlan(game, plan).catch((error: unknown) => ai.reportAiFailure(error));
      } catch (error) {
        ai.reportAiFailure(error);
      }
    };

    this.demoVideo = new DemoVideoRecorder(
      this,
      game as unknown as DemoVideoSceneInternals,
      (state) => this.settingsMenu?.setDemoRecordingState(state),
      () => this.matchMusic?.stop(),
      () => {
        if (!game.state.winner) this.matchMusic?.start();
      },
    );
    const musicVolume = loadMatchMusicVolume(window.localStorage);
    this.settingsMenu = new SettingsMenu({
      musicVolume,
      setMusicVolume: (volume) => {
        saveMatchMusicVolume(window.localStorage, volume);
        this.matchMusic?.setVolume(volume);
      },
      tileTipsEnabled: this.areTileTipsEnabled(),
      setTileTipsEnabled: (enabled) => this.setTileTipsEnabled(enabled),
      recordDemo: () => void this.demoVideo?.record(),
      recordingSupported: DemoVideoRecorder.isSupported(this.game.canvas),
    });
    this.settingsMenu.install();

    this.premiumFeedback = new PremiumFeedback(this, game);
    this.premiumFeedback.install();
    if (isMatchMusicEnabled(window.location.search)) {
      this.matchMusic = new MatchMusicDirector();
      this.matchMusic.setVolume(musicVolume);
      this.matchMusic.start();
      this.victoryMusic = new VictoryMusicDirector();
    }
    const originalRenderAll = game.renderAll.bind(this);
    game.renderAll = () => {
      originalRenderAll();
      this.premiumFeedback?.sync(game.state, game.message);
      this.victoryObjective?.sync(game.state);
      this.firstTurnGuide?.sync();
      this.captureHint?.sync();
      if (game.state.winner) {
        this.matchMusic?.stop();
        if (!this.victoryMusicStarted && this.victoryMusic) {
          this.victoryMusicStarted = true;
          this.victoryMusic.play();
        }
      } else if (this.victoryMusicStarted) {
        this.victoryMusicStarted = false;
        this.victoryMusic?.stop();
      }
    };

    if (this.shouldPlayFreshMatchIntro()) {
      this.matchIntro = new MatchIntroPresentation(
        this,
        game as unknown as MatchIntroSceneInternals,
      );
      if (this.matchIntro.prepare()) {
        void this.matchIntro.playWhenReady().catch((error: unknown) => {
          setDebugStatus(`Battlefield introduction ended early: ${error instanceof Error ? error.message : 'unknown error'}.`, 'warning');
          void this.matchIntro?.finish();
        });
      } else {
        this.matchIntro = undefined;
      }
    }

    this.events.once('shutdown', () => {
      this.matchIntro?.destroy();
      this.matchIntro = undefined;
      this.firstTurnGuide?.destroy();
      this.firstTurnGuide = undefined;
      this.victoryObjective?.destroy();
      this.victoryObjective = undefined;
      this.captureHint?.destroy();
      this.captureHint = undefined;
      this.actionAvailabilityTips?.destroy();
      this.actionAvailabilityTips = undefined;
      this.premiumFeedback?.destroy();
      this.premiumFeedback = undefined;
      this.cardAvailabilityTips?.destroy();
      this.cardAvailabilityTips = undefined;
      this.matchMusic?.dispose();
      this.matchMusic = undefined;
      this.victoryMusic?.dispose();
      this.victoryMusic = undefined;
      this.victoryMusicStarted = false;
      this.demoVideo?.dispose();
      this.demoVideo = undefined;
      this.celRiver?.destroy();
      this.celRiver = undefined;
      this.settingsMenu?.destroy();
      this.settingsMenu = undefined;
    });
  }
}
