import Phaser from 'phaser';
import { CARD_ART } from '../data/cardArt';
import type { CardDefinitionId } from '../data/cards';
import type { ActionResult, Coord, GameState } from '../data/types';
import type { AiAction } from './ai';
import {
  DEMO_VIDEO_ACTIONS,
  DEMO_VIDEO_PROFILE,
  createDemoVideoState,
} from './DemoVideoPlan';
import { DemoVideoSoundtrack } from './DemoVideoSoundtrack';
import { setDebugStatus } from './DebugStatus';
import './DemoVideoRecorder.css';

export type DemoVideoRecordingState = 'idle' | 'recording' | 'saving' | 'saved' | 'unsupported' | 'error';

export interface DemoVideoSceneInternals {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  displaceTargetId: string | null;
  restoreSourceId: string | null;
  mode: string | null;
  renderAll: () => void;
  playAiAction: (action: AiAction) => Promise<ActionResult>;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface DemoSnapshot {
  state: GameState;
  message: string;
  animationInProgress: boolean;
  selectedUnitId: string | null;
  selectedCardIndex: number | null;
  displaceTargetId: string | null;
  restoreSourceId: string | null;
  mode: string | null;
  scaleWidth: number;
  scaleHeight: number;
  cameraScrollX: number;
  cameraScrollY: number;
  cameraZoom: number;
}

interface DemoCaption {
  eyebrow: string;
  title: string;
  subtitle: string;
}

type DemoVisualMode = 'hero' | 'cards' | 'gameplay' | 'final';

export interface DemoVideoFormat {
  mimeType: string;
  extension: 'mp4' | 'webm';
}

const FORMAT_PREFERENCES: readonly DemoVideoFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4' },
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm' },
  { mimeType: 'video/webm', extension: 'webm' },
];

export const selectDemoVideoFormat = (
  isSupported: (mimeType: string) => boolean,
): DemoVideoFormat | undefined => FORMAT_PREFERENCES.find(({ mimeType }) => isSupported(mimeType));

