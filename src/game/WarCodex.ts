import { CARD_ART } from '../data/cardArt';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import {
  ABILITY_DESCRIPTIONS,
  TRAIT_DESCRIPTIONS,
  UNIT_CODEX,
  getCodexUnitDefinition,
  getCodexUnitsByFaction,
  type CodexUnitId,
} from '../data/codex';
import type { Ability, Faction, Trait } from '../data/types';

const FACTIONS: readonly Faction[] = ['human', 'undead'];
const DEFAULT_UNIT: CodexUnitId = 'vampire';

const prettyMechanicName = (value: string): string =>
  value.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const factionLabel = (faction: Faction): string => faction === 'human' ? 'Human' : 'Undead';

export class WarCodex {
  private readonly root: HTMLElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly navigation: HTMLElement;
  private readonly cardMount: HTMLElement;
  private readonly unitName: HTMLElement;
  private readonly unitFactionRole: HTMLElement;
  private readonly tagline: HTMLElement;
  private readonly mechanics: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly strongAgainst: HTMLElement;
  private readonly weakAgainst: HTMLElement;
  private selectedId: CodexUnitId = DEFAULT_UNIT;
  private previousFocus: HTMLElement | null = null;
  private closeTimer: number | null = null;

  constructor() {
    const endTurn = document.querySelector<HTMLButtonElement>('#end-turn-button');
    if (!endTurn?.parentElement) throw new Error('War Codex requires the End Turn control.');

    const primaryActions = document.createElement('div');
    primaryActions.className = 'turn-primary-actions';
    endTurn.parentElement.insertBefore(primaryActions, endTurn);

    this.launchButton = document.createElement('button');
    this.launchButton.id = 'war-codex-button';
    this.launchButton.className = 'war-codex-launch';
    this.launchButton.type = 'button';
    this.launchButton.title = 'Open the War Codex';
    this.launchButton.setAttribute('aria-label', 'Open the War Codex');
    this.launchButton.innerHTML = '<span class="war-codex-launch-icon" aria-hidden="true">📖</span><span>Codex</span>';
    primaryActions.append(this.launchButton, endTurn);

    this.root = this.createOverlay();
    document.querySelector<HTMLElement>('#app')?.append(this.root);

    this.closeButton = this.requireElement<HTMLButtonElement>('[data-codex-close]');
    this.navigation = this.requireElement<HTMLElement>('[data-codex-navigation]');
    this.cardMount = this.requireElement<HTMLElement>('[data-codex-card]');
    this.unitName = this.requireElement<HTMLElement>('[data-codex-name]');
    this.unitFactionRole = this.requireElement<HTMLElement>('[data-codex-faction-role]');
    this.tagline = this.requireElement<HTMLElement>('[data-codex-tagline]');
    this.mechanics = this.requireElement<HTMLElement>('[data-codex-mechanics]');
    this.stats = this.requireElement<HTMLElement>('[data-codex-stats]');
    this.strongAgainst = this.requireElement<HTMLElement>('[data-codex-strong]');
    this.weakAgainst = this.requireElement<HTMLElement>('[data-codex-weak]');

    this.launchButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    document.addEventListener('keydown', this.handleKeyDown);

    this.render();
  }

