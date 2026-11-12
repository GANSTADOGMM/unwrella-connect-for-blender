import test from 'node:test';
import assert from 'node:assert/strict';
import { countUVIslands } from '../public/uv-islands.js';

test('counts connected faces and separates overlapping UVs on disconnected geometry', () => {
  const obj = `o first
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 3 0 0
v 4 0 0
v 4 1 0
vt 0 0
vt 1 0
vt 1 1
vt 0 1
f 1/1 2/2 3/3
f 1/1 3/3 4/4
f 5/1 6/2 7/3
`;
  assert.equal(countUVIslands(obj), 2);
  assert.equal(countUVIslands(obj + 'o second\nf -7/-4 -6/-3 -5/-2\n'), 3);
});
