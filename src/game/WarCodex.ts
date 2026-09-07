import { CARD_ART } from '../data/cardArt';
import { CARD_DEFINITIONS, type CardDefinitionId } from '../data/cards';
import {
  BATTLEFIELD_CODEX,
  SITE_CODEX_IDS,
  TERRAIN_CODEX_IDS,
  type BattlefieldCodexId,
} from '../data/battlefieldCodex';
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
const DEFAULT_BATTLEFIELD: BattlefieldCodexId = 'forest';

type CodexBook = 'units' | 'battlefield';

const prettyMechanicName = (value: string): string =>
  value.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

const factionLabel = (faction: Faction): string => faction === 'human' ? 'Human' : 'Undead';

export class WarCodex {
  private readonly root: HTMLElement;
  private readonly launchButton: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly navigation: HTMLElement;
  private readonly showcase: HTMLElement;
  private readonly cardMount: HTMLElement;
  private readonly indexBook: HTMLElement;
  private readonly indexTitle: HTMLElement;
  private readonly unitName: HTMLElement;
  private readonly unitFactionRole: HTMLElement;
  private readonly tagline: HTMLElement;
  private readonly mechanicsTitle: HTMLElement;
  private readonly mechanics: HTMLElement;
  private readonly statsSection: HTMLElement;
  private readonly statsTitle: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly strongTitle: HTMLElement;
  private readonly weakTitle: HTMLElement;
  private readonly strongAgainst: HTMLElement;
  private readonly weakAgainst: HTMLElement;
  private readonly cardCaption: HTMLElement;
  private selectedBook: CodexBook = 'units';
  private selectedUnit: CodexUnitId = DEFAULT_UNIT;
  private selectedBattlefield: BattlefieldCodexId = DEFAULT_BATTLEFIELD;
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
    this.showcase = this.requireElement<HTMLElement>('[data-codex-showcase]');
    this.cardMount = this.requireElement<HTMLElement>('[data-codex-card]');
    this.indexBook = this.requireElement<HTMLElement>('[data-codex-index-book]');
    this.indexTitle = this.requireElement<HTMLElement>('[data-codex-index-title]');
    this.unitName = this.requireElement<HTMLElement>('[data-codex-name]');
    this.unitFactionRole = this.requireElement<HTMLElement>('[data-codex-faction-role]');
    this.tagline = this.requireElement<HTMLElement>('[data-codex-tagline]');
    this.mechanicsTitle = this.requireElement<HTMLElement>('[data-codex-mechanics-title]');
    this.mechanics = this.requireElement<HTMLElement>('[data-codex-mechanics]');
    this.statsSection = this.requireElement<HTMLElement>('[data-codex-stats-section]');
    this.statsTitle = this.requireElement<HTMLElement>('[data-codex-stats-title]');
    this.stats = this.requireElement<HTMLElement>('[data-codex-stats]');
    this.strongTitle = this.requireElement<HTMLElement>('[data-codex-strong-title]');
    this.weakTitle = this.requireElement<HTMLElement>('[data-codex-weak-title]');
    this.strongAgainst = this.requireElement<HTMLElement>('[data-codex-strong]');
    this.weakAgainst = this.requireElement<HTMLElement>('[data-codex-weak]');
    this.cardCaption = this.requireElement<HTMLElement>('[data-codex-caption]');