export class DemoVideoRecorder {
  private recorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private recordingCanvas: HTMLCanvasElement | null = null;
  private recordingFrame = 0;
  private chunks: Blob[] = [];
  private caption: DemoCaption | null = null;
  private captionChangedAt = 0;
  private visualMode: DemoVisualMode = 'hero';
  private showcaseCards: readonly CardDefinitionId[] = [];
  private readonly showcaseImages = new Map<CardDefinitionId, HTMLImageElement>();
  private snapshot: DemoSnapshot | null = null;
  private cancelRequested = false;
  private soundtrack: DemoVideoSoundtrack | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: DemoVideoSceneInternals,
    private readonly onStateChange: (state: DemoVideoRecordingState) => void,
    private readonly onPreviewAudioStart?: () => void,
    private readonly onPreviewAudioStop?: () => void,
  ) {}

  static isSupported(canvas: HTMLCanvasElement): boolean {
    return typeof MediaRecorder !== 'undefined'
      && typeof canvas.captureStream === 'function'
      && DemoVideoSoundtrack.isSupported();
  }

  async record(): Promise<void> {
    if (this.recorder) return;
    if (!DemoVideoRecorder.isSupported(this.scene.game.canvas)) {
      this.onStateChange('unsupported');
      setDebugStatus('Demo video recording is unavailable in this browser.', 'error');
      return;
    }

    const format = selectDemoVideoFormat((mimeType) => MediaRecorder.isTypeSupported(mimeType));
    this.cancelRequested = false;
    this.snapshot = this.captureSnapshot();

    try {
      this.onPreviewAudioStart?.();
      this.prepareDemo();
      await this.loadShowcaseImages();
      const recordingCanvas = this.createRecordingCanvas();
      this.soundtrack = new DemoVideoSoundtrack();
      const audioTrack = await this.soundtrack.prepare();
      const videoStream = recordingCanvas.captureStream(DEMO_VIDEO_PROFILE.frameRate);
      this.recordingStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        audioTrack,
      ]);
      this.recorder = new MediaRecorder(this.recordingStream, {
        ...(format ? { mimeType: format.mimeType } : {}),
        videoBitsPerSecond: DEMO_VIDEO_PROFILE.videoBitsPerSecond,
        audioBitsPerSecond: 192_000,
      });
      this.chunks = [];
      this.recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.recorder.onerror = (event) => {
        console.error('Demo video recording failed.', event.error);
        this.cancelRequested = true;
      };

      this.startCompositor();
      this.onStateChange('recording');
      setDebugStatus('Recording the 16:9 gameplay demo. Press Escape to cancel.', 'active');
      window.addEventListener('keydown', this.handleKeyDown);
      this.recorder.start(1_000);
      this.soundtrack.start();
      const startedAt = performance.now();
      await this.runTour();
      const remainingMs = DEMO_VIDEO_PROFILE.minimumDurationSeconds * 1_000 - (performance.now() - startedAt);
      if (!this.cancelRequested && remainingMs > 0) await this.wait(remainingMs);

      const shouldDownload = !this.cancelRequested;
      this.onStateChange('saving');
      const chunks = await this.stopRecorder();
      if (shouldDownload && chunks.length > 0) {
        this.download(chunks, this.recorderMimeType(format), format?.extension ?? 'webm');
        this.onStateChange('saved');
        setDebugStatus('Wavedash demo video saved to Downloads.', 'success');
        window.setTimeout(() => this.onStateChange('idle'), 3_000);
      } else {
        this.onStateChange('idle');
        if (this.cancelRequested) setDebugStatus('Demo video recording canceled.', 'warning');
      }
    } catch (error) {
      console.error('Unable to generate the demo video.', error);
      this.cancelRequested = true;
      await this.stopRecorder();
      this.onStateChange('error');
      setDebugStatus('Unable to generate the demo video.', 'error');
      window.setTimeout(() => this.onStateChange('idle'), 3_000);
    } finally {
      window.removeEventListener('keydown', this.handleKeyDown);
      await this.soundtrack?.dispose();
      this.soundtrack = null;
      this.cleanupRecordingSurface();
      this.restoreSnapshot();
      this.onPreviewAudioStop?.();
    }
  }

  cancel(): void {
    this.cancelRequested = true;
  }

  dispose(): void {
    this.cancel();
    if (this.recorder?.state === 'recording') this.recorder.stop();
    void this.soundtrack?.dispose();
    this.soundtrack = null;
    this.cleanupRecordingSurface();
    this.restoreSnapshot();
    this.onPreviewAudioStop?.();
  }

  private captureSnapshot(): DemoSnapshot {
    const camera = this.scene.cameras.main;
    return {
      state: structuredClone(this.game.state),
      message: this.game.message,
      animationInProgress: this.game.animationInProgress,
      selectedUnitId: this.game.selectedUnitId,
      selectedCardIndex: this.game.selectedCardIndex,
      displaceTargetId: this.game.displaceTargetId,
      restoreSourceId: this.game.restoreSourceId,
      mode: this.game.mode,
      scaleWidth: this.scene.scale.width,
      scaleHeight: this.scene.scale.height,
      cameraScrollX: camera.scrollX,
      cameraScrollY: camera.scrollY,
      cameraZoom: camera.zoom,
    };
  }

  private prepareDemo(): void {
    this.scene.scale.resize(DEMO_VIDEO_PROFILE.width, DEMO_VIDEO_PROFILE.height);
    this.game.state = createDemoVideoState();
    this.game.message = 'Wavedash demo recording';
    this.game.animationInProgress = true;
    this.game.selectedUnitId = null;
    this.game.selectedCardIndex = null;
    this.game.displaceTargetId = null;
    this.game.restoreSourceId = null;
    this.game.mode = null;
    this.game.renderAll();
    const overview = this.game.center({ q: 8, r: 6 });
    this.scene.cameras.main.setZoom(0.72).centerOn(overview.x, overview.y);
  }

  private createRecordingCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.className = 'demo-video-preview';
    canvas.width = DEMO_VIDEO_PROFILE.width;
    canvas.height = DEMO_VIDEO_PROFILE.height;
    canvas.dataset.demoRecording = 'active';
    canvas.dataset.demoRecordingProfile = `${DEMO_VIDEO_PROFILE.width}x${DEMO_VIDEO_PROFILE.height}@${DEMO_VIDEO_PROFILE.frameRate}`;
    document.querySelector<HTMLElement>('#app')?.append(canvas);
    document.querySelector<HTMLElement>('#app')?.classList.add('demo-video-recording');
    this.recordingCanvas = canvas;
    return canvas;
  }

  private startCompositor(): void {
    const render = (): void => {
      const canvas = this.recordingCanvas;
      if (!canvas) return;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The demo video compositor is unavailable.');
      context.fillStyle = '#020814';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(this.scene.game.canvas, 0, 0, canvas.width, canvas.height);
      this.drawCinematicFrame(context);
      this.recordingFrame = requestAnimationFrame(render);
    };
    render();
  }

  private drawCinematicFrame(context: CanvasRenderingContext2D): void {
    const { width, height } = DEMO_VIDEO_PROFILE;
    const now = performance.now();
    const age = Math.max(0, now - this.captionChangedAt);
    const vignette = context.createRadialGradient(width / 2, height / 2, height * 0.28, width / 2, height / 2, width * 0.67);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.62)');
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);

    this.drawAmbientSparks(context, now);
    if (this.visualMode === 'cards') this.drawCardShowcase(context, age, now);
    if (this.visualMode === 'hero' || this.visualMode === 'final') {
      this.drawHeroTitle(context, age, this.visualMode === 'final');
    } else {
      this.drawTopTitle(context, age);
    }
    this.drawTransitionFlash(context, age);
  }

  private drawAmbientSparks(context: CanvasRenderingContext2D, now: number): void {
    context.save();
    for (let index = 0; index < 22; index += 1) {
      const phase = now * 0.00008 * (1 + index % 4) + index * 1.93;
      const x = ((index * 197 + Math.sin(phase) * 90) % 1280 + 1280) % 1280;
      const y = ((index * 83 - now * (0.006 + (index % 3) * 0.003)) % 720 + 720) % 720;
      const alpha = 0.12 + (Math.sin(phase * 2.4) + 1) * 0.09;
      context.fillStyle = `rgba(241,198,111,${alpha})`;
      context.beginPath();
      context.arc(x, y, 1.2 + index % 3, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private drawHeroTitle(context: CanvasRenderingContext2D, age: number, final: boolean): void {
    if (!this.caption) return;
    const { width, height } = DEMO_VIDEO_PROFILE;
    const reveal = Math.min(1, age / 650);
    const eased = 1 - (1 - reveal) ** 3;
    const backdrop = context.createLinearGradient(0, 0, 0, height);
    backdrop.addColorStop(0, `rgba(2,7,18,${final ? 0.32 : 0.54})`);
    backdrop.addColorStop(0.58, 'rgba(2,7,18,.2)');
    backdrop.addColorStop(1, `rgba(2,7,18,${final ? 0.84 : 0.62})`);
    context.fillStyle = backdrop;
    context.fillRect(0, 0, width, height);

    context.save();
    context.globalAlpha = eased;
    context.translate(0, (1 - eased) * -34);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0,0,0,.98)';
    context.shadowBlur = 24;
    context.fillStyle = '#f1c66f';
    context.font = '900 24px Inter, Arial, sans-serif';
    context.fillText(this.caption.eyebrow, width / 2, final ? 488 : 102);
    context.fillStyle = '#fff6dd';
    context.font = `900 ${final ? 72 : 82}px Georgia, serif`;
    context.fillText(this.caption.title, width / 2, final ? 554 : 176, width - 96);
    context.fillStyle = '#d9eafa';
    context.font = '700 22px Inter, Arial, sans-serif';
    context.fillText(this.caption.subtitle, width / 2, final ? 624 : 252, width - 150);
    context.fillStyle = '#f1c66f';
    context.fillRect(width / 2 - 190 * eased, final ? 666 : 292, 380 * eased, 3);
    context.restore();
  }

  private drawTopTitle(context: CanvasRenderingContext2D, age: number): void {
    if (!this.caption) return;
    const { width } = DEMO_VIDEO_PROFILE;
    const reveal = Math.min(1, age / 420);
    const eased = 1 - (1 - reveal) ** 3;
    const panel = context.createLinearGradient(0, 0, 0, 176);
    panel.addColorStop(0, 'rgba(2,7,18,.95)');
    panel.addColorStop(0.72, 'rgba(2,7,18,.74)');
    panel.addColorStop(1, 'rgba(2,7,18,0)');
    context.fillStyle = panel;
    context.fillRect(0, 0, width, 176);

    context.save();
    context.globalAlpha = eased;
    context.translate(0, (1 - eased) * -22);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0,0,0,1)';
    context.shadowBlur = 18;
    context.fillStyle = '#f1c66f';
    context.font = '900 19px Inter, Arial, sans-serif';
    context.fillText(this.caption.eyebrow, width / 2, 32);
    context.fillStyle = '#fff6dd';
    context.font = '900 48px Georgia, serif';
    context.fillText(this.caption.title, width / 2, 78, width - 110);
    context.fillStyle = '#d9eafa';
    context.font = '700 18px Inter, Arial, sans-serif';
    context.fillText(this.caption.subtitle, width / 2, 124, width - 170);
    context.fillStyle = '#f1c66f';
    context.fillRect(width / 2 - 130 * eased, 148, 260 * eased, 2);
    context.restore();
  }

  private drawCardShowcase(context: CanvasRenderingContext2D, age: number, now: number): void {
    const cards = this.showcaseCards;
    if (cards.length === 0) return;
    const { width, height } = DEMO_VIDEO_PROFILE;
    context.fillStyle = 'rgba(2,7,18,.67)';
    context.fillRect(0, 150, width, height - 150);
    const cardWidth = cards.length === 1 ? 310 : 250;
    const cardHeight = cardWidth * 1.5;
    const spacing = cards.length === 1 ? 0 : 226;
    const reveal = Math.min(1, age / 700);
    const eased = 1 - (1 - reveal) ** 3;
    context.save();
    for (const [index, cardId] of cards.entries()) {
      const image = this.showcaseImages.get(cardId);
      if (!image) continue;
      const centeredIndex = index - (cards.length - 1) / 2;
      const rotation = centeredIndex * 0.09;
      const float = Math.sin(now * 0.0022 + index * 1.8) * 7;
      const x = width / 2 + centeredIndex * spacing;
      const y = 420 + Math.abs(centeredIndex) * 22 + float + (1 - eased) * 170;
      const scale = eased * (1 + Math.sin(now * 0.0018 + index) * 0.012);
      context.save();
      context.globalAlpha = eased;
      context.translate(x, y);
      context.rotate(rotation * eased);
      context.scale(scale, scale);
      context.shadowColor = index === Math.floor(cards.length / 2) ? 'rgba(93,183,255,.9)' : 'rgba(241,198,111,.72)';
      context.shadowBlur = 34;
      context.drawImage(image, -cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
      const shineX = ((now * 0.12 + index * 160) % (cardWidth + 130)) - cardWidth / 2 - 65;
      const shine = context.createLinearGradient(shineX - 42, 0, shineX + 42, 0);
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,.2)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      context.globalCompositeOperation = 'screen';
      context.fillStyle = shine;
      context.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
      context.restore();
    }
    context.restore();
  }

  private drawTransitionFlash(context: CanvasRenderingContext2D, age: number): void {
    if (age > 360) return;
    const progress = age / 360;
    const x = -180 + progress * 1_640;
    const wipe = context.createLinearGradient(x - 130, 0, x + 130, 0);
    wipe.addColorStop(0, 'rgba(255,220,145,0)');
    wipe.addColorStop(0.5, `rgba(255,229,169,${(1 - progress) * 0.28})`);
    wipe.addColorStop(1, 'rgba(255,220,145,0)');
    context.fillStyle = wipe;
    context.fillRect(0, 0, DEMO_VIDEO_PROFILE.width, DEMO_VIDEO_PROFILE.height);
  }

  private async runTour(): Promise<void> {
    this.setScene('hero', [], 'FROM HAND TO BATTLEFIELD', 'NIDOCARDBATTLE', 'A fast tactical duel of cards, armies and battlefield control.');
    await this.wait(1_650);
    if (this.cancelRequested) return;

    this.setScene(
      'cards',
      ['silverwingCavalry', 'lightMage', 'graveKnight'],
      'BUILD YOUR WAR DECK',
      'SUMMON LEGENDS',
      'Every card becomes a unit, tactic or spectacular power on the battlefield.',
    );
    this.soundtrack?.play('ui-card-draw');
    this.soundtrack?.play('ui-card-draw', 260);
    this.soundtrack?.play('ui-card-draw', 520);
    await this.wait(2_550);
    if (this.cancelRequested) return;

    this.setScene('gameplay', [], 'CONTROL THE BATTLEFIELD', 'MOVE WITH PURPOSE', 'Claim routes, forts and mana wells before your rival.');
    await this.focus({ q: 8, r: 9 }, 1.08, 650);
    this.soundtrack?.play('unit-move-step', 120);
    this.soundtrack?.play('unit-move-step', 340);
    this.soundtrack?.play('unit-move-step', 560);
    await this.playAction(DEMO_VIDEO_ACTIONS[0]);
    await this.wait(180);
    if (this.cancelRequested) return;

    this.setScene('gameplay', [], 'FORMATION TACTICS', 'STRIKE TOGETHER', 'Position nearby allies to turn one attack into a devastating Assist combo.');
    this.soundtrack?.play('combat-hit-melee', 320);
    this.soundtrack?.play('combat-assist', 610);
    await this.playAction(DEMO_VIDEO_ACTIONS[1]);
    await this.wait(380);
    if (this.cancelRequested) return;

    this.setScene(
      'cards',
      ['silverwingCavalry'],
      'PLAY THE CARD',
      'DEPLOY THE UNIT',
      'Spend mana at controlled sites and bring powerful reinforcements into the fight.',
    );
    this.soundtrack?.play('ui-card-play');
    await this.wait(1_050);
    this.setScene('gameplay', [], 'CARDS BECOME ARMIES', 'SUMMON REINFORCEMENTS', 'Watch the card descend onto the hex and become a battlefield unit.');
    await this.playAction(DEMO_VIDEO_ACTIONS[2]);
    this.soundtrack?.play('unit-summon-human', 760);
    await this.playAction(DEMO_VIDEO_ACTIONS[3]);
    await this.wait(360);
    if (this.cancelRequested) return;

    this.setScene('gameplay', [], 'TURN THE TIDE', 'UNLEASH THUNDER', 'Break clustered enemy formations with spectacular tactical abilities.');
    await this.focus({ q: 10, r: 7 }, 1.12, 650);
    this.soundtrack?.play('ability-thunder', 120);
    await this.playAction(DEMO_VIDEO_ACTIONS[4]);
    await this.wait(650);
    if (this.cancelRequested) return;

    await this.focus({ q: 9, r: 7 }, 0.78, 650);
    this.setScene('final', [], 'HUMANS VS UNDEAD', 'NIDOCARDBATTLE', 'Build your formation. Control the map. Defeat the enemy Commander.');
    this.soundtrack?.fadeOut(1_800);
    await this.wait(1_900);
  }

  private async playAction(action: AiAction): Promise<void> {
    const result = await this.game.playAiAction(action);
    if (!result.ok) throw new Error(`Demo action failed: ${result.message}`);
    this.game.message = result.message;
    this.game.renderAll();
  }

  private async focus(coord: Coord, zoom: number, duration: number): Promise<void> {
    const point = this.game.center(coord);
    const camera = this.scene.cameras.main;
    camera.pan(point.x, point.y, duration, 'Sine.easeInOut', true);
    camera.zoomTo(zoom, duration, 'Sine.easeInOut', true);
    await this.wait(duration + 40);
  }

  private setScene(
    mode: DemoVisualMode,
    cards: readonly CardDefinitionId[],
    eyebrow: string,
    title: string,
    subtitle: string,
  ): void {
    this.visualMode = mode;
    this.showcaseCards = cards;
    this.caption = { eyebrow, title, subtitle };
    this.captionChangedAt = performance.now();
  }

  private async loadShowcaseImages(): Promise<void> {
    const cardIds = ['silverwingCavalry', 'lightMage', 'graveKnight'] as const;
    await Promise.all(cardIds.map(async (cardId) => {
      if (this.showcaseImages.has(cardId)) return;
      const image = new Image();
      image.decoding = 'async';
      image.src = CARD_ART[cardId];
      await image.decode();
      this.showcaseImages.set(cardId, image);
    }));
  }

  private wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  private stopRecorder(): Promise<Blob[]> {
    const recorder = this.recorder;
    if (!recorder) return Promise.resolve([]);
    if (recorder.state === 'inactive') return Promise.resolve([...this.chunks]);
    return new Promise((resolve) => {
      recorder.onstop = () => resolve([...this.chunks]);
      recorder.stop();
    });
  }

  private recorderMimeType(format: DemoVideoFormat | undefined): string {
    return this.recorder?.mimeType || format?.mimeType || 'video/webm';
  }

  private download(chunks: Blob[], mimeType: string, fallbackExtension: 'mp4' | 'webm'): void {
    const extension = mimeType.includes('mp4') ? 'mp4' : fallbackExtension;
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const download = document.createElement('a');
    download.href = url;
    download.download = `nidocardbattle-wavedash-demo-${timestamp}.${extension}`;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  private cleanupRecordingSurface(): void {
    cancelAnimationFrame(this.recordingFrame);
    this.recordingFrame = 0;
    this.recordingStream?.getTracks().forEach((track) => track.stop());
    this.recordingStream = null;
    this.recorder = null;
    this.chunks = [];
    this.caption = null;
    this.recordingCanvas?.remove();
    this.recordingCanvas = null;
    document.querySelector<HTMLElement>('#app')?.classList.remove('demo-video-recording');
  }

  private restoreSnapshot(): void {
    const snapshot = this.snapshot;
    if (!snapshot) return;
    this.snapshot = null;
    this.scene.scale.resize(snapshot.scaleWidth, snapshot.scaleHeight);
    this.game.state = snapshot.state;
    this.game.message = snapshot.message;
    this.game.animationInProgress = snapshot.animationInProgress;
    this.game.selectedUnitId = snapshot.selectedUnitId;
    this.game.selectedCardIndex = snapshot.selectedCardIndex;
    this.game.displaceTargetId = snapshot.displaceTargetId;
    this.game.restoreSourceId = snapshot.restoreSourceId;
    this.game.mode = snapshot.mode;
    this.game.renderAll();
    this.scene.cameras.main
      .setZoom(snapshot.cameraZoom)
      .setScroll(snapshot.cameraScrollX, snapshot.cameraScrollY);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    this.cancel();
  };
}
