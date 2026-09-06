import type Phaser from 'phaser';
import type { Coord, Faction, GameState, PlayerId, VictoryCountdown } from '../data/types';
import {
  buildBattleResultPresentation,
  keepAnchorsFromGameState,
  type ArmyResultPresentation,
  type StartingKeepAnchor,
} from './BattleResultPresentation';
import './BattlePresentation.css';

export { describeBattleFinale } from './BattleResultPresentation';

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

export interface BattleFinaleStats {
  round: number;
  survivors: number;
  sitesHeld: number;
  finish: 'Army Eliminated' | 'Hold Complete';
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

export const buildBattleFinaleStats = (state: GameState, winner: PlayerId): BattleFinaleStats => {
  const defeated: PlayerId = winner === 1 ? 2 : 1;
  return {
    round: Math.max(1, Math.ceil(state.turnNumber / 2)),
    survivors: state.units.filter((unit) => unit.owner === winner).length,
    sitesHeld: state.sites.filter((site) => site.owner === winner).length,
    finish: state.units.every((unit) => unit.owner !== defeated) ? 'Army Eliminated' : 'Hold Complete',
  };
};

export class BattlePresentation {
  private previous: Snapshot;
  private banner?: HTMLDivElement;
  private finale?: HTMLDivElement;
  private finalePresented = false;
  private finaleWorldFx: Phaser.GameObjects.Graphics[] = [];
  private finaleTimers: number[] = [];
  private finaleAnimationFrames: number[] = [];
  private queue: BannerMessage[] = [];
  private playing = false;
  private readonly startingKeepAnchors: StartingKeepAnchor[];

