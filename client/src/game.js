export const ALIGNMENTS = { hero: 'Hero', villain: 'Villain', grey: 'Grey', unknown: 'Undecided' };

const BONDS = {
  trusted: 'Trusted',
  nemesis: 'Nemesis',
  ally: 'Ally',
  enemy: 'Enemy',
  friend: 'Friend',
  family: 'Family',
  love: 'Love',
  rival: 'Rival',
  neutral: 'Neutral',
  crush: 'Crush',
  jealous: 'Jealous',
};
export const bondName = (type) => BONDS[type] ?? 'Neutral';

/** The server leaves out power while a character hides their strength. */
export function tierOf(character) {
  const { power } = character ?? {};
  if (power === undefined) return { key: 'hidden', label: 'Hidden' };
  if (power >= 85) return { key: 'legend', label: 'Legend' };
  if (power >= 70) return { key: 'elite', label: 'Elite' };
  if (power >= 45) return { key: 'fighter', label: 'Fighter' };
  return { key: 'rookie', label: 'Rookie' };
}

export function rankCast(characters) {
  return characters
    .filter((c) => c.status !== 'dead' && c.power !== undefined)
    .sort((a, b) => b.power - a.power);
}

export const rankOf = (characters, character) => rankCast(characters).findIndex((c) => c._id === character._id) + 1;

/** How the world sees someone: fear for the dangerous, respect for the honoured. */
export function standing(character) {
  if (character.power === undefined) return '';
  if (character.power >= 70 && character.reputation < 0) return 'Feared';
  if (character.reputation >= 60) return 'Respected';
  return '';
}
