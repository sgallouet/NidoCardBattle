import type { GameState } from '../data/types';
import { attackUnit, findUnit } from './engine';

export interface AssistPresentation {
  unitId: string;
  damage: number;
}

const cloneState = (state: GameState): GameState => structuredClone(state);

const defenderDamage = (state: GameState, defenderId: string, hpBefore: number): number =>
  Math.max(0, hpBefore - (findUnit(state, defenderId)?.hp ?? 0));

export const previewPrimaryTargetDamage = (
  state: GameState,
  attackerId: string,
  defenderId: string,
): number => {
  const attacker = findUnit(state, attackerId);
  const defender = findUnit(state, defenderId);
  if (!attacker || !defender) return 0;

  const preview = cloneState(state);
  for (const ally of preview.units) {
    if (ally.owner === attacker.owner && ally.id !== attackerId) ally.exhausted = true;
  }
  const result = attackUnit(preview, attackerId, defenderId);
  return result.ok ? defenderDamage(preview, defenderId, defender.hp) : 0;
};

export const previewAssistPresentations = (
  state: GameState,
  attackerId: string,
  defenderId: string,
): AssistPresentation[] => {
  const attacker = findUnit(state, attackerId);
  const defender = findUnit(state, defenderId);
  if (!attacker || !defender) return [];

  const direct = cloneState(state);
  for (const ally of direct.units) {
    if (ally.owner === attacker.owner && ally.id !== attackerId) ally.exhausted = true;
  }
  const directResult = attackUnit(direct, attackerId, defenderId);
  if (!directResult.ok || !findUnit(direct, defenderId)) return [];
  const directDamage = defenderDamage(direct, defenderId, defender.hp);

  const candidates = state.units.filter((unit) => unit.owner === attacker.owner && unit.id !== attackerId);
  const assists: AssistPresentation[] = [];
  for (const candidate of candidates) {
    const preview = cloneState(state);
    for (const ally of preview.units) {
      if (ally.owner === attacker.owner && ally.id !== attackerId && ally.id !== candidate.id) ally.exhausted = true;
    }
    const result = attackUnit(preview, attackerId, defenderId);
    if (!result.ok) continue;
    const totalDamage = defenderDamage(preview, defenderId, defender.hp);
    const contribution = totalDamage - directDamage;
    if (contribution > 0) assists.push({ unitId: candidate.id, damage: contribution });
  }
  return assists;
};
