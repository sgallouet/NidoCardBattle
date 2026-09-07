import type { Faction } from '../data/types';
import humanArmy from '../../assets/game/ui/new-battle/human-army.webp?url';
import undeadArmy from '../../assets/game/ui/new-battle/undead-army.webp?url';

const ART = { human: humanArmy, undead: undeadArmy };
const COPY = { human: 'Stand together. Strike as one.', undead: 'The fallen rise. The living fall.' };

export const openBattleSetup = (): Promise<{ faction: Faction; aiFaction: Faction } | null> => new Promise((resolve) => {
  const previousFocus = document.activeElement as HTMLElement | null;
  const selection: Record<'player' | 'ai', Faction> = { player: 'human', ai: 'undead' };
  const overlay = document.createElement('div');
  overlay.className = 'new-game-setup-overlay';
  overlay.innerHTML = `
    <div class="new-game-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="new-game-title">
      <header class="new-game-heading"><span>NIDO CARD BATTLE</span><h2 id="new-game-title">New Battle</h2><p>Choose your armies. Write their fate.</p></header>
      <div class="new-game-armies">
        ${(['player', 'ai'] as const).map((side) => `
          <section class="new-game-army" data-side="${side}" data-selected="${selection[side]}" aria-label="${side === 'player' ? 'Player' : 'AI'} army">
            <div class="new-game-role">${side === 'player' ? 'PLAYER' : 'AI'}<span>${side === 'player' ? 'YOUR ARMY' : 'OPPONENT'}</span></div>
            <div class="new-game-art"><img src="${ART[selection[side]]}" alt="" draggable="false"></div>
            <div class="new-game-army-info"><h3>${selection[side] === 'human' ? 'Human' : 'Undead'}</h3><p>${COPY[selection[side]]}</p>
              <div class="new-game-factions" role="group" aria-label="${side === 'player' ? 'Player' : 'AI'} faction">
                ${(['human', 'undead'] as const).map((faction) => `<button type="button" data-faction="${faction}" aria-pressed="${selection[side] === faction}">${faction === 'human' ? 'Human' : 'Undead'}</button>`).join('')}
              </div>
            </div>
          </section>`).join('')}
        <div class="new-game-versus" aria-hidden="true">VS</div>
      </div>
      <footer class="new-game-setup-actions"><button class="new-game-start" type="button">START BATTLE <span aria-hidden="true">&rarr;</span></button><p>Starting positions are randomized</p><button class="new-game-setup-cancel" type="button">Back</button></footer>
    </div>`;
  const finish = (start: boolean): void => {
    window.removeEventListener('keydown', handleKeyDown);
    overlay.remove();
    previousFocus?.focus();
    resolve(start ? { faction: selection.player, aiFaction: selection.ai } : null);
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button')];
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  overlay.querySelectorAll<HTMLElement>('[data-side]').forEach((panel) => {
    const side = panel.dataset.side as 'player' | 'ai';
    panel.querySelectorAll<HTMLButtonElement>('[data-faction]').forEach((button) => {
      button.addEventListener('click', () => {
        const faction = button.dataset.faction as Faction;
        if (selection[side] === faction) return;
        selection[side] = faction;
        panel.dataset.selected = faction;
        const oldImage = panel.querySelector('img')!;
        const image = oldImage.cloneNode() as HTMLImageElement;
        image.src = ART[faction];
        oldImage.replaceWith(image);
        panel.querySelector('h3')!.textContent = faction === 'human' ? 'Human' : 'Undead';
        panel.querySelector('.new-game-army-info p')!.textContent = COPY[faction];
        panel.querySelectorAll<HTMLButtonElement>('[data-faction]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice.dataset.faction === faction)));
      });
    });
  });
  overlay.querySelector('.new-game-start')!.addEventListener('click', () => finish(true));
  overlay.querySelector('.new-game-setup-cancel')!.addEventListener('click', () => finish(false));
  window.addEventListener('keydown', handleKeyDown);
  document.body.append(overlay);
  overlay.querySelector<HTMLButtonElement>('[data-faction]')!.focus();
});
