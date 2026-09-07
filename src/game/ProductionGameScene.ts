import Phaser from 'phaser';
import type { Coord, GameState } from '../data/types';
import type { AiPlan } from './ai';
import { LIVE_AI_OPTIONS, planLiveAiTurn } from './aiLive';
import {
  ActionAvailabilityTips,
  type ActionAvailabilitySceneInternals,
} from './ActionAvailabilityTips';
import { CardAvailabilityTips } from './CardAvailabilityTips';
import { CaptureHint } from './CaptureHint';
import { setDebugStatus } from './DebugStatus';
import {
  DemoVideoRecorder,
  type DemoVideoSceneInternals,
} from './DemoVideoRecorder';
import { EndTurnPresentation } from './EndTurnPresentation';
import {
  EnemyUnitThreatPreview,
  type EnemyUnitThreatPreviewSceneInternals,
} from './EnemyUnitThreatPreview';
import { FirstTurnGuide, type FirstTurnGuideSceneInternals } from './FirstTurnGuide';
import { PlayerCameraChoreographyGameScene } from './PlayerCameraChoreographyGameScene';
import { PersistentHandRenderer } from './PersistentHandRenderer';
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
import { TacticalHexFxLayer } from './TacticalHexFx';
import { UnitInfoInspector, type UnitInfoInspectorSceneInternals } from './UnitInfoInspector';
import { VictoryMusicDirector } from './VictoryMusic';
import { VictoryObjectiveHud } from './VictoryObjectiveHud';
import {
  MatchIntroPresentation,
  type MatchIntroSceneInternals,
} from './MatchIntroPresentation';
import {
  getManaDeliverySchedule,
  ManaPresentation,
  type ManaPresentationSceneInternals,
} from './ManaPresentation';
import { shortestReconsiderationPresentationPath } from './MovementReconsiderationPresentation';

