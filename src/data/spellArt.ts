import curse from '../../assets/game/ui/spells/curse.svg?url';
import displace from '../../assets/game/ui/spells/displace.svg?url';
import rally from '../../assets/game/ui/spells/rally.svg?url';
import soulLink from '../../assets/game/ui/spells/soul-link.svg?url';

export type ActiveSpellId = 'Curse' | 'Displace' | 'Rally' | 'SoulLink';

export interface SpellUiDefinition {
  id: ActiveSpellId;
  name: string;
  description: string;
  art: string;
  accent: string;
}

export const SPELL_UI: Record<ActiveSpellId, SpellUiDefinition> = {
  Curse: {
    id: 'Curse',
    name: 'Curse',
    description: '1 damage at end of turn for 3 turns.',
    art: curse,
    accent: '#b76cff',
  },
  Displace: {
    id: 'Displace',
    name: 'Displace',
    description: 'Move an adjacent unit to another nearby hex.',
    art: displace,
    accent: '#61dfff',
  },
  Rally: {
    id: 'Rally',
    name: 'Rally',
    description: 'Adjacent allies gain +1 Move this turn.',
    art: rally,
    accent: '#f0c866',
  },
  SoulLink: {
    id: 'SoulLink',
    name: 'Soul Link',
    description: 'Redirect Commander damage to an adjacent Undead ally.',
    art: soulLink,
    accent: '#c16cff',
  },
};

export const isActiveSpellId = (ability: string | undefined): ability is ActiveSpellId =>
  ability === 'Curse' || ability === 'Displace' || ability === 'Rally' || ability === 'SoulLink';