  constructor(
    private readonly scene: Phaser.Scene,
    initialState: GameState,
    private readonly center?: (coord: Coord) => Phaser.Math.Vector2,
    options?: { startingKeepAnchors?: StartingKeepAnchor[] },
  ) {
    this.previous = snapshot(initialState);
    this.startingKeepAnchors = options?.startingKeepAnchors ?? keepAnchorsFromGameState(initialState);
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
    this.clearFinaleTimeline();

    const app = document.querySelector<HTMLElement>('#app');
    if (!app) return;

    const winner = next.winner;
    const defeated: PlayerId = winner === 1 ? 2 : 1;
    const result = buildBattleResultPresentation(state, 1, this.startingKeepAnchors);
    const stats = buildBattleFinaleStats(state, winner);
    const winnerFaction = state.players[winner].faction;
    const accent = result.localVictory
      ? (winnerFaction === 'undead' ? '#c48dff' : '#65d9ff')
      : (winnerFaction === 'undead' ? '#8a6aa8' : '#6a8896');
    const light = result.localVictory
      ? (winnerFaction === 'undead' ? '#f4e7ff' : '#fff2b8')
      : (winnerFaction === 'undead' ? '#d9cce4' : '#d5dde2');
    const focusCoord = next.commanderCoords[winner]
      ?? this.previous.commanderCoords[defeated]
      ?? next.commanderCoords[defeated];
    const focus = focusCoord ? this.resolveCenter(focusCoord) : null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (focus) {
      if (!reducedMotion) {
        this.scene.cameras.main.pan(focus.x, focus.y, 380, 'Cubic.easeOut', true);
        this.scene.cameras.main.shake(170, result.localVictory ? 0.004 : 0.0025, true);
      }
      this.spawnFinaleWorldFx(focus, winnerFaction, reducedMotion);
    }

    const finale = document.createElement('div');
    finale.className = `battle-finale ${result.localVictory ? 'is-victory' : 'is-defeat'} faction-${winnerFaction}`;
    finale.style.setProperty('--finale-accent', accent);
    finale.style.setProperty('--finale-light', light);
    finale.setAttribute('role', 'dialog');
    finale.setAttribute('aria-modal', 'true');
    finale.setAttribute('aria-label', result.localVictory ? 'Victory' : 'Defeat');

    const vignette = document.createElement('div');
    vignette.className = 'battle-finale-vignette';
    vignette.setAttribute('aria-hidden', 'true');

    const claim = document.createElement('div');
    claim.className = 'battle-finale-claim';
    claim.setAttribute('aria-hidden', 'true');

    const impact = document.createElement('div');
    impact.className = 'battle-finale-impact';
    impact.setAttribute('aria-hidden', 'true');

    const rays = document.createElement('div');
    rays.className = 'battle-finale-rays';
    rays.setAttribute('aria-hidden', 'true');

    const sparks = document.createElement('div');
    sparks.className = 'battle-finale-sparks';
    sparks.setAttribute('aria-hidden', 'true');
    sparks.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>';

    const sigil = document.createElement('div');
    sigil.className = 'battle-finale-sigil';
    sigil.setAttribute('aria-hidden', 'true');
    sigil.innerHTML = '<i></i><i></i><i></i>';

    const panel = document.createElement('section');
    panel.className = 'battle-finale-panel';

    const crest = document.createElement('div');
    crest.className = 'battle-finale-crest';
    crest.setAttribute('aria-hidden', 'true');
    crest.innerHTML = '<i></i><i></i><i></i>';

    const eyebrow = document.createElement('span');
    eyebrow.className = 'battle-finale-eyebrow';
    eyebrow.textContent = result.factionSubtitle;

    const title = document.createElement('h2');
    title.textContent = result.title;

    const finish = document.createElement('div');
    finish.className = 'battle-finale-finish';
    finish.innerHTML = `<span>Battle Decided</span><strong>${stats.finish}</strong>`;

    const subtitle = document.createElement('p');
    subtitle.textContent = result.subtitle;

    const statStrip = document.createElement('div');
    statStrip.className = 'battle-finale-stats';
    statStrip.append(
      this.createStat('Round', stats.round),
      this.createStat('Survivors', stats.survivors),
      this.createStat('Sites Held', stats.sitesHeld),
    );

    const actions = document.createElement('div');
    actions.className = 'battle-finale-actions';

    const download = document.createElement('button');
    download.className = 'battle-finale-download';
    download.type = 'button';
    download.textContent = 'Battle Log';
    download.addEventListener('click', () => {
      document.querySelector<HTMLButtonElement>('#battle-log-download-button')?.click();
    });

    const playAgain = document.createElement('button');
    playAgain.className = 'battle-finale-play-again';
    playAgain.type = 'button';
    playAgain.textContent = 'Rematch';
    playAgain.addEventListener('click', () => {
      document.querySelector<HTMLButtonElement>('#new-game-button')?.click();
    });

    const armyImage = (side: 'left' | 'right', army: ArmyResultPresentation): HTMLImageElement => {
      const image = document.createElement('img');
      image.className = `battle-finale-army is-${side} is-${army.outcome}`;
      image.src = army.artwork;
      image.alt = '';
      image.draggable = false;
      image.setAttribute('aria-hidden', 'true');
      return image;
    };

    actions.append(playAgain, download);
    panel.append(crest, eyebrow, title, finish, subtitle, statStrip, actions);
    finale.append(
      vignette,
      claim,
      rays,
      sparks,
      sigil,
      armyImage('left', result.left),
      armyImage('right', result.right),
      panel,
      impact,
    );
    document.querySelector<HTMLElement>('#victory-log-actions')?.setAttribute('hidden', '');
    app.classList.add('battle-finale-active');
    app.append(finale);
    this.finale = finale;

    if (reducedMotion) {
      finale.classList.add('is-visible', 'is-claimed', 'is-title', 'is-armies', 'is-stats', 'is-actions');
      this.setStatValues(finale);
      playAgain.focus({ preventScroll: true });
      return;
    }

    requestAnimationFrame(() => finale.classList.add('is-visible', 'is-impact'));
    this.scheduleFinaleStep(145, () => finale.classList.add('is-claimed'));
    this.scheduleFinaleStep(535, () => finale.classList.add('is-title'));
    this.scheduleFinaleStep(930, () => finale.classList.add('is-armies'));
    this.scheduleFinaleStep(1375, () => {
      finale.classList.add('is-stats');
      this.animateStatValues(finale, 460);
    });
    this.scheduleFinaleStep(2040, () => {
      finale.classList.add('is-actions');
      playAgain.focus({ preventScroll: true });
    });
  }

  private createStat(label: string, value: number): HTMLDivElement {
    const item = document.createElement('div');
    item.className = 'battle-finale-stat';
    const valueElement = document.createElement('strong');
    valueElement.textContent = '0';
    valueElement.dataset.finalValue = `${value}`;
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    item.append(valueElement, labelElement);
    return item;
  }

  private setStatValues(finale: HTMLElement): void {
    for (const element of finale.querySelectorAll<HTMLElement>('[data-final-value]')) {
      element.textContent = element.dataset.finalValue ?? '0';
    }
  }

