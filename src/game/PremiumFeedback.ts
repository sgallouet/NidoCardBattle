import Phaser from 'phaser';
import turnStartHumanUrl from '../../assets/game/audio/sfx/turn-start-human.mp3?url';
import turnStartUndeadUrl from '../../assets/game/audio/sfx/turn-start-undead.mp3?url';
import type { Coord, GameState, PlayerId } from '../data/types';
import { MAX_MANA } from './engine';
import './PremiumFeedback.css';

export interface PremiumFeedbackSceneInternals {
  state: GameState;
  message: string;
  center: (coord: Coord) => Phaser.Math.Vector2;
}

interface FeedbackSnapshot {
  currentPlayer: PlayerId;
  mana: Record<PlayerId, number>;
  message: string;
}

const snapshot = (state: GameState, message: string): FeedbackSnapshot => ({
  currentPlayer: state.currentPlayer,
  mana: {
    1: state.players[1].mana,
    2: state.players[2].mana,
  },
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
  private manaTimers: number[] = [];

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

    for (const player of [1, 2] as const) {
      const delta = next.mana[player] - this.previous.mana[player];
      if (delta !== 0 && player === next.currentPlayer) {
        this.presentManaChange(player, this.previous.mana[player], next.mana[player], delta, state);
      }
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
    for (const timer of this.manaTimers) window.clearTimeout(timer);
    this.manaTimers = [];
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

  private presentManaChange(
    player: PlayerId,
    from: number,
    to: number,
    delta: number,
    state: GameState,
  ): void {
    const wrapper = document.querySelector<HTMLElement>('.mana-count');
    const count = document.querySelector<HTMLElement>('#mana-count');
    const gem = document.querySelector<HTMLElement>('.mana-gem');
    if (!wrapper || !count || !gem) return;

    for (const timer of this.manaTimers) window.clearTimeout(timer);
    this.manaTimers = [];
    wrapper.classList.remove('mana-gain', 'mana-spend');
    void wrapper.offsetWidth;
    wrapper.classList.add(delta > 0 ? 'mana-gain' : 'mana-spend');

    const deltaLabel = document.createElement('span');
    deltaLabel.className = `mana-delta ${delta > 0 ? 'is-gain' : 'is-spend'}`;
    deltaLabel.textContent = `${delta > 0 ? '+' : ''}${delta}`;
    wrapper.append(deltaLabel);
    deltaLabel.animate([
      { opacity: 0, transform: 'translate3d(0,8px,0) scale(.8)' },
      { offset: .22, opacity: 1, transform: 'translate3d(0,-2px,0) scale(1.08)' },
      { opacity: 0, transform: 'translate3d(0,-25px,0) scale(.96)' },
    ], { duration: 720, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
      .finished.finally(() => deltaLabel.remove());

    const steps = Math.max(2, Math.min(7, Math.abs(to - from) * 2));
    count.textContent = `${from}/${MAX_MANA}`;
    for (let step = 1; step <= steps; step += 1) {
      const timer = window.setTimeout(() => {
        const value = Math.round(from + (to - from) * step / steps);
        count.textContent = `${value}/${MAX_MANA}`;
      }, 38 * step);
      this.manaTimers.push(timer);
    }

    if (delta > 0) {
      this.spawnWellManaMotes(player, state, gem);
      this.playManaGain();
    } else {
      this.playManaSpend();
    }
  }

  private spawnWellManaMotes(player: PlayerId, state: GameState, gem: HTMLElement): void {
    const wells = state.sites.filter((site) => site.type === 'well' && site.owner === player).slice(0, 3);
    const target = gem.getBoundingClientRect();
    const targetX = target.left + target.width / 2;
    const targetY = target.top + target.height / 2;
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();

    if (wells.length === 0) {
      this.spawnManaMote(targetX + 28, targetY - 18, targetX, targetY, 0);
      this.spawnManaMote(targetX + 38, targetY + 9, targetX, targetY, 70);
      return;
    }

    wells.forEach((well, index) => {
      const point = this.worldToViewport(well.coord);
      const onscreen = point.x >= canvasRect.left - 24
        && point.x <= canvasRect.right + 24
        && point.y >= canvasRect.top - 24
        && point.y <= canvasRect.bottom + 24;
      const startX = onscreen ? point.x : targetX + 42 + index * 8;
      const startY = onscreen ? point.y : targetY - 24 + index * 14;
      this.spawnManaMote(startX, startY, targetX, targetY, index * 85);
      this.spawnManaMote(startX + 7, startY - 5, targetX, targetY, index * 85 + 52);
    });
  }

  private spawnManaMote(
    startX: number,
    startY: number,
    targetX: number,
    targetY: number,
    delay: number,
  ): void {
    const mote = document.createElement('span');
    mote.className = 'mana-source-mote';
    mote.style.left = `${startX}px`;
    mote.style.top = `${startY}px`;
    document.body.append(mote);

    const dx = targetX - startX;
    const dy = targetY - startY;
    const animation = mote.animate([
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.45)' },
      { offset: .14, opacity: 1, transform: 'translate(-50%,-50%) scale(1)' },
      {
        offset: .58,
        opacity: .92,
        transform: `translate(calc(-50% + ${dx * .55}px), calc(-50% + ${dy * .45 - 24}px)) scale(.82)`,
      },
      {
        opacity: 0,
        transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.25)`,
      },
    ], { duration: 650, delay, easing: 'cubic-bezier(.2,.72,.25,1)', fill: 'forwards' });
    animation.finished.finally(() => mote.remove());
  }

  private worldToViewport(coord: Coord): Phaser.Math.Vector2 {
    const world = this.game.center(coord);
    const camera = this.scene.cameras.main;
    const rect = this.scene.game.canvas.getBoundingClientRect();
    return new Phaser.Math.Vector2(
      rect.left + camera.x + (world.x - camera.worldView.x) * camera.zoom,
      rect.top + camera.y + (world.y - camera.worldView.y) * camera.zoom,
    );
  }

  private isRejectedMessage(message: string): boolean {
    return /no longer|not available|no adjacent|select .* first|already |cannot|can't|blocked|not enough|must /i.test(message);
  }

  private readonly handleUiPointerDown = (event: PointerEvent): void => {
    this.ensureAudioContext();
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('.card:not(:disabled)')) {
      this.playUiTone(410, 650, 0.045, 0.024);
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
    this.playUiTone(500, 590, 0.025, 0.01);
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

  private playManaGain(): void {
    this.playUiTone(520, 860, 0.11, 0.02);
    window.setTimeout(() => this.playUiTone(720, 1050, 0.09, 0.013), 55);
  }

  private playManaSpend(): void {
    this.playUiTone(410, 250, 0.1, 0.018);
  }

  private playRejectedCue(): void {
    this.playUiTone(220, 165, 0.075, 0.013);
  }
}