    this.launchButton.addEventListener('click', () => this.open());
    this.closeButton.addEventListener('click', () => this.close());
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-codex-book]')) {
      button.addEventListener('click', () => this.selectBook(button.dataset.codexBook as CodexBook));
    }
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
        <div class="war-codex-books" aria-label="Codex books">
          <button class="war-codex-book-tab" type="button" data-codex-book="units">Book I · Units</button>
          <button class="war-codex-book-tab" type="button" data-codex-book="battlefield">Book II · Battlefield</button>
        </div>
        <button class="war-codex-close" type="button" data-codex-close aria-label="Close the War Codex" title="Close Codex">×</button>
        <div class="war-codex-body">
          <nav class="war-codex-index" aria-label="War Codex index">
            <div class="war-codex-index-heading">
              <span data-codex-index-book></span>
              <strong data-codex-index-title></strong>
            </div>
            <div data-codex-navigation></div>
          </nav>

          <section class="war-codex-showcase" data-codex-showcase aria-label="Selected Codex entry">
            <div class="war-codex-card-aura" aria-hidden="true"></div>
            <div class="war-codex-card-frame" data-codex-card></div>
            <div class="war-codex-card-caption" data-codex-caption aria-hidden="true"></div>
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
              <h3 data-codex-mechanics-title></h3>
              <div class="war-codex-mechanics" data-codex-mechanics></div>
            </section>

            <section class="war-codex-section" data-codex-stats-section>
              <h3 data-codex-stats-title></h3>
              <div class="war-codex-stats" data-codex-stats></div>
            </section>

            <div class="war-codex-matchups">
              <section class="war-codex-section war-codex-strong">
                <h3 data-codex-strong-title></h3>
                <ul data-codex-strong></ul>
              </section>
              <section class="war-codex-section war-codex-weak">
                <h3 data-codex-weak-title></h3>
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
    this.root.dataset.mode = this.selectedBook;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-codex-book]')) {
      const selected = button.dataset.codexBook === this.selectedBook;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', `${selected}`);
    }

    if (this.selectedBook === 'units') this.renderUnitBook();
    else this.renderBattlefieldBook();
    this.animateEntry();
  }

  private renderUnitBook(): void {
    const definition = getCodexUnitDefinition(this.selectedUnit);
    const entry = UNIT_CODEX[this.selectedUnit];
    const faction = definition.faction as Faction;
    this.root.dataset.faction = faction;
    this.indexBook.textContent = 'Book I';
    this.indexTitle.textContent = 'Units';
    this.showcase.setAttribute('aria-label', `${definition.name} card`);
    this.cardCaption.textContent = 'Move the pointer across the card';

    this.renderUnitNavigation();
    this.renderCard();

    this.unitName.textContent = definition.name;
    this.unitFactionRole.textContent = `${factionLabel(faction)} • ${entry.role}`;
    this.tagline.textContent = entry.tagline;
    this.mechanicsTitle.innerHTML = '<span aria-hidden="true">◆</span> Traits &amp; Abilities';
    this.renderUnitMechanics();
    this.statsSection.hidden = false;
    this.statsTitle.innerHTML = '<span aria-hidden="true">◆</span> Battle Record';
    this.renderStats();
    this.strongTitle.innerHTML = '<span aria-hidden="true">✦</span> Strong Against';
    this.weakTitle.innerHTML = '<span aria-hidden="true">✧</span> Weak Against';
    this.renderList(this.strongAgainst, entry.strongAgainst);
    this.renderList(this.weakAgainst, entry.weakAgainst);
  }

  private renderBattlefieldBook(): void {
    const entry = BATTLEFIELD_CODEX[this.selectedBattlefield];
    this.root.removeAttribute('data-faction');
    this.indexBook.textContent = 'Book II';
    this.indexTitle.textContent = 'Battlefield';
    this.showcase.setAttribute('aria-label', `${entry.name} battlefield entry`);
    this.cardCaption.textContent = entry.group === 'terrain' ? 'A plate of the battlefield terrain' : 'A landmark from the field';

    this.renderBattlefieldNavigation();
    this.renderBattlefieldShowcase();

    this.unitName.textContent = entry.name;
    this.unitFactionRole.textContent = entry.kind.toUpperCase();
    this.tagline.textContent = entry.tagline;
    this.mechanicsTitle.innerHTML = '<span aria-hidden="true">◆</span> Field Rules';
    this.renderBattlefieldRules(entry.rules);
    this.statsSection.hidden = true;
    this.strongTitle.innerHTML = '<span aria-hidden="true">✦</span> Best For';
    this.weakTitle.innerHTML = '<span aria-hidden="true">✧</span> Beware';
    this.renderList(this.strongAgainst, entry.bestFor);
    this.renderList(this.weakAgainst, entry.beware);
  }

  private renderUnitNavigation(): void {
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
        const button = this.navigationButton(definition.name, unitId === this.selectedUnit);
        button.dataset.unitId = unitId;
        button.addEventListener('click', () => this.selectUnit(unitId));
        list.append(button);
      }
      group.append(list);
      this.navigation.append(group);
    }
  }

  private renderBattlefieldNavigation(): void {
    this.navigation.replaceChildren();
    const groups: Array<{ title: string; glyph: string; ids: readonly BattlefieldCodexId[] }> = [
      { title: 'Terrain', glyph: '⬡', ids: TERRAIN_CODEX_IDS },
      { title: 'Sites & Places', glyph: '⚑', ids: SITE_CODEX_IDS },
    ];
    for (const groupData of groups) {
      const group = document.createElement('section');
      group.className = 'war-codex-faction war-codex-battlefield-group';
      const heading = document.createElement('h3');
      heading.innerHTML = `<span aria-hidden="true">${groupData.glyph}</span>${groupData.title}`;
      group.append(heading);

      const list = document.createElement('div');
      list.className = 'war-codex-unit-list';
      for (const id of groupData.ids) {
        const entry = BATTLEFIELD_CODEX[id];
        const button = this.navigationButton(entry.name, id === this.selectedBattlefield);
        button.classList.add('war-codex-battlefield-link');
        button.dataset.battlefieldId = id;
        button.addEventListener('click', () => this.selectBattlefield(id));
        list.append(button);
      }
      group.append(list);
      this.navigation.append(group);
    }
  }

  private navigationButton(label: string, selected: boolean): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'war-codex-unit-link';
    button.textContent = label;
    button.setAttribute('aria-current', selected ? 'true' : 'false');
    if (selected) button.classList.add('is-selected');
    return button;
  }

  private renderCard(): void {
    const definition = getCodexUnitDefinition(this.selectedUnit);
    const cardId = this.selectedUnit as CardDefinitionId;
    const definitionCard = CARD_DEFINITIONS[cardId];
    if (!definitionCard || definitionCard.type !== 'unit') {
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

  private renderBattlefieldShowcase(): void {
    const entry = BATTLEFIELD_CODEX[this.selectedBattlefield];
    const showcase = document.createElement('div');
    showcase.className = 'codex-battlefield-showcase';
    const plinth = document.createElement('span');
    plinth.className = 'codex-tile-plinth';
    plinth.setAttribute('aria-hidden', 'true');
    const art = document.createElement('div');
    art.className = 'codex-battlefield-art';

    if (entry.art.length > 0) {
      for (const layer of entry.art) {
        const image = document.createElement('img');
        image.className = `codex-battlefield-layer ${layer.className ?? ''}`.trim();
        image.src = layer.url;
        image.alt = '';
        image.draggable = false;
        art.append(image);
      }
    } else {
      const glyph = document.createElement('span');
      glyph.className = 'codex-battlefield-glyph';
      glyph.textContent = entry.glyph ?? '⬡';
      art.append(glyph);
    }

    showcase.append(plinth, art);
    this.cardMount.replaceChildren(showcase);
  }

  private renderUnitMechanics(): void {
    const definition = getCodexUnitDefinition(this.selectedUnit);
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

  private renderBattlefieldRules(rules: readonly string[]): void {
    this.mechanics.replaceChildren();
    const wrapper = document.createElement('div');
    wrapper.className = 'war-codex-field-rules';
    for (const rule of rules) {
      const row = document.createElement('div');
      row.className = 'war-codex-field-rule';
      row.textContent = rule;
      wrapper.append(row);
    }
    this.mechanics.append(wrapper);
  }

  private renderStats(): void {
    const definition = getCodexUnitDefinition(this.selectedUnit);
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

  private selectBook(book: CodexBook): void {
    if (book !== 'units' && book !== 'battlefield') return;
    if (book === this.selectedBook) return;
    this.selectedBook = book;
    this.render();
  }

  private selectUnit(id: CodexUnitId): void {
    if (id === this.selectedUnit) return;
    this.selectedUnit = id;
    this.render();
  }

  private selectBattlefield(id: BattlefieldCodexId): void {
    if (id === this.selectedBattlefield) return;
    this.selectedBattlefield = id;
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

  private animateEntry(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const panels = [
      this.cardMount,
      this.unitName.closest('.war-codex-entry-header'),
      this.tagline,
      this.mechanics,
      this.statsSection.hidden ? null : this.stats,
    ].filter((element): element is Element => element !== null);
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

  private open(): void {
    if (this.closeTimer !== null) {
      window.clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    document.querySelector<HTMLElement>('#app')?.classList.add('war-codex-active');
    window.requestAnimationFrame(() => {
      this.root.classList.add('is-open');
      const selected = this.root.querySelector<HTMLButtonElement>('.war-codex-unit-link.is-selected');
      (selected ?? this.closeButton).focus({ preventScroll: true });
    });
  }

  private close(): void {
    if (this.root.hidden) return;
    this.root.classList.remove('is-open');
    this.root.setAttribute('aria-hidden', 'true');
    document.querySelector<HTMLElement>('#app')?.classList.remove('war-codex-active');
    if (this.closeTimer !== null) window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => {
      this.root.hidden = true;
      this.closeTimer = null;
      this.previousFocus?.focus({ preventScroll: true });
    }, 230);
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
    )].filter((element) => !element.hidden && element.getClientRects().length > 0);
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