  private animateStatValues(finale: HTMLElement, duration: number): void {
    for (const element of finale.querySelectorAll<HTMLElement>('[data-final-value]')) {
      const target = Number.parseInt(element.dataset.finalValue ?? '0', 10);
      const started = performance.now();
      const step = (now: number): void => {
        if (!element.isConnected) return;
        const progress = Math.min(1, Math.max(0, (now - started) / duration));
        const eased = 1 - ((1 - progress) ** 3);
        element.textContent = `${Math.round(target * eased)}`;
        if (progress < 1) {
          const frame = requestAnimationFrame(step);
          this.finaleAnimationFrames.push(frame);
        } else {
          element.textContent = `${target}`;
        }
      };
      const frame = requestAnimationFrame(step);
      this.finaleAnimationFrames.push(frame);
    }
  }

  private scheduleFinaleStep(delay: number, action: () => void): void {
    const timer = window.setTimeout(() => {
      this.finaleTimers = this.finaleTimers.filter((candidate) => candidate !== timer);
      if (this.finale?.isConnected) action();
    }, delay);
    this.finaleTimers.push(timer);
  }

  private clearFinaleTimeline(): void {
    for (const timer of this.finaleTimers) window.clearTimeout(timer);
    this.finaleTimers = [];
    for (const frame of this.finaleAnimationFrames) cancelAnimationFrame(frame);
    this.finaleAnimationFrames = [];
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
    faction: Faction,
    reducedMotion: boolean,
  ): void {
    const color = faction === 'undead' ? 0xb56cff : 0x67d9ff;
    const secondary = faction === 'undead' ? 0xe7c4ff : 0xffd978;
    const ring = this.scene.add.graphics()
      .setPosition(focus.x, focus.y)
      .setDepth(9000)
      .setAlpha(0.98);
    ring.fillStyle(color, 0.13);
    ring.fillCircle(0, 0, 52);
    ring.lineStyle(5, color, 0.94);
    ring.strokeCircle(0, 0, 50);
    ring.lineStyle(2, secondary, 0.9);
    ring.strokeCircle(0, 0, 40);

    for (let index = 0; index < 12; index += 1) {
      const angle = Math.PI * 2 * index / 12;
      const inner = 58 + (index % 2) * 4;
      const outer = inner + 18;
      ring.lineStyle(index % 2 === 0 ? 3 : 2, index % 2 === 0 ? color : secondary, 0.8);
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
      scaleX: faction === 'undead' ? 1.48 : 1.8,
      scaleY: faction === 'undead' ? 1.48 : 1.8,
      alpha: 0,
      duration: faction === 'undead' ? 1120 : 920,
      ease: 'Cubic.easeOut',
      onComplete: () => this.removeWorldFx(ring),
    });

    for (let index = 0; index < 12; index += 1) {
      const spark = this.scene.add.graphics().setDepth(9001);
      const angle = Math.PI * 2 * index / 12 + (index % 2) * 0.13;
      const radius = 76 + index * 5;
      const startX = faction === 'undead' ? focus.x + Math.cos(angle) * radius : focus.x;
      const startY = faction === 'undead' ? focus.y + Math.sin(angle) * radius * 0.72 : focus.y;
      spark.setPosition(startX, startY);
      spark.fillStyle(index % 3 === 0 ? secondary : color, 0.94);
      spark.fillCircle(0, 0, index % 3 === 0 ? 3.2 : 2.4);
      this.finaleWorldFx.push(spark);

      this.scene.tweens.add({
        targets: spark,
        x: faction === 'undead' ? focus.x : focus.x + Math.cos(angle) * radius,
        y: faction === 'undead' ? focus.y : focus.y + Math.sin(angle) * radius * 0.62 - 14,
        alpha: 0,
        scaleX: faction === 'undead' ? 0.4 : 1.35,
        scaleY: faction === 'undead' ? 0.4 : 1.35,
        duration: 610 + index * 24,
        delay: faction === 'undead' ? index * 18 : 0,
        ease: faction === 'undead' ? 'Sine.easeIn' : 'Quad.easeOut',
        onComplete: () => this.removeWorldFx(spark),
      });
    }
  }

  private removeWorldFx(effect: Phaser.GameObjects.Graphics): void {
    effect.destroy();
    this.finaleWorldFx = this.finaleWorldFx.filter((candidate) => candidate !== effect);
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
    this.clearFinaleTimeline();
    this.queue = [];
    this.banner?.remove();
    this.banner = undefined;
    this.finale?.remove();
    this.finale = undefined;
    document.querySelector<HTMLElement>('#app')?.classList.remove('battle-finale-active');
    for (const effect of this.finaleWorldFx) effect.destroy();
    this.finaleWorldFx = [];
    this.playing = false;
    this.finalePresented = false;
  }
}
