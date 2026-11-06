import { createAvatar } from '@dicebear/core';
import { lorelei } from '@dicebear/collection';

const variants = (...numbers) => numbers.map((n) => `variant${String(n).padStart(2, '0')}`);
const numbered = (name, ...numbers) => numbers.map((n) => `${name}${String(n).padStart(2, '0')}`);

const HAIR = {
  male: variants(2, 3, 4, 6, 7, 8, 9, 20, 22, 27, 39, 44),
  female: variants(10, 13, 14, 15, 16, 17, 18, 19, 21, 23, 24, 26, 29, 30, 31, 33, 35, 36, 37, 38, 40, 41, 42, 43, 45, 46, 48),
};

// A face changes with who the character becomes.
const MOUTHS = {
  hero: numbered('happy', 1, 2, 3, 4, 5, 6, 7, 8),
  villain: numbered('sad', 1, 2, 3, 4, 5, 6, 7, 8, 9),
};

const cache = new Map();

/** A stable illustrated face for a character, drawn in the browser. */
export function portrait(character) {
  const { gender = 'other', alignment } = character;
  const key = `${character._id}:${gender}:${alignment}`;
  if (!cache.has(key)) {
    const options = {
      seed: character._id,
      skinColor: ['f2d3b1', 'e6b98f', 'd9a177', 'c68642', '9c6b3f'],
      hairColor: ['1c1410', '2e1d14', '4a2c1a', '6b3f22'],
      frecklesProbability: 8,
      glassesProbability: 6,
      earringsProbability: gender === 'female' ? 40 : 0,
      beardProbability: gender === 'male' ? 45 : 0,
      hairAccessoriesProbability: 0,
    };
    if (HAIR[gender]) options.hair = HAIR[gender];
    if (MOUTHS[alignment]) options.mouth = MOUTHS[alignment];
    cache.set(key, createAvatar(lorelei, options).toDataUri());
  }
  return cache.get(key);
}
