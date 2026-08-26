import type Phaser from 'phaser';
import type { Coord, GameState, PlayerId, VictoryCountdown } from '../data/types';
import './BattlePresentation.css';

interface Snapshot {
  currentPlayer: PlayerId;
  countdown: VictoryCountdown | null;
  winner: PlayerId | null;
  unitsRemaining: Record<PlayerId, number>;
  commanderCoords: Record<PlayerId, Coord | null>;
}

interface BannerMessage {
  title: string;
  subtitle?: string;
  className?: string;
  duration?: number;
}

const commanderCoord = (state: GameState, player: PlayerId): Coord | null => {
  const commander = state.units.find((unit) => unit.owner === player
    && unit.definitionId.toLowerCase().includes('commander'));
  return commander ? { ...commander.coord } : null;
};

const snapshot = (state: GameState): Snapshot => ({
  currentPlayer: state.currentPlayer,
  countdown: state.countdown ? { ...state.countdown } : null,
  winner: state.winner,
  unitsRemaining: {
    1: state.units.filter((unit) => unit.owner === 1).length,
    2: state.units.filter((unit) => unit.owner === 2).length,
  },
  commanderCoords: {
    1: commanderCoord(state, 1),
    2: commanderCoord(state, 2),
  },
});

export class BattlePresentation {
  private previous: Snapshot;
  private banner?: HTMLDivElement;
  private finale?: HTMLDivElement;
  private finalePresented = false;
  private finaleWorldFx: Phaser.GameObjects.Graphics[] = [];
  private queue: BannerMessage[] = [];
  private playing = false;

  constructor(
    private readonly scene: Phaser.Scene,
    initialState: GameState,
    private readonly center?: (coord: Coord) => Phaser.Math.Vector2,
  ) {
    this.previous = snapshot(initialState);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  sync(state: GameState): void {
    const next = snapshot(state);

    if (next.winner !== this.previous.winner && next.winner) {
      this.presentFinale(state, next);
      this.previous = next;
      return;
    }

    if (!this.previous.countdown && next.countdown) {
      this.enqueue({
        title: 'Commander Fallen',
        subtitle: `Survive ${Math.max(1, 3 - next.countdown.checkpoints)} turns`,
        className: `danger player-${next.countdown.player}`,
        duration: 900,
      });
    } else if (this.previous.countdown && next.countdown
      && this.previous.countdown.player === next.countdown.player
      && next.countdown.checkpoints > this.previous.countdown.checkpoints) {
      const remaining = Math.max(0, 3 - next.countdown.checkpoints);
      if (remaining > 0) {
        this.enqueue({
          title: `Survive ${remaining}`,
          subtitle: remaining === 1 ? 'One checkpoint remains' : `${remaining} checkpoints remain`,
          className: `player-${next.countdown.player}`,
          duration: 720,
        });
      }
    }

    this.previous = next;
  }

  private presentFinale(state: GameState, next: Snapshot): void {
    if (this.finalePresented || !next.winner) return;
    this.finalePresented = true;
    this.queue = [];
    this.banner?.remove();
    this.banner = undefined;

    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const winner = next.winner;
    const defeated: PlayerId = winner === 1 ? 2 : 1;
    const winnerFaction = state.players[winner].faction;
    const localVictory = winner === 1;
    const accent = winnerFaction === 'undead' ? '#b56cff' : '#67d9ff';
    const light = winnerFaction === 'undead' ? '#f0d9ff' : '#ddf8ff';
    const focusCoord = next.commanderCoords[winner]
      ?? this.previous.commanderCoords[defeated]
      ?? next.commanderCoords[defeated];
    const focus = focusCoord ? this.resolveCenter(focusCoord) : null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (focus) {
      if (!reducedMotion) {
        this.scene.cameras.main.pan(focus.x, focus.y, 460, 'Sine.easeInOut', true);
      }
      this.spawnFinaleWorldFx(focus, winnerFaction === 'undead' ? 0xb56cff : 0x67d9ff, reducedMotion);
    }

    const finale = document.createElement('div');
    finale.className = `battle-finale ${localVictory ? 'is-victory' : 'is-defeat'} faction-${winnerFaction}`;
    finale.style.setProperty('--finale-accent', accent);
    finale.style.setProperty('--finale-light', light);
    finale.setAttribute('role', 'dialog');
    finale.setAttribute('aria-modal', 'true');
    finale.setAttribute('aria-label', localVictory ? 'Victory' : 'Defeat');

    const vignette = document.createElement('div');
    vignette.className = 'battle-finale-vignette';
    vignette.setAttribute('aria-hidden', 'true');

    const panel = document.createElement('section');
    panel.className = 'battle-finale-panel';

    const crest = document.createElement('div');
    crest.className = 'battle-finale-crest';
    crest.setAttribute('aria-hidden', 'true');
    crest.innerHTML = '<i></i><i></i><i></i>';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'battle-finale-eyebrow';
    eyebrow.textContent = `${winnerFaction === 'undead' ? 'Undead' : 'Human'} ${localVictory ? 'triumph' : 'victory'}`;

    const title = document.createElement('h2');
    title.textContent = localVictory ? 'Victory' : 'Defeat';

    const subtitle = document.createElement('p');
    subtitle.textContent = localVictory
      ? 'The enemy commander fell and the three-turn survival hold is complete.'
      : 'Your commander fell. The enemy survived the three-turn hold.';

    const playAgain = document.createElement('button');
    playAgain.className = 'battle-finale-play-again';
    playAgain.type = 'button';
    playAgain.textContent = 'Play Again';
    playAgain.addEventListener('click', () => {
      const existingNewGame = document.querySelector<HTMLButtonElement>('#new-game-button');
      existingNewGame?.click();
    });

    panel.append(crest, eyebrow, title, subtitle, playAgain);
    finale.append(vignette, panel);
    app.append(finale);
    this.finale = finale;

    requestAnimationFrame(() => finale.classList.add('is-visible'));
    if (reducedMotion) playAgain.focus({ preventScroll: true });
    else window.setTimeout(() => playAgain.focus({ preventScroll: true }), 720);
  }

  private resolveCenter(coord: Coord): Phaser.Math.Vector2 | null {
    if (this.center) return this.center(coord);
    const sceneCenter = (this.scene as unknown as {
      center?: (target: Coord) => Phaser.Math.Vector2;
    }).center;
    return sceneCenter ? sceneCenter.call(this.scene, coord) : null;
  }

  private spawnFinaleWorldFx(
    focus: Phaser.Math.Vector2,
    color: number,
    reducedMotion: boolean,
  ): void {
    const ring = this.scene.add.graphics()
      .setPosition(focus.x, focus.y)
      .setDepth(9000)
      .setAlpha(0.96);
    ring.fillStyle(color, 0.12);
    ring.fillCircle(0, 0, 52);
    ring.lineStyle(5, color, 0.9);
    ring.strokeCircle(0, 0, 50);
    ring.lineStyle(2, 0xfff5dc, 0.84);
    ring.strokeCircle(0, 0, 40);

    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12;
      const inner = 58 + (index % 2) * 4;
      const outer = inner + 17;
      ring.lineStyle(index % 2 === 0 ? 3 : 2, index % 2 === 0 ? color : 0xfff5dc, 0.76);
      ring.lineBetween(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle) * outer,
        Math.sin(angle) * outer,
      );
    }

