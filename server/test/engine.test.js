import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.MONGODB_URI ||= 'mongodb://localhost/test';
process.env.JWT_SECRET ||= 'test-secret';

const { findCharacter, sceneFilter, setRelationship } = await import('../src/engine.js');

test('sceneFilter allows everyone when nobody is chosen', () => {
  assert.equal(sceneFilter([], 'anything')('Ali'), true);
});

test('sceneFilter keeps only the chosen cast', () => {
  const inScene = sceneFilter([{ name: 'Zara Khan' }, { name: 'Ali' }], 'They argue about the money.');
  assert.equal(inScene('Zara'), true);
  assert.equal(inScene('Ali'), true);
  assert.equal(inScene('Bilal'), false);
  assert.equal(inScene('Thug'), false);
});

test('sceneFilter lets in someone the user names', () => {
  const inScene = sceneFilter([{ name: 'Zara' }], 'Suddenly Tariq walks in.');
  assert.equal(inScene('Tariq'), true);
  assert.equal(inScene('Uncle Tariq'), true);
  assert.equal(inScene('Bilal'), false);
});

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
  assert.deepEqual(a.relationships, [{ target: 'b', type: 'family', label: 'brother', score: 50 }]);
  assert.deepEqual(b.relationships, [{ target: 'a', type: 'family', label: 'sister', score: 50 }]);

  setRelationship(a, b, 'enemy');
  assert.equal(a.relationships.length, 1);
  assert.equal(a.relationships[0].type, 'enemy');
  assert.equal(a.relationships[0].label, 'brother');
});
