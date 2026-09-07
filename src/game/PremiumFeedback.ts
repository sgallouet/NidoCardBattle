import Phaser from 'phaser';
import turnStartHumanUrl from '../../assets/game/audio/sfx/turn-start-human.mp3?url';
import turnStartUndeadUrl from '../../assets/game/audio/sfx/turn-start-undead.mp3?url';
import type { GameState, PlayerId } from '../data/types';
import './PremiumFeedback.css';

export interface PremiumFeedbackSceneInternals {
  state: GameState;
  message: string;
}

interface FeedbackSnapshot {
  currentPlayer: PlayerId;
  message: string;
}

const snapshot = (state: GameState, message: string): FeedbackSnapshot => ({
  currentPlayer: state.currentPlayer,
  message,
});

export class PremiumFeedback {
  private previous: FeedbackSnapshot;
  private turnOverlay?: HTMLElement;
  private audioContext?: AudioContext;
  private humanTurnAudio?: HTMLAudioElement;
  private undeadTurnAudio?: HTMLAudioElement;
  private activeTurnAudio?: HTMLAudioElement;
  private lastHoveredCard?: HTMLElement;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly game: PremiumFeedbackSceneInternals,
  ) {
    this.previous = snapshot(game.state, game.message);
  }

  install(): void {
    this.humanTurnAudio = this.createTurnAudio(turnStartHumanUrl);
    this.undeadTurnAudio = this.createTurnAudio(turnStartUndeadUrl);

    const app = document.querySelector<HTMLElement>('#app');
    app?.addEventListener('pointerdown', this.handleUiPointerDown, true);
    app?.addEventListener('pointerover', this.handleUiPointerOver, true);
    app?.addEventListener('pointerout', this.handleUiPointerOut, true);
    this.scene.input.on('gameobjectup', this.handleBoardObjectUp);

    this.scene.events.once('shutdown', () => this.destroy());
  }

  sync(state: GameState, message: string): void {
    const next = snapshot(state, message);

    if (!state.winner && next.currentPlayer !== this.previous.currentPlayer) {
      this.presentTurn(next.currentPlayer, state);
    }

    if (next.message !== this.previous.message && this.isRejectedMessage(next.message)) {
      this.playRejectedCue();
    }

    this.previous = next;
  }

  destroy(): void {
    const app = document.querySelector<HTMLElement>('#app');
    app?.removeEventListener('pointerdown', this.handleUiPointerDown, true);
    app?.removeEventListener('pointerover', this.handleUiPointerOver, true);
    app?.removeEventListener('pointerout', this.handleUiPointerOut, true);
    this.scene.input.off('gameobjectup', this.handleBoardObjectUp);
    this.turnOverlay?.remove();
    this.turnOverlay = undefined;
    void this.audioContext?.close().catch(() => undefined);
    this.audioContext = undefined;
    for (const audio of [this.humanTurnAudio, this.undeadTurnAudio]) {
      audio?.pause();
      if (audio) audio.currentTime = 0;
    }
    this.humanTurnAudio = undefined;
    this.undeadTurnAudio = undefined;
    this.activeTurnAudio = undefined;
    this.lastHoveredCard = undefined;
  }

  private presentTurn(player: PlayerId, state: GameState): void {
    this.turnOverlay?.remove();
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const faction = state.players[player].faction;
    const localTurn = player === 1;
    const accent = faction === 'undead' ? '#b56cff' : '#61d9ff';
    const deep = faction === 'undead' ? '#2d123d' : '#102f45';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const overlay = document.createElement('div');
    overlay.className = `premium-turn-transition ${localTurn ? 'is-local' : 'is-enemy'} faction-${faction}`;
    overlay.style.setProperty('--turn-accent', accent);
    overlay.style.setProperty('--turn-deep', deep);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="premium-turn-sweep"></div>
      <div class="premium-turn-copy">
        <span>${faction === 'undead' ? 'UNDEAD' : 'HUMAN'}</span>
        <strong>${localTurn ? 'YOUR TURN' : 'ENEMY TURN'}</strong>
        <i></i>
      </div>`;
    app.append(overlay);
    this.turnOverlay = overlay;

    requestAnimationFrame(() => overlay.classList.add('is-visible'));
    this.playTurnFanfare(faction === 'undead');

    const lifetime = reducedMotion ? 520 : 880;
    window.setTimeout(() => {
      overlay.classList.add('is-leaving');
      window.setTimeout(() => {
        if (this.turnOverlay === overlay) this.turnOverlay = undefined;
        overlay.remove();
      }, reducedMotion ? 80 : 240);
    }, lifetime);
  }

  private isRejectedMessage(message: string): boolean {
    return /no longer|not available|no adjacent|select .* first|already |cannot|can't|blocked|not enough|must /i.test(message);
  }

  private readonly handleUiPointerDown = (event: PointerEvent): void => {
    this.ensureAudioContext();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.card:not(:disabled)')) {
      this.playUiTone(410, 650, 0.045, 0.03);
      return;
    }
    if (target.closest('button:not(:disabled)')) this.playUiTone(540, 680, 0.032, 0.018);
  };

  private readonly handleUiPointerOver = (event: PointerEvent): void => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const target = event.target instanceof Element ? event.target : null;
    const card = target?.closest<HTMLElement>('.card:not(:disabled)');
    if (!card || card === this.lastHoveredCard) return;
    this.lastHoveredCard = card;
    this.playUiTone(760, 880, 0.024, 0.007);
  };

  private readonly handleUiPointerOut = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.card') === this.lastHoveredCard) this.lastHoveredCard = undefined;
  };

  private readonly handleBoardObjectUp = (): void => {
    this.ensureAudioContext();
    this.playUiTone(500, 590, 0.025, 0.013);
  };

  private ensureAudioContext(): AudioContext | undefined {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return undefined;
      this.audioContext = new AudioContextCtor();
    }
    if (this.audioContext.state === 'suspended') void this.audioContext.resume().catch(() => undefined);
    return this.audioContext;
  }

  private playUiTone(startHz: number, endHz: number, duration: number, volume: number): void {
    const context = this.audioContext;
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(endHz, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private createTurnAudio(src: string): HTMLAudioElement {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audio.volume = 0.68;
    return audio;
  }

  private playTurnFanfare(undead: boolean): void {
    const audio = undead ? this.undeadTurnAudio : this.humanTurnAudio;
    if (!audio) throw new Error('Turn-start fanfare audio was not initialized.');

    if (this.activeTurnAudio && this.activeTurnAudio !== audio) {
      this.activeTurnAudio.pause();
      this.activeTurnAudio.currentTime = 0;
    }
    audio.currentTime = 0;
    this.activeTurnAudio = audio;
    void audio.play().catch((error: unknown) => {
      console.warn('Turn-start fanfare playback failed.', error);
    });
  }

  private playRejectedCue(): void {
    this.playUiTone(220, 165, 0.075, 0.013);
  }
}
