import type Phaser from 'phaser';
import type { GameState, PlayerId, VictoryCountdown } from '../data/types';
import './BattlePresentation.css';

interface Snapshot {
  currentPlayer: PlayerId;
  countdown: VictoryCountdown | null;
  winner: PlayerId | null;
}

interface BannerMessage {
  title: string;
  subtitle?: string;
  className?: string;
  duration?: number;
}

const snapshot = (state: GameState): Snapshot => ({
  currentPlayer: state.currentPlayer,
  countdown: state.countdown ? { ...state.countdown } : null,
  winner: state.winner,
});

export class BattlePresentation {
  private previous: Snapshot;
  private banner?: HTMLDivElement;
  private queue: BannerMessage[] = [];
  private playing = false;

  constructor(private readonly scene: Phaser.Scene, initialState: GameState) {
    this.previous = snapshot(initialState);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  sync(state: GameState): void {
    const next = snapshot(state);

    if (next.winner !== this.previous.winner && next.winner) {
      this.enqueue({
        title: next.winner === 1 ? 'Victory' : 'Defeat',
        subtitle: 'The final countdown is complete',
        className: `victory player-${next.winner}`,
        duration: 1050,
      });
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

    if (next.currentPlayer !== this.previous.currentPlayer) {
      this.enqueue({
        title: next.currentPlayer === 1 ? 'Your Turn' : 'Enemy Turn',
        className: `player-${next.currentPlayer}`,
        duration: 560,
      });
    }

    this.previous = next;
  }

  private enqueue(message: BannerMessage): void {
    this.queue.push(message);
    if (!this.playing) void this.playNext();
  }

  private async playNext(): Promise<void> {
    const message = this.queue.shift();
    if (!message) {
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
    this.playing = false;
  }
}