  private createOverlay(): HTMLElement {
    const root = document.createElement('section');
    root.id = 'war-codex';
    root.className = 'war-codex';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('aria-labelledby', 'war-codex-title');
    root.innerHTML = `
      <div class="war-codex-backdrop" aria-hidden="true"></div>
      <div class="war-codex-book" role="document">
        <header class="war-codex-header">
          <div class="war-codex-title-ornament" aria-hidden="true">✦</div>
          <div>
            <span class="war-codex-kicker">A Field Chronicle of Armies &amp; Arcana</span>
            <h1 id="war-codex-title">The War Codex</h1>
          </div>
          <div class="war-codex-title-ornament" aria-hidden="true">✦</div>
        </header>
        <button class="war-codex-close" type="button" data-codex-close aria-label="Close the War Codex" title="Close Codex">×</button>
        <div class="war-codex-body">
          <nav class="war-codex-index" aria-label="War Codex unit index">
            <div class="war-codex-index-heading">
              <span>Book I</span>
              <strong>Units</strong>
            </div>
            <div data-codex-navigation></div>
          </nav>

          <section class="war-codex-showcase" aria-label="Selected unit card">
            <div class="war-codex-card-aura" aria-hidden="true"></div>
            <div class="war-codex-card-frame" data-codex-card></div>
            <div class="war-codex-card-caption" aria-hidden="true">Move the pointer across the card</div>
          </section>

          <article class="war-codex-details">
            <header class="war-codex-entry-header">
              <span class="war-codex-entry-rune" aria-hidden="true">❧</span>
              <div>
                <h2 data-codex-name></h2>
                <p data-codex-faction-role></p>
              </div>
            </header>
            <p class="war-codex-tagline" data-codex-tagline></p>

            <section class="war-codex-section">
              <h3><span aria-hidden="true">◆</span> Traits &amp; Abilities</h3>
              <div class="war-codex-mechanics" data-codex-mechanics></div>
            </section>

            <section class="war-codex-section">
              <h3><span aria-hidden="true">◆</span> Battle Record</h3>
              <div class="war-codex-stats" data-codex-stats></div>
            </section>

            <div class="war-codex-matchups">
              <section class="war-codex-section war-codex-strong">
                <h3><span aria-hidden="true">✦</span> Strong Against</h3>
                <ul data-codex-strong></ul>
              </section>
              <section class="war-codex-section war-codex-weak">
                <h3><span aria-hidden="true">✧</span> Weak Against</h3>
                <ul data-codex-weak></ul>
              </section>
            </div>
          </article>
        </div>
        <div class="war-codex-spine" aria-hidden="true"></div>
        <div class="war-codex-corner war-codex-corner-nw" aria-hidden="true"></div>
        <div class="war-codex-corner war-codex-corner-ne" aria-hidden="true"></div>
        <div class="war-codex-corner war-codex-corner-sw" aria-hidden="true"></div>
        <div class="war-codex-corner war-codex-corner-se" aria-hidden="true"></div>
      </div>`;
    return root;
  }

