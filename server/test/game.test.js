import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyGameResult, deriveAlignment, rankCast, resolveCombat, setFeeling, shiftBond, startingStats } from '../src/game.js';

let nextId = 0;
const person = (name, power, extra = {}) => ({
  _id: `id${(nextId += 1)}`,
  name,
  power,
  reputation: 0,
  alignment: 'unknown',
  status: 'active',
  kills: 0,
  villainsSlain: 0,
  relationships: [],
  history: [],
  ...extra,
});

test('alignment follows reputation', () => {
  assert.equal(deriveAlignment(40), 'hero');
  assert.equal(deriveAlignment(-40), 'villain');
  assert.equal(deriveAlignment(15), 'grey');
  assert.equal(deriveAlignment(3), 'unknown');
});

test('ranks skip the dead and the concealed', () => {
  const a = person('A', 50);
  const b = person('B', 90, { concealed: true });
  const c = person('C', 95, { status: 'dead' });
  assert.deepEqual(rankCast([a, b, c]), [a]);
});

test('one weak fighter cannot beat the apex', () => {
  const apex = person('Apex', 90);
  const second = person('Second', 70);
  const weak = person('Weak', 30);
  const effects = resolveCombat({ winners: [weak], loser: apex, killed: true }, [apex, second, weak], 'a fight starts', 1);
  assert.equal(apex.status, 'active');
  assert.equal(weak.kills, 0);
  assert.match(effects[0].text, /withstood/);
});

test('two fighters can beat the apex', () => {
  const apex = person('Apex', 90);
  const a = person('A', 50);
  const b = person('B', 40);
  resolveCombat({ winners: [a, b], loser: apex, killed: false }, [apex, a, b], 'they attack', 1);
  assert.equal(apex.status, 'injured');
  assert.ok(apex.power < 90);
});

test('the next rank alone can beat the apex', () => {
  const apex = person('Apex', 90);
  const second = person('Second', 75);
  resolveCombat({ winners: [second], loser: apex, killed: false }, [apex, second], 'duel', 1);
  assert.equal(apex.status, 'injured');
});

test('the user can always bring the apex down by naming them', () => {
  const apex = person('Apex', 90);
  const second = person('Second', 70);
  const weak = person('Weak', 30);
  resolveCombat({ winners: [weak], loser: apex, killed: true }, [apex, second, weak], 'Weak kills Apex', 1);
  assert.equal(apex.status, 'dead');
});

test('killing a villain builds reputation, killing a hero destroys it', () => {
  const slayer = person('Slayer', 50);
  const villain = person('Villain', 60, { alignment: 'villain', reputation: -50 });
  resolveCombat({ winners: [slayer], loser: villain, killed: true }, [villain, slayer], 'x', 1);
  assert.equal(slayer.villainsSlain, 1);
  assert.equal(slayer.reputation, 20);

  const killer = person('Killer', 50);
  const hero = person('Hero', 45, { alignment: 'hero', reputation: 50 });
  resolveCombat({ winners: [killer], loser: hero, killed: true }, [killer, hero], 'x', 1);
  assert.equal(killer.reputation, -30);
  assert.equal(killer.alignment, 'villain');
});

test('high bond becomes Trusted and low bond becomes Nemesis, on both sides', () => {
  const a = person('A', 50);
  const b = person('B', 50);
  shiftBond(a, b, 40);
  assert.equal(shiftBond(a, b, 40), 'A and B are now Trusted');
  assert.equal(a.relationships[0].type, 'trusted');
  assert.equal(b.relationships[0].type, 'trusted');
  shiftBond(a, b, -40);
  shiftBond(a, b, -40);
  shiftBond(a, b, -40);
  assert.equal(shiftBond(a, b, -40), 'A and B are now Nemesis');
});

test('family stays family when the bond turns bad', () => {
  const a = person('A', 50, { relationships: [{ target: 'x', type: 'family', score: 0 }] });
  const b = person('B', 50, { _id: 'x', relationships: [{ target: a._id, type: 'family', score: 0 }] });
  shiftBond(a, b, -40);
  shiftBond(a, b, -40);
  assert.equal(a.relationships[0].type, 'family');
  assert.equal(a.relationships[0].score, -80);
});

