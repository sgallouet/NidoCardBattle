import './BetaWelcome.css';

const BETA_WELCOME_STORAGE_KEY = 'nidocardbattle.betaWelcomeAcknowledged';

let activeWelcome: Promise<void> | null = null;

export const isBetaWelcomeAcknowledged = (storage: Pick<Storage, 'getItem'>): boolean =>
  storage.getItem(BETA_WELCOME_STORAGE_KEY) === 'true';

export const acknowledgeBetaWelcome = (storage: Pick<Storage, 'setItem'>): void => {
  storage.setItem(BETA_WELCOME_STORAGE_KEY, 'true');
};

export const showBetaWelcomeOnce = (): Promise<void> => {
  if (isBetaWelcomeAcknowledged(window.localStorage)) return Promise.resolve();
  if (activeWelcome) return activeWelcome;

  activeWelcome = new Promise((resolve) => {
    const app = document.querySelector<HTMLElement>('#app');
    const overlay = document.createElement('div');
    overlay.className = 'beta-welcome-overlay';
    overlay.innerHTML = `
      <section class="beta-welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="beta-welcome-title" aria-describedby="beta-welcome-description">
        <div class="beta-welcome-glow" aria-hidden="true"></div>
        <img class="beta-welcome-commander beta-welcome-commander-human" src="./assets/game/units/human/human-commander.webp" alt="" />
        <img class="beta-welcome-commander beta-welcome-commander-undead" src="./assets/game/units/undead/undead-commander.webp" alt="" />
        <div class="beta-welcome-content">
          <span class="beta-welcome-badge">Early Beta</span>
          <h1 id="beta-welcome-title">Welcome, Commander</h1>
          <p id="beta-welcome-description" class="beta-welcome-lead">
            Thanks for joining us while NidoCardBattle is still taking shape.
          </p>
          <div class="beta-welcome-note">
            <span class="beta-welcome-monitor" aria-hidden="true">
              <svg viewBox="0 0 32 32"><rect x="4" y="5" width="24" height="17" rx="2"/><path d="M11 27h10M16 22v5"/></svg>
            </span>
            <div>
              <strong>Best played on PC</strong>
              <span>This beta is designed for a desktop screen with a mouse and keyboard.</span>
            </div>
          </div>
          <p class="beta-welcome-feedback">
            You may find a few rough edges. If something doesn’t work—or you have an idea that would make the battle better—please let us know. Every note helps.
          </p>
          <button class="beta-welcome-start" type="button">
            <span>Start Playing</span>
            <span aria-hidden="true">→</span>
          </button>
          <small>Thank you for helping us build a better game.</small>
        </div>
      </section>`;

    const button = overlay.querySelector<HTMLButtonElement>('.beta-welcome-start');
    if (!button) throw new Error('Beta welcome action is missing.');

    const finish = (): void => {
      acknowledgeBetaWelcome(window.localStorage);
      overlay.classList.add('is-leaving');
      app?.removeAttribute('inert');
      window.setTimeout(() => {
        overlay.remove();
        activeWelcome = null;
        resolve();
      }, 260);
    };

    button.addEventListener('click', finish, { once: true });
    app?.setAttribute('inert', '');
    document.body.append(overlay);
    button.focus();
  });

  return activeWelcome;
};