  private requireElement<T extends Element>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`War Codex is missing ${selector}.`);
    return element;
  }

  private render(): void {
    const definition = getCodexUnitDefinition(this.selectedId);
    const entry = UNIT_CODEX[this.selectedId];
    const faction = definition.faction as Faction;
    this.root.dataset.faction = faction;

    this.renderNavigation();
    this.renderCard();

    this.unitName.textContent = definition.name;
    this.unitFactionRole.textContent = `${factionLabel(faction)} • ${entry.role}`;
    this.tagline.textContent = entry.tagline;
    this.renderMechanics();
    this.renderStats();
    this.renderList(this.strongAgainst, entry.strongAgainst);
    this.renderList(this.weakAgainst, entry.weakAgainst);

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const panels = [this.cardMount, this.unitName.closest('.war-codex-entry-header'), this.tagline, this.mechanics, this.stats]
        .filter((element): element is Element => element !== null);
      for (const panel of panels) {
        panel.animate(
          [
            { opacity: 0.35, transform: 'translateY(5px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
    }
  }

  private renderNavigation(): void {
    this.navigation.replaceChildren();
    for (const faction of FACTIONS) {
      const group = document.createElement('section');
      group.className = `war-codex-faction war-codex-faction-${faction}`;

      const heading = document.createElement('h3');
      heading.innerHTML = `<span aria-hidden="true">${faction === 'human' ? '♔' : '☾'}</span>${factionLabel(faction)}`;
      group.append(heading);

      const list = document.createElement('div');
      list.className = 'war-codex-unit-list';
      for (const unitId of getCodexUnitsByFaction(faction)) {
        const definition = getCodexUnitDefinition(unitId);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'war-codex-unit-link';
        button.dataset.unitId = unitId;
        button.textContent = definition.name;
        button.setAttribute('aria-current', unitId === this.selectedId ? 'true' : 'false');
        if (unitId === this.selectedId) button.classList.add('is-selected');
        button.addEventListener('click', () => this.selectUnit(unitId));
        list.append(button);
      }
      group.append(list);
      this.navigation.append(group);
    }
  }

  private renderCard(): void {
    const definition = getCodexUnitDefinition(this.selectedId);
    const cardId = this.selectedId as CardDefinitionId;
    const cardDefinition = CARD_DEFINITIONS[cardId];
    if (!cardDefinition || cardDefinition.type !== 'unit') {
      throw new Error(`${definition.name} does not resolve to a unit card.`);
    }

    const cardArt = CARD_ART[cardId];
    const card = document.createElement('div');
    card.className = 'card codex-hero-card';
    card.tabIndex = 0;
    card.dataset.holoStyle = definition.faction === 'undead' ? 'cosmos' : 'radiant';
    card.style.setProperty('--card-mask', `url("${cardArt}")`);
    card.setAttribute('aria-label', `${definition.name} showcase card`);
    card.innerHTML = `
      <span class="card-surface">
        <img class="card-art" src="${cardArt}" alt="${definition.name} card" draggable="false" decoding="async">
        <span class="card-holo" aria-hidden="true"></span>
        <span class="card-glare" aria-hidden="true"></span>
      </span>`;
    card.addEventListener('pointermove', (event) => this.tiltCard(card, event));
    card.addEventListener('pointerleave', () => this.resetCardTilt(card));
    card.addEventListener('blur', () => this.resetCardTilt(card));
    this.cardMount.replaceChildren(card);
  }

  private renderMechanics(): void {
    const definition = getCodexUnitDefinition(this.selectedId);
    this.mechanics.replaceChildren();

    const mechanics: Array<{ name: string; description: string }> = definition.traits.map((trait) => ({
      name: prettyMechanicName(trait),
      description: TRAIT_DESCRIPTIONS[trait as Trait],
    }));
    if (definition.ability) {
      mechanics.push({
        name: prettyMechanicName(definition.ability),
        description: ABILITY_DESCRIPTIONS[definition.ability as Ability],
      });
    }

    if (mechanics.length === 0) {
      const plain = document.createElement('p');
      plain.className = 'war-codex-none';
      plain.textContent = 'No special doctrine.';
      this.mechanics.append(plain);
      return;
    }

    for (const mechanic of mechanics) {
      const row = document.createElement('div');
      row.className = 'war-codex-mechanic';
      const sigil = document.createElement('span');
      sigil.className = 'war-codex-mechanic-sigil';
      sigil.setAttribute('aria-hidden', 'true');
      sigil.textContent = '✥';
      const copy = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = mechanic.name;
      const description = document.createElement('span');
      description.textContent = mechanic.description;
      copy.append(name, description);
      row.append(sigil, copy);
      this.mechanics.append(row);
    }
  }

  private renderStats(): void {
    const definition = getCodexUnitDefinition(this.selectedId);
    const values: Array<[string, string, string]> = [
      ['◆', 'Mana', `${definition.cost}`],
      ['♥', 'Health', `${definition.maxHp}`],
      ['⚔', 'Attack', definition.normalAttack === false ? '—' : `${definition.attack}`],
      ['➜', 'Move', `${definition.move}`],
      ['◎', 'Range', `${definition.range}`],
    ];
    this.stats.replaceChildren();
    for (const [icon, label, value] of values) {
      const item = document.createElement('div');
      item.className = 'war-codex-stat';
      item.innerHTML = `<span class="war-codex-stat-icon" aria-hidden="true">${icon}</span><span>${label}</span><strong>${value}</strong>`;
      this.stats.append(item);
    }
  }

  private renderList(target: HTMLElement, values: readonly string[]): void {
    target.replaceChildren();
    for (const value of values) {
      const item = document.createElement('li');
      item.textContent = value;
      target.append(item);
    }
  }

  private selectUnit(id: CodexUnitId): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.render();
  }

  private tiltCard(card: HTMLElement, event: PointerEvent): void {
    if (event.pointerType === 'touch') return;
    const rect = card.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 20}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 24}deg`);
    card.style.setProperty('--shine-x', `${x * 100}%`);
    card.style.setProperty('--shine-y', `${y * 100}%`);
    card.style.setProperty('--holo-x', `${(1 - x) * 100}%`);
    card.style.setProperty('--holo-y', `${(1 - y) * 100}%`);
  }

  private resetCardTilt(card: HTMLElement): void {
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--shine-x', '50%');
    card.style.setProperty('--shine-y', '50%');
    card.style.setProperty('--holo-x', '50%');
    card.style.setProperty('--holo-y', '50%');
  }

  private open(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    document.querySelector('#app')?.classList.add('war-codex-open');
    window.requestAnimationFrame(() => {
      this.root.classList.add('is-open');
      this.closeButton.focus();
    });
  }

  private close(): void {
    if (this.root.hidden) return;
    this.root.classList.remove('is-open');
    const finish = (): void => {
      this.root.hidden = true;
      this.root.setAttribute('aria-hidden', 'true');
      document.querySelector('#app')?.classList.remove('war-codex-open');
      this.previousFocus?.focus();
      this.closeTimer = null;
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else this.closeTimer = window.setTimeout(finish, 220);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.root.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...this.root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hidden && element.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
