import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.MONGODB_URI ||= 'mongodb://localhost/test';
process.env.JWT_SECRET ||= 'test-secret';

const { findCharacter, setRelationship } = await import('../src/engine.js');

test('findCharacter matches full and unique partial names', () => {
  const cast = [{ name: 'Zara Khan' }, { name: 'Ali' }];
  assert.equal(findCharacter(cast, 'zara khan'), cast[0]);
  assert.equal(findCharacter(cast, 'Zara'), cast[0]);
  assert.equal(findCharacter(cast, 'Ali Khan'), cast[1]);
  assert.equal(findCharacter(cast, 'Bilal'), null);
});

test('findCharacter refuses an ambiguous first name', () => {
  const cast = [{ name: 'Ali Khan' }, { name: 'Ali Raza' }];
  assert.equal(findCharacter(cast, 'Ali'), null);
});

test('setRelationship links both characters and keeps labels', () => {
  const a = { _id: 'a', relationships: [] };
  const b = { _id: 'b', relationships: [] };
  setRelationship(a, b, 'family', 'brother', 'sister');
  assert.deepEqual(a.relationships, [{ target: 'b', type: 'family', label: 'brother' }]);
  assert.deepEqual(b.relationships, [{ target: 'a', type: 'family', label: 'sister' }]);

  setRelationship(a, b, 'enemy');
  assert.equal(a.relationships.length, 1);
  assert.equal(a.relationships[0].type, 'enemy');
  assert.equal(a.relationships[0].label, 'brother');
});
