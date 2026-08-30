import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import type { GameState, UnitDefinition, UnitState } from '../data/types';
import { UNIT_DEFINITIONS, type UnitDefinitionId } from '../data/units';
import { effectiveRange, findUnit, unitDefinition } from './engine';
import './UnitInfoInspector.css';

export interface UnitInfoInspectorSceneInternals {
  state: GameState;
  selectedUnitId: string | null;
}

type InspectorMode =
  | { kind: 'selected'; unit: UnitState; definition: UnitDefinition }
  | { kind: 'card'; definition: UnitDefinition; cost: number };

export class UnitInfoInspector {
  private observer?: MutationObserver;
  private hoveredCard?: HTMLButtonElement;

  constructor(private readonly game: UnitInfoInspectorSceneInternals) {}

  install(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (hand) {
      this.bindCards();
      this.observer = new MutationObserver(() => this.bindCards());
      this.observer.observe(hand, { childList: true });
    }
    this.sync();
  }

  sync(): void {
    if (this.hoveredCard?.isConnected) return;
    this.hoveredCard = undefined;
    this.renderSelected();
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.hoveredCard = undefined;
  }

  private bindCards(): void {
    const hand = document.querySelector<HTMLElement>('#hand');
    if (!hand) return;
    for (const button of hand.querySelectorAll<HTMLButtonElement>('.card[data-hand-index]')) {
      if (button.dataset.unitInspectorBound === 'true') continue;
      button.dataset.unitInspectorBound = 'true';
      button.addEventListener('pointerenter', () => this.previewCard(button));
      button.addEventListener('pointerleave', () => this.endCardPreview(button));
      button.addEventListener('focus', () => this.previewCard(button));
      button.addEventListener('blur', () => this.endCardPreview(button));
    }
  }

  private previewCard(button: HTMLButtonElement): void {
    const player = this.game.state.players[this.game.state.currentPlayer];
    const index = Number(button.dataset.handIndex);
    const cardId = player.hand[index] as CardDefinitionId | undefined;
    if (!cardId) return;
    const card = CARD_DEFINITIONS[cardId];
    if (card.type !== 'unit') return;

    const definition = UNIT_DEFINITIONS[card.unitId as UnitDefinitionId];
    if (!definition) return;
    this.hoveredCard = button;
    this.render({ kind: 'card', definition, cost: card.cost });
  }

  private endCardPreview(button: HTMLButtonElement): void {
    if (this.hoveredCard !== button) return;
    this.hoveredCard = undefined;
    this.renderSelected();
  }

  private renderSelected(): void {
    const unit = this.game.selectedUnitId ? findUnit(this.game.state, this.game.selectedUnitId) : undefined;
    if (!unit) {
      const inspector = document.querySelector<HTMLElement>('#unit-inspector');
      if (inspector) inspector.hidden = true;
      return;
    }
    this.render({ kind: 'selected', unit, definition: unitDefinition(unit) });
  }

  private render(mode: InspectorMode): void {
    const inspector = document.querySelector<HTMLElement>('#unit-inspector');
    const target = document.querySelector<HTMLElement>('#selected-unit');
    if (!inspector || !target) return;

    inspector.hidden = false;
    inspector.classList.toggle('is-card-preview', mode.kind === 'card');
    const definition = mode.definition;
    const range = mode.kind === 'selected' ? effectiveRange(mode.unit) : definition.range;
    const hp = mode.kind === 'selected' ? `${mode.unit.hp}/${definition.maxHp}` : `${definition.maxHp}`;
    const attack = definition.normalAttack === false ? '—' : `${definition.attack}`;
    const status = mode.kind === 'selected' ? this.statusFor(mode.unit) : [];
    const tags = [
      ...(definition.ability ? [{ label: definition.ability, kind: 'ability' as const }] : []),
      ...definition.traits.map((trait) => ({ label: trait, kind: 'trait' as const })),
      ...status.map((label) => ({ label, kind: 'status' as const })),
    ];

    target.innerHTML = `
      <div class="unit-sheet-heading">
        <div>
          <span class="unit-sheet-kicker">${mode.kind === 'card' ? `Unit card · ${mode.cost} Mana` : `Player ${mode.unit.owner} unit`}</span>
          <div class="unit-name unit-owner-${mode.kind === 'selected' ? mode.unit.owner : this.game.state.currentPlayer}">${definition.name}</div>
        </div>
        ${mode.kind === 'card' ? '<span class="unit-sheet-preview-badge">Preview</span>' : ''}
      </div>
      <div class="unit-sheet-stats" aria-label="Unit statistics">
        ${this.stat('HP', hp, 'Health')}
        ${this.stat('ATK', attack, definition.normalAttack === false ? 'No normal attack' : 'Attack damage')}
        ${this.stat('MOV', `${definition.move}`, 'Movement')}
        ${this.stat('RNG', `${range}`, range > definition.range ? `Range (${definition.range} base + terrain bonus)` : 'Attack range')}
      </div>
      ${tags.length > 0 ? `<div class="unit-sheet-tags">${tags.map((tag) => `<span class="unit-sheet-tag is-${tag.kind}">${this.escape(tag.label)}</span>`).join('')}</div>` : ''}
      ${mode.kind === 'card' && definition.traits.includes('Ranged') ? '<div class="unit-sheet-note">Ranged units gain +1 Range while on Hills.</div>' : ''}`;
  }

  private stat(label: string, value: string, title: string): string {
    return `<div class="unit-sheet-stat" title="${this.escape(title)}"><span>${label}</span><strong>${this.escape(value)}</strong></div>`;
  }

  private statusFor(unit: UnitState): string[] {
    return [
      unit.exhausted ? 'Exhausted' : '',
      unit.moved ? 'Moved' : '',
      unit.attacked ? 'Attacked' : '',
    ].filter(Boolean);
  }

  private escape(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}
