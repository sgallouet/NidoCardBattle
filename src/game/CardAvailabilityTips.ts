import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState } from '../data/types';
import { getValidSummonCoords } from './engine';
import './CardAvailabilityTips.css';

interface CardAvailabilityTipsOptions {
  getState: () => GameState;
  tileTipsEnabled: () => boolean;
  hideTileInsight: () => void;
}

type BlockReason =
  | { kind: 'mana'; missing: number; cost: number; mana: number }
  | { kind: 'deployment' };

interface BlockContext {
  cardName: string;
  reason: BlockReason;
}

export class CardAvailabilityTips {
  private hand?: HTMLElement;
  private activeCard?: HTMLButtonElement;
  private showTimer: number | null = null;

  constructor(private readonly options: CardAvailabilityTipsOptions) {}

  install(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    this.hand = hand;
    hand.addEventListener('click', this.handleClick, true);
    hand.addEventListener('pointerover', this.handlePointerOver);
    hand.addEventListener('pointerout', this.handlePointerOut);
    hand.addEventListener('focusin', this.handleFocusIn);
    hand.addEventListener('focusout', this.handleFocusOut);
    this.sync();
  }

  destroy(): void {
    this.hand?.removeEventListener('click', this.handleClick, true);
    this.hand?.removeEventListener('pointerover', this.handlePointerOver);
    this.hand?.removeEventListener('pointerout', this.handlePointerOut);
    this.hand?.removeEventListener('focusin', this.handleFocusIn);
    this.hand?.removeEventListener('focusout', this.handleFocusOut);
    this.hand = undefined;
    this.hide();
  }