interface ProductionSceneInternals extends
  PremiumFeedbackSceneInternals,
  FirstTurnGuideSceneInternals,
  ActionAvailabilitySceneInternals,
  UnitInfoInspectorSceneInternals,
  ManaPresentationSceneInternals {
  renderAll: () => void;
  renderHand: () => void;
  hideTileInsight: (clearHover?: boolean) => void;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  mode: string | null;
  animationInProgress: boolean;
  selectCard: (index: number) => void;
  tacticalHexFx?: TacticalHexFxLayer;
  boardLayer?: Phaser.GameObjects.Container;
  center: (coord: Coord) => Phaser.Math.Vector2;
  hexPoints: (center: Phaser.Math.Vector2, inset?: number) => Phaser.Geom.Point[];
  animateMovement: (unitId: string, path: Coord[]) => Promise<void>;
  movementHighlightPaths: () => Map<string, Phaser.Math.Vector2[]>;
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

// ManaPresentation is the single owner of mana schedule markup and animation.
// Keep this compatibility hook non-mutating while older production wiring still calls it.
const compactManaSchedule = (state: GameState): void => {
  void getManaDeliverySchedule(state);
};

export class ProductionGameScene extends PlayerCameraChoreographyGameScene {
  private settingsMenu?: SettingsMenu;
  private premiumFeedback?: PremiumFeedback;
  private persistentHand?: PersistentHandRenderer;
  private endTurnPresentation?: EndTurnPresentation;
  private cardAvailabilityTips?: CardAvailabilityTips;
  private actionAvailabilityTips?: ActionAvailabilityTips;
  private captureHint?: CaptureHint;
  private unitInfoInspector?: UnitInfoInspector;
  private enemyUnitThreatPreview?: EnemyUnitThreatPreview;
  private victoryObjective?: VictoryObjectiveHud;
  private firstTurnGuide?: FirstTurnGuide;
  private matchMusic?: MatchMusicDirector;
  private victoryMusic?: VictoryMusicDirector;
  private victoryMusicStarted = false;
  private demoVideo?: DemoVideoRecorder;
  private matchIntro?: MatchIntroPresentation;
  private manaPresentation?: ManaPresentation;

  create(): void {
    const game = this as unknown as ProductionSceneInternals;

    super.create();

    this.persistentHand = new PersistentHandRenderer({
      getState: () => game.state,
      getSelectedCardIndex: () => game.selectedCardIndex,
      getMode: () => game.mode,
      isAnimationInProgress: () => game.animationInProgress,
      selectCard: (index) => game.selectCard(index),
    });
    game.renderHand = () => {
      this.persistentHand?.render();
      this.cardAvailabilityTips?.sync();
    };
    game.renderHand();

    this.endTurnPresentation = new EndTurnPresentation({ getState: () => game.state });
    this.endTurnPresentation.install();

    // UNA1 remains engine-owned. Only the presentation changes: revised movement
    // previews stay rooted at the original move origin while the rendered unit walks
    // the shortest visual route from its current on-screen position to the replacement.
    const originalAnimateMovement = game.animateMovement.bind(this);
    game.animateMovement = (unitId, path) => originalAnimateMovement(
      unitId,
      shortestReconsiderationPresentationPath(game.state, unitId, path),
    );
    const originalMovementHighlightPaths = game.movementHighlightPaths.bind(this);
    game.movementHighlightPaths = () => {
      const paths = originalMovementHighlightPaths();
      const selected = game.selectedUnitId
        ? game.state.units.find((unit) => unit.id === game.selectedUnitId)
        : undefined;
      if (!selected?.movementOrigin || selected.attacked) return paths;

      // The engine's reconsideration path intentionally contains current -> original -> replacement
      // so the action can describe the logical undo/redo. For the tactical preview, hide that undo
      // prefix: the arrows should look exactly like the player's original choice, rooted at the
      // original movement hex. The actual token animation still uses the short current -> replacement path.
      const origin = game.center(selected.movementOrigin);
      return new Map([...paths].map(([key, path]) => {
        const originIndex = path.findIndex((point) =>
          Phaser.Math.Distance.Between(point.x, point.y, origin.x, origin.y) < 0.5);
        if (originIndex >= 0) return [key, path.slice(originIndex)];
        return [key, [origin.clone(), ...path]];
      }));
    };

    this.manaPresentation = new ManaPresentation(this, game);
    this.manaPresentation.install();
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
    this.unitInfoInspector = new UnitInfoInspector(game);
    this.unitInfoInspector.install();
    this.enemyUnitThreatPreview = new EnemyUnitThreatPreview(
      this,
      game as unknown as EnemyUnitThreatPreviewSceneInternals,
    );
    this.enemyUnitThreatPreview.install();

    this.victoryObjective = new VictoryObjectiveHud({ getState: () => game.state });
    this.victoryObjective.install();
    this.firstTurnGuide = new FirstTurnGuide(this, game);
    this.firstTurnGuide.install();

    // Use the shared live selection for production error handling too.
    const ai = this as unknown as AiFallbackInternals;
    ai.fallbackToMainThread = () => {
      if (!ai.aiTurnInProgress || game.state.winner || game.state.currentPlayer !== 2) {
        ai.finishAiUi(game);
        return;
      }
      ai.aiWorker?.terminate();
      ai.aiWorker = null;
      ai.stopAiHeartbeat();
      setDebugStatus('AI: Worker unavailable; using the live planner on main thread.', 'warning');
      try {
        const plan = planLiveAiTurn(game.state, LIVE_AI_OPTIONS);
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
      waveWaterEnabled: this.isWaveWaterEnabled(),
      setCloudShadowsEnabled: (enabled) => this.setCloudShadowsEnabled(enabled),
      setEnvironmentSpeed: (speed) => this.setEnvironmentSpeed(speed),
      waveWaterSupported: this.game.renderer.type === Phaser.WEBGL,
      setWaveWaterEnabled: (enabled) => this.setWaveWaterEnabled(enabled),
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
      compactManaSchedule(game.state);
      const selectedUnit = game.selectedUnitId
        ? game.state.units.find((unit) => unit.id === game.selectedUnitId)
        : undefined;
      game.tacticalHexFx?.setMovePresentation(
        selectedUnit?.movementOrigin && !selectedUnit.attacked ? 'reconsider' : 'active',
      );
      this.premiumFeedback?.sync(game.state, game.message);
      this.victoryObjective?.sync(game.state);
      this.firstTurnGuide?.sync();
      this.captureHint?.sync();
      this.endTurnPresentation?.sync();
      this.unitInfoInspector?.sync();
      this.enemyUnitThreatPreview?.sync();
      if (game.state.winner) {
        if (!this.victoryMusicStarted && this.victoryMusic) {
          this.victoryMusicStarted = true;
          this.matchMusic?.stop();
          this.victoryMusic.play(() => this.matchMusic?.start());
        }
      } else if (this.victoryMusicStarted) {
        this.victoryMusicStarted = false;
        this.victoryMusic?.stop();
        this.matchMusic?.start();
      }
    };
    compactManaSchedule(game.state);
    this.endTurnPresentation.sync();

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
      this.manaPresentation?.destroy();
      this.manaPresentation = undefined;
      this.firstTurnGuide?.destroy();
      this.firstTurnGuide = undefined;
      this.victoryObjective?.destroy();
      this.victoryObjective = undefined;
      this.enemyUnitThreatPreview?.destroy();
      this.enemyUnitThreatPreview = undefined;
      this.unitInfoInspector?.destroy();
      this.unitInfoInspector = undefined;
      this.captureHint?.destroy();
      this.captureHint = undefined;
      this.endTurnPresentation?.destroy();
      this.endTurnPresentation = undefined;
      this.actionAvailabilityTips?.destroy();
      this.actionAvailabilityTips = undefined;
      this.premiumFeedback?.destroy();
      this.premiumFeedback = undefined;
      this.cardAvailabilityTips?.destroy();
      this.cardAvailabilityTips = undefined;
      this.persistentHand?.destroy();
      this.persistentHand = undefined;
      this.matchMusic?.dispose();
      this.matchMusic = undefined;
      this.victoryMusic?.dispose();
      this.victoryMusic = undefined;
      this.victoryMusicStarted = false;
      this.demoVideo?.dispose();
      this.demoVideo = undefined;
      this.settingsMenu?.destroy();
      this.settingsMenu = undefined;
    });
  }
}
