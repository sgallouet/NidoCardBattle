import './BetaWelcome.css';

const BETA_WELCOME_STORAGE_KEY = 'nidocardbattle.betaWelcomeAcknowledged';

export const isBetaWelcomeAcknowledged = (storage: Pick<Storage, 'getItem'>): boolean =>
  storage.getItem(BETA_WELCOME_STORAGE_KEY) === 'true';

export const acknowledgeBetaWelcome = (storage: Pick<Storage, 'setItem'>): void => {
  storage.setItem(BETA_WELCOME_STORAGE_KEY, 'true');
};

export const showBetaWelcomeOnce = (): Promise<void> => {
  if (isBetaWelcomeAcknowledged(window.localStorage)) return Promise.resolve();

  acknowledgeBetaWelcome(window.localStorage);
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) return Promise.resolve();

  const notice = document.createElement('aside');
  notice.className = 'beta-welcome-notice';
  notice.setAttribute('role', 'status');
  notice.innerHTML = `
    <span class="beta-welcome-badge">Early Beta</span>
    <div class="beta-welcome-copy">
      <strong>Welcome, Commander</strong>
      <span>Best on PC for now. Rough edge or good idea? Feedback is very welcome.</span>
    </div>
    <button type="button" aria-label="Dismiss beta notice">×</button>`;

  const dismiss = (): void => {
    if (!notice.isConnected || notice.classList.contains('is-leaving')) return;
    notice.classList.add('is-leaving');
    window.setTimeout(() => notice.remove(), 220);
  };
  notice.querySelector<HTMLButtonElement>('button')?.addEventListener('click', dismiss, { once: true });
  app.append(notice);
  requestAnimationFrame(() => notice.classList.add('is-visible'));
  window.setTimeout(dismiss, 7200);

  // This is deliberately non-blocking: the battlefield intro may start immediately.
  return Promise.resolve();
};
