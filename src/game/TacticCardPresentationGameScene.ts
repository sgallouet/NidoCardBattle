import type { CardDefinitionId } from '../data/cards';
import { CARD_DEFINITIONS } from '../data/cards';
import type { Coord, GameState } from '../data/types';
import {
  getTacticTargetCoords,
  getTacticTargets,
} from './engine';
import { EnemyTurnPresentationGameScene } from './EnemyTurnPresentationGameScene';
import './TacticCardPresentation.css';

interface TacticPresentationInternals {
  state: GameState;
  animationInProgress: boolean;
  selectedCardIndex: number | null;
  mode: string | null;
  handleHexClick: (coord: Coord) => Promise<void>;
  animatePlayedCard: (index: number) => void;
  playTacticSound: (cardId: CardDefinitionId) => void;
  renderAll: () => void;
  center: (coord: Coord) => { x: number; y: number };
}

const sameCoord = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;

/**
 * Presentation-only wrapper around the existing tactic resolution path.
 * Gameplay still resolves exclusively through AiGameScene/engine.
 */
export class TacticCardPresentationGameScene extends EnemyTurnPresentationGameScene {
  private suppressLegacyCardFlight = false;
  private deferTacticSound = false;
  private pendingTacticSound: CardDefinitionId | null = null;

  create(): void {
    super.create();

    const game = this as unknown as TacticPresentationInternals;
    const originalHandleHexClick = game.handleHexClick.bind(this);
    const originalAnimatePlayedCard = game.animatePlayedCard.bind(this);
    const originalPlayTacticSound = game.playTacticSound.bind(this);

    game.animatePlayedCard = (index) => {
      if (this.suppressLegacyCardFlight) return;
      originalAnimatePlayedCard(index);
    };

    game.playTacticSound = (cardId) => {
      if (this.deferTacticSound) {
        this.pendingTacticSound = cardId;
        return;
      }
      originalPlayTacticSound(cardId);
    };

    game.handleHexClick = async (coord) => {
      if (game.animationInProgress || game.mode !== 'card' || game.selectedCardIndex === null) {
        await originalHandleHexClick(coord);
        return;
      }

      const cardIndex = game.selectedCardIndex;
      const cardId = game.state.players[game.state.currentPlayer].hand[cardIndex] as CardDefinitionId | undefined;
      if (!cardId) {
        await originalHandleHexClick(coord);
        return;
      }
      const card = CARD_DEFINITIONS[cardId];
      if (!card || card.type !== 'tactic' || !this.isValidTacticTarget(game.state, cardId, coord)) {
        await originalHandleHexClick(coord);
        return;
      }

      const source = document.querySelector<HTMLButtonElement>(`.card[data-hand-index="${cardIndex}"]`);
      if (!source) {
        await originalHandleHexClick(coord);
        return;
      }

      const presentation = this.createPresentation(source, cardId, coord, game);
      game.animationInProgress = true;
      game.renderAll();

      try {
        await presentation.reveal();

        this.suppressLegacyCardFlight = true;
        this.deferTacticSound = true;
        this.pendingTacticSound = null;
        await originalHandleHexClick(coord);
        this.suppressLegacyCardFlight = false;
        this.deferTacticSound = false;

        // The normal engine path cleared card selection only when resolution succeeded.
        const succeeded = game.selectedCardIndex === null;
        if (!succeeded) {
          presentation.cancel();
          return;
        }

        await presentation.cast(() => {
          if (!this.pendingTacticSound) return;
          originalPlayTacticSound(this.pendingTacticSound);
          this.pendingTacticSound = null;
        });
      } finally {
        this.suppressLegacyCardFlight = false;
        this.deferTacticSound = false;
        this.pendingTacticSound = null;
        presentation.destroy();
        game.animationInProgress = false;
        game.renderAll();
      }
    };
  }

  private isValidTacticTarget(state: GameState, cardId: CardDefinitionId, coord: Coord): boolean {
    return getTacticTargetCoords(state, cardId).some((target) => sameCoord(target, coord))
      || getTacticTargets(state, cardId).some((target) => sameCoord(target.coord, coord));
  }

