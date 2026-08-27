import './SettingsMenu.css';

interface OriginalPlacement {
  element: HTMLElement;
  parent: Node;
  nextSibling: ChildNode | null;
}

export class SettingsMenu {
  private root?: HTMLElement;
  private button?: HTMLButtonElement;
  private panel?: HTMLElement;
  private scrim?: HTMLElement;
  private placements: OriginalPlacement[] = [];
  private open = false;

  install(): void {
    const app = document.querySelector<HTMLElement>('#app');
    if (!app || document.querySelector('#settings-menu-button')) return;
    this.root = app;

    const button = document.createElement('button');
    button.id = 'settings-menu-button';
    button.className = 'settings-menu-button';
    button.type = 'button';
    button.title = 'Settings';
    button.setAttribute('aria-label', 'Open settings');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'settings-menu-panel');
    button.innerHTML = '<span aria-hidden="true">⚙</span>';

    const scrim = document.createElement('div');
    scrim.className = 'settings-menu-scrim';
    scrim.hidden = true;

    const panel = document.createElement('aside');
    panel.id = 'settings-menu-panel';
    panel.className = 'settings-menu-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'settings-menu-title');

    const header = document.createElement('header');
    header.className = 'settings-menu-header';
    const heading = document.createElement('div');
    heading.innerHTML = '<span>PLAYTEST</span><strong id="settings-menu-title">Settings</strong>';
    const close = document.createElement('button');
    close.className = 'settings-menu-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Close settings');
    close.textContent = '×';
    header.append(heading, close);
    panel.append(header);

    const gameplay = this.createSection(panel, 'Gameplay');
    this.moveControl('#player-camera-toggle', gameplay, 'Action camera');
    this.moveControl('#enemy-animation-toggle', gameplay, 'Enemy turn');
    this.moveControl('#fullscreen-button', gameplay, 'Display');

    const playtest = this.createSection(panel, 'Playtest');
    this.moveControl('#tile-border-button', playtest, 'Hex borders');
    this.moveControl('#map-render-button', playtest, 'Map renderer');
    this.moveControl('#generated-map-toggle', playtest, 'Map preview');
    this.moveControl('#selection-fx-toggle', playtest, 'Selection FX');

    const match = this.createSection(panel, 'Match');
    this.moveControl('#new-game-button', match, 'New match');

    const developer = this.createSection(panel, 'Developer');
    const debugStatus = document.querySelector<HTMLElement>('#debug-status');
    if (debugStatus) {
      this.remember(debugStatus);
      debugStatus.classList.add('settings-menu-debug-status');
      developer.append(debugStatus);
    }

    app.append(scrim, panel, button);
    this.button = button;
    this.panel = panel;
    this.scrim = scrim;

    button.addEventListener('click', this.handleToggle);
    close.addEventListener('click', this.handleClose);
    scrim.addEventListener('click', this.handleClose);
    window.addEventListener('keydown', this.handleKeyDown);

    document.querySelector<HTMLButtonElement>('#new-game-button')
      ?.addEventListener('click', this.handleClose);
  }

  destroy(): void {
    this.button?.removeEventListener('click', this.handleToggle);
    this.scrim?.removeEventListener('click', this.handleClose);
    window.removeEventListener('keydown', this.handleKeyDown);
    document.querySelector<HTMLButtonElement>('#new-game-button')
      ?.removeEventListener('click', this.handleClose);

    for (const placement of this.placements.reverse()) {
      if (!document.documentElement.contains(placement.element)) continue;
      if (placement.nextSibling && placement.nextSibling.parentNode === placement.parent) {
        placement.parent.insertBefore(placement.element, placement.nextSibling);
      } else {
        placement.parent.appendChild(placement.element);
      }
      placement.element.classList.remove('settings-menu-debug-status');
    }
    this.placements = [];

    this.button?.remove();
    this.panel?.remove();
    this.scrim?.remove();
    this.button = undefined;
    this.panel = undefined;
    this.scrim = undefined;
    this.root = undefined;
    this.open = false;
  }

  private createSection(panel: HTMLElement, title: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'settings-menu-section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const body = document.createElement('div');
    body.className = 'settings-menu-section-body';
    section.append(heading, body);
    panel.append(section);
    return body;
  }

  private moveControl(selector: string, destination: HTMLElement, labelText: string): void {
    const control = document.querySelector<HTMLElement>(selector);
    if (!control) return;
    this.remember(control);

    const row = document.createElement('div');
    row.className = 'settings-menu-row';
    const label = document.createElement('span');
    label.className = 'settings-menu-row-label';
    label.textContent = labelText;
    row.append(label, control);
    destination.append(row);
  }

  private remember(element: HTMLElement): void {
    const parent = element.parentNode;
    if (!parent) return;
    this.placements.push({ element, parent, nextSibling: element.nextSibling });
  }

  private readonly handleToggle = (): void => {
    this.setOpen(!this.open);
  };

  private readonly handleClose = (): void => {
    this.setOpen(false);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.open) {
      event.preventDefault();
      this.setOpen(false);
    }
  };

  private setOpen(open: boolean): void {
    const panel = this.panel;
    const scrim = this.scrim;
    const button = this.button;
    if (!panel || !scrim || !button || this.open === open) return;
    this.open = open;
    panel.hidden = !open;
    scrim.hidden = !open;
    button.setAttribute('aria-expanded', `${open}`);
    button.setAttribute('aria-label', open ? 'Close settings' : 'Open settings');
    this.root?.classList.toggle('settings-menu-open', open);

    if (open) {
      panel.querySelector<HTMLButtonElement>('.settings-menu-close')?.focus({ preventScroll: true });
    } else {
      button.focus({ preventScroll: true });
    }
  }
}