    this.finaleWorldFx.push(ring);
    if (reducedMotion) {
      ring.setAlpha(0.72).setScale(1.12);
      return;
    }

    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.7,
      scaleY: 1.7,
      alpha: 0,
      duration: 980,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        ring.destroy();
        this.finaleWorldFx = this.finaleWorldFx.filter((effect) => effect !== ring);
      },
    });

    for (let index = 0; index < 9; index += 1) {
      const spark = this.scene.add.graphics()
        .setPosition(focus.x, focus.y)
        .setDepth(9001);
      const angle = Math.PI * 2 * index / 9 + (index % 2) * 0.16;
      spark.fillStyle(index % 3 === 0 ? 0xfff5dc : color, 0.92);
      spark.fillCircle(0, 0, index % 3 === 0 ? 3.2 : 2.4);
      this.finaleWorldFx.push(spark);
      this.scene.tweens.add({
        targets: spark,
        x: focus.x + Math.cos(angle) * (70 + index * 5),
        y: focus.y + Math.sin(angle) * (46 + index * 3) - 14,
        alpha: 0,
        duration: 640 + index * 28,
        ease: 'Quad.easeOut',
        onComplete: () => {
          spark.destroy();
          this.finaleWorldFx = this.finaleWorldFx.filter((effect) => effect !== spark);
        },
      });
    }
  }

  private enqueue(message: BannerMessage): void {
    if (this.finalePresented) return;
    this.queue.push(message);
    if (!this.playing) void this.playNext();
  }

  private async playNext(): Promise<void> {
    const message = this.queue.shift();
    if (!message || this.finalePresented) {
      this.playing = false;
      return;
    }
    this.playing = true;
    const app = document.querySelector<HTMLElement>('#app');
    if (!app) {
      this.playing = false;
      return this.playNext();
    }

    const banner = document.createElement('div');
    banner.className = `battle-banner ${message.className ?? ''}`.trim();
    const title = document.createElement('strong');
    title.textContent = message.title;
    banner.append(title);
    if (message.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.textContent = message.subtitle;
      banner.append(subtitle);
    }
    app.append(banner);
    this.banner?.remove();
    this.banner = banner;

    const duration = message.duration ?? 620;
    const animation = banner.animate([
      { opacity: 0, transform: 'translate(-50%, -12px) scale(.96)' },
      { offset: .18, opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
      { offset: .72, opacity: 1, transform: 'translate(-50%, 0) scale(1)' },
      { opacity: 0, transform: 'translate(-50%, 7px) scale(1.015)' },
    ], { duration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });

    try {
      await animation.finished;
    } catch {
      // Scene teardown may cancel the animation.
    }
    if (this.banner === banner) this.banner = undefined;
    banner.remove();
    await this.playNext();
  }

  private destroy(): void {
    this.queue = [];
    this.banner?.remove();
    this.banner = undefined;
    this.finale?.remove();
    this.finale = undefined;
    for (const effect of this.finaleWorldFx) effect.destroy();
    this.finaleWorldFx = [];
    this.playing = false;
    this.finalePresented = false;
  }
}
