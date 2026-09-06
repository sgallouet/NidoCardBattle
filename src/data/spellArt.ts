import invokeBeast from '../../assets/game/ui/spells/invoke-beast.webp?url';
import thunder from '../../assets/game/ui/spells/thunder.webp?url';
import curse from '../../assets/game/ui/spells/curse.webp?url';
import displace from '../../assets/game/ui/spells/displace.webp?url';
import rally from '../../assets/game/ui/spells/rally.webp?url';
import soulLink from '../../assets/game/ui/spells/soul-link.webp?url';

export type ActiveSpellId = 'Curse' | 'Displace' | 'Rally' | 'SoulLink' | 'Thunder';
export type SpellUiId = ActiveSpellId | 'InvokeBeast';

export interface SpellUiDefinition {
  id: SpellUiId;
  name: string;
  description: string;
  art: string;
  accent: string;
}

export const SPELL_UI: Record<SpellUiId, SpellUiDefinition> = {
  Curse: {
    id: 'Curse',
    name: 'Curse',
    description: 'Curse one enemy for 1 damage at the end of its next 3 turns. Each Necromancer can maintain only one Curse at a time.',
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
  Thunder: {
    id: 'Thunder',
    name: 'Thunder',
    description: 'Strike one enemy for 1 damage, then chain through every connected adjacent enemy for 1 damage each.',
    art: thunder,
    accent: '#79c8ff',
  },
  InvokeBeast: {
    id: 'InvokeBeast',
    name: 'Invoke Beast',
    description: 'Summon an Invoked Beast on a free adjacent hex. This Mage can have only one living Beast at a time.',
    art: invokeBeast,
    accent: '#ffd36f',
  },
};

export const isActiveSpellId = (ability: string | undefined): ability is ActiveSpellId =>
  ability === 'Curse'
  || ability === 'Displace'
  || ability === 'Rally'
  || ability === 'SoulLink'
  || ability === 'Thunder';