test('scene results update stats, reveal secrets and hide concealed power', () => {
  const hidden = person('Hidden', 88, { concealed: true, secret: 'He is the prince', secretRevealed: false });
  const a = person('A', 50);
  const base = { characters: [hidden, a], inScene: () => true, touch: () => {}, input: '', chapter: 1 };

  const quiet = applyGameResult({ ...base, result: { characterChanges: [{ name: 'Hidden', powerChange: 5 }] } });
  assert.equal(quiet.length, 0);

  const big = applyGameResult({ ...base, result: { characterChanges: [{ name: 'Hidden', secretRevealed: true, event: 'Showed his face' }] } });
  assert.equal(hidden.concealed, false);
  assert.equal(hidden.secretRevealed, true);
  assert.ok(big.some((e) => e.kind === 'secret' && e.text.includes('prince')));
  assert.ok(big.some((e) => e.kind === 'rank'));
});

test('characters outside the scene are left alone', () => {
  const a = person('A', 50);
  const b = person('B', 50);
  applyGameResult({
    characters: [a, b],
    inScene: (name) => name === 'A',
    touch: () => {},
    input: '',
    chapter: 1,
    result: { characterChanges: [{ name: 'B', status: 'dead' }], combat: [{ winners: ['A'], loser: 'B', killed: true }] },
  });
  assert.equal(b.status, 'active');
});

test('a fight does not count power twice', () => {
  const a = person('A', 50);
  const b = person('B', 50);
  applyGameResult({
    characters: [a, b],
    inScene: () => true,
    touch: () => {},
    input: '',
    chapter: 1,
    result: {
      combat: [{ winners: ['A'], loser: 'B', killed: false }],
      characterChanges: [{ name: 'A', powerChange: 20 }, { name: 'B', powerChange: -20 }],
    },
  });
  assert.equal(a.power, 55);
  assert.equal(b.power, 42);
});

test('prompt words never become titles', () => {
  assert.equal(startingStats({ title: 'APEX' }).title, '');
  assert.equal(startingStats({ title: 'The Ghost of Ichra' }).title, 'The Ghost of Ichra');
});

test('a strong protector keeps a loved one alive against weaker attackers', () => {
  const loved = person('Loved', 30);
  const guard = person('Guard', 85, { relationships: [{ target: loved._id, type: 'love', score: 80 }] });
  const attacker = person('Attacker', 50);
  const effects = resolveCombat({ winners: [attacker], loser: loved, killed: true }, [guard, attacker, loved], 'they fight', 1);
  assert.equal(loved.status, 'injured');
  assert.equal(attacker.kills, 0);
  assert.ok(effects.some((e) => e.kind === 'shield'));
});

test('the user can still kill a protected character by naming them', () => {
  const loved = person('Loved', 30);
  const guard = person('Guard', 85, { relationships: [{ target: loved._id, type: 'love', score: 80 }] });
  const attacker = person('Attacker', 50);
  resolveCombat({ winners: [attacker], loser: loved, killed: true }, [guard, attacker, loved], 'Attacker kills Loved', 1);
  assert.equal(loved.status, 'dead');
});

test('a much stronger winner hits harder', () => {
  const big = person('Big', 90);
  const small = person('Small', 30);
  resolveCombat({ winners: [big], loser: small, killed: false }, [big, small], 'x', 1);
  assert.equal(small.power, 7);
});

test('a one-way feeling stays one-way', () => {
  const a = person('A', 50);
  const b = person('B', 50);
  setFeeling(a, b, 'crush', 'secretly adores', 5);
  assert.equal(a.relationships[0].type, 'crush');
  assert.equal(b.relationships.length, 0);
});

test('love, levels and fear show up in scene results', () => {
  const a = person('A', 68, { reputation: -55 });
  const b = person('B', 50);
  const effects = applyGameResult({
    characters: [a, b],
    inScene: () => true,
    touch: () => {},
    input: '',
    chapter: 1,
    result: {
      relationshipChanges: [{ from: 'B', to: 'A', type: 'crush', oneWay: true, scoreChange: 10 }],
      characterChanges: [{ name: 'A', powerChange: 5, reputationChange: -10 }],
    },
  });
  const kinds = effects.map((e) => e.kind);
  assert.ok(kinds.includes('love'));
  assert.ok(kinds.includes('level'));
  assert.ok(kinds.includes('danger'));
  assert.equal(effects.find((e) => e.kind === 'level').who, 'A');
});

test('starting stats are kept within limits', () => {
  const stats = startingStats({ power: 500, alignment: 'villain' });
  assert.equal(stats.power, 95);
  assert.equal(stats.alignment, 'villain');
  assert.equal(startingStats({}).alignment, 'unknown');
});