  private createPresentation(
    source: HTMLButtonElement,
    cardId: CardDefinitionId,
    targetCoord: Coord,
    game: TacticPresentationInternals,
  ): {
    reveal: () => Promise<void>;
    cast: (onImpact: () => void) => Promise<void>;
    cancel: () => void;
    destroy: () => void;
  } {
    const rect = source.getBoundingClientRect();
    const target = this.tacticCoordToViewport(targetCoord, game);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const card = CARD_DEFINITIONS[cardId];
    const accent = card.faction === 'undead' ? '#b56cff' : card.faction === 'human' ? '#67d9ff' : '#f3c969';

    const overlay = document.createElement('div');
    overlay.className = 'tactic-cast-overlay';
    overlay.style.setProperty('--tactic-accent', accent);
    overlay.setAttribute('aria-hidden', 'true');

    const focus = document.createElement('div');
    focus.className = 'tactic-cast-focus';

    const caption = document.createElement('div');
    caption.className = 'tactic-cast-caption';
    caption.innerHTML = `<span>TACTIC</span><strong>${card.name}</strong>`;

    const targetFx = document.createElement('div');
    targetFx.className = 'tactic-cast-target';
    targetFx.style.left = `${target.x}px`;
    targetFx.style.top = `${target.y}px`;

    const ghost = source.cloneNode(true) as HTMLButtonElement;
    ghost.disabled = false;
    ghost.classList.remove('selected', 'deal-in', 'touch-hover');
    ghost.classList.add('card-play-ghost', 'tactic-card-play-ghost');
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.setProperty('--tactic-accent', accent);

    overlay.append(focus, targetFx, caption);
    document.body.append(overlay, ghost);

    const sourceCenterX = rect.left + rect.width / 2;
    const sourceCenterY = rect.top + rect.height / 2;
    const stageX = window.innerWidth / 2;
    const stageY = Math.min(window.innerHeight * 0.39, window.innerHeight - rect.height * 0.72);
    const revealX = stageX - sourceCenterX;
    const revealY = stageY - sourceCenterY;
    const targetX = target.x - sourceCenterX;
    const targetY = target.y - sourceCenterY;

    let cancelled = false;

    return {
      reveal: async () => {
        const duration = reducedMotion ? 120 : 280;
        overlay.classList.add('is-revealing');
        const animation = ghost.animate([
          {
            transform: 'perspective(1000px) translate3d(0,0,0) rotateX(0deg) rotateY(0deg) scale(1)',
            filter: 'brightness(1) saturate(1)',
          },
          {
            transform: `perspective(1000px) translate3d(${revealX}px,${revealY}px,90px) rotateX(-3deg) rotateY(4deg) scale(1.18)`,
            filter: 'brightness(1.3) saturate(1.25)',
          },
        ], { duration, easing: 'cubic-bezier(.16,.84,.22,1)', fill: 'forwards' });
        try { await animation.finished; } catch { /* teardown */ }
        if (!reducedMotion && !cancelled) await this.delay(90);
      },
      cast: async (onImpact) => {
        if (cancelled) return;
        targetFx.classList.add('is-armed');
        caption.classList.add('is-casting');
        const duration = reducedMotion ? 180 : 520;
        const animation = ghost.animate([
          {
            transform: `perspective(1000px) translate3d(${revealX}px,${revealY}px,90px) rotateX(-3deg) rotateY(4deg) scale(1.18)`,
            opacity: 1,
            filter: 'brightness(1.3) saturate(1.25)',
          },
          {
            offset: .38,
            transform: `perspective(1000px) translate3d(${revealX + (targetX - revealX) * .54}px,${revealY + (targetY - revealY) * .48 - 54}px,120px) rotateX(-9deg) rotateY(-13deg) rotateZ(-4deg) scale(.9)`,
            opacity: 1,
            filter: 'brightness(1.7) saturate(1.5)',
          },
          {
            offset: .78,
            transform: `perspective(1000px) translate3d(${targetX}px,${targetY - 18}px,55px) rotateX(20deg) rotateY(3deg) rotateZ(2deg) scale(.44)`,
            opacity: .94,
            filter: 'brightness(2.2) saturate(1.55)',
          },
          {
            transform: `perspective(1000px) translate3d(${targetX}px,${targetY}px,0) rotateX(64deg) rotateY(0deg) scale(.16)`,
            opacity: 0,
            filter: 'brightness(4) saturate(1.7) blur(2px)',
          },
        ], { duration, easing: 'cubic-bezier(.2,.76,.18,1)', fill: 'forwards' });

        const impactDelay = Math.round(duration * .76);
        await this.delay(impactDelay);
        if (!cancelled) {
          onImpact();
          targetFx.classList.add('is-impact');
          overlay.classList.add('is-impact');
        }
        try { await animation.finished; } catch { /* teardown */ }
      },
      cancel: () => {
        cancelled = true;
        ghost.animate([
          { opacity: 1 },
          { opacity: 0, transform: `translate3d(${revealX}px,${revealY + 24}px,0) scale(.96)` },
        ], { duration: 140, fill: 'forwards' });
      },
      destroy: () => {
        cancelled = true;
        ghost.remove();
        overlay.remove();
      },
    };
  }

  private tacticCoordToViewport(coord: Coord, game: TacticPresentationInternals): { x: number; y: number } {
    const world = game.center(coord);
    const camera = this.cameras.main;
    const canvasRect = this.game.canvas.getBoundingClientRect();
    return {
      x: canvasRect.left + camera.x + (world.x - camera.worldView.x) * camera.zoom,
      y: canvasRect.top + camera.y + (world.y - camera.worldView.y) * camera.zoom,
    };
  }

  private delay(duration: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, duration));
  }
}