  sync(): void {
    const hand = this.hand ?? document.querySelector<HTMLElement>('#hand');
    if (!hand) return;

    for (const button of hand.querySelectorAll<HTMLButtonElement>('.card[data-hand-index]')) {
      const context = this.blockContextFor(button);
      const hardDisabled = button.dataset.hardDisabled === 'true' || this.options.getState().winner !== null;
      if (context) {
        button.dataset.availabilityBlocked = context.reason.kind;
        button.setAttribute('aria-disabled', 'true');
        if (!hardDisabled) button.disabled = false;
      } else {
        delete button.dataset.availabilityBlocked;
        button.removeAttribute('aria-disabled');
      }
    }

    if (this.activeCard && (!this.activeCard.isConnected || !this.blockContextFor(this.activeCard))) {
      this.hide(this.activeCard);
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const button = this.cardFromEvent(event);
    if (!button || !this.blockContextFor(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerOver = (event: PointerEvent): void => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    const button = this.cardFromEvent(event);
    if (!button || this.isStillInside(button, event.relatedTarget)) return;
    this.schedule(button, false);
  };

  private readonly handlePointerOut = (event: PointerEvent): void => {
    const button = this.cardFromEvent(event);
    if (!button || this.isStillInside(button, event.relatedTarget)) return;
    this.hide(button);
  };

  private readonly handleFocusIn = (event: FocusEvent): void => {
    const button = this.cardFromEvent(event);
    if (button) this.schedule(button, true);
  };

  private readonly handleFocusOut = (event: FocusEvent): void => {
    const button = this.cardFromEvent(event);
    if (!button || this.isStillInside(button, event.relatedTarget)) return;
    this.hide(button);
  };

  private cardFromEvent(event: Event): HTMLButtonElement | undefined {
    const target = event.target instanceof Element ? event.target : undefined;
    return target?.closest<HTMLButtonElement>('.card[data-hand-index]') ?? undefined;
  }

  private isStillInside(button: HTMLButtonElement, relatedTarget: EventTarget | null): boolean {
    return relatedTarget instanceof Node && button.contains(relatedTarget);
  }

  private blockContextFor(button: HTMLButtonElement): BlockContext | undefined {
    const state = this.options.getState();
    const player = state.players[state.currentPlayer];
    const index = Number(button.dataset.handIndex);
    if (!Number.isInteger(index) || index < 0) return undefined;
    const cardId = player.hand[index] as CardDefinitionId | undefined;
    if (!cardId) return undefined;
    const card = CARD_DEFINITIONS[cardId];

    if (card.cost > player.mana) {
      return {
        cardName: card.name,
        reason: { kind: 'mana', missing: card.cost - player.mana, cost: card.cost, mana: player.mana },
      };
    }
    if (card.type === 'unit' && getValidSummonCoords(state).length === 0) {
      return { cardName: card.name, reason: { kind: 'deployment' } };
    }
    return undefined;
  }

  private schedule(button: HTMLButtonElement, allowWithoutHover: boolean): void {
    if (!this.options.tileTipsEnabled()) return;
    if (!allowWithoutHover && window.matchMedia('(hover: none)').matches) return;
    const context = this.blockContextFor(button);
    if (!context) return;

    this.hide();
    this.activeCard = button;
    this.showTimer = window.setTimeout(() => {
      this.showTimer = null;
      if (this.activeCard !== button || !button.isConnected) return;
      const latest = this.blockContextFor(button);
      if (!latest) {
        this.hide(button);
        return;
      }
      this.render(button, latest.cardName, latest.reason);
    }, 220);
  }

  private hide(button?: HTMLButtonElement): void {
    if (button && this.activeCard !== button) return;
    if (this.showTimer !== null) {
      window.clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.activeCard = undefined;
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    if (!panel) return;
    panel.classList.remove('is-visible');
    panel.setAttribute('aria-hidden', 'true');
    panel.hidden = true;
  }

  private render(button: HTMLButtonElement, cardName: string, reason: BlockReason): void {
    this.options.hideTileInsight();
    const panel = document.querySelector<HTMLElement>('#tile-insight');
    const eyebrow = document.querySelector<HTMLElement>('#tile-insight-eyebrow');
    const title = document.querySelector<HTMLElement>('#tile-insight-title');
    const badge = document.querySelector<HTMLElement>('#tile-insight-badge');
    const rows = document.querySelector<HTMLElement>('#tile-insight-rows');
    if (!panel || !eyebrow || !title || !badge || !rows) return;

    eyebrow.textContent = 'Card unavailable';
    panel.dataset.tone = 'hostile';

    const item = document.createElement('div');
    item.className = 'tile-insight-row';
    const label = document.createElement('span');
    label.className = 'tile-insight-label';
    const copy = document.createElement('span');
    copy.className = 'tile-insight-copy';

    if (reason.kind === 'mana') {
      title.textContent = 'Not enough Mana';
      badge.textContent = `Need ${reason.missing}`;
      label.textContent = 'Mana';
      copy.textContent = `${cardName} costs ${reason.cost}. You have ${reason.mana}; gain ${reason.missing} more to play it.`;
    } else {
      title.textContent = 'No deployment location';
      badge.textContent = 'No site';
      label.textContent = 'Deploy';
      copy.textContent = `${cardName} needs an empty controlled Keep, Fort, or linked Garrison. Capture or clear one first.`;
    }

    item.append(label, copy);
    rows.replaceChildren(item);

    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    this.position(panel, button);
    window.requestAnimationFrame(() => {
      if (!panel.hidden && this.activeCard === button) panel.classList.add('is-visible');
    });
  }

  private position(panel: HTMLElement, button: HTMLButtonElement): void {
    const cardRect = button.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const padding = 12;
    const gap = 12;
    const left = Math.max(
      padding,
      Math.min(
        cardRect.left + cardRect.width / 2 - panelRect.width / 2,
        window.innerWidth - panelRect.width - padding,
      ),
    );
    const top = Math.max(padding, cardRect.top - panelRect.height - gap);
    panel.dataset.side = left + panelRect.width / 2 <= cardRect.left + cardRect.width / 2 ? 'right' : 'left';
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
  }
}
