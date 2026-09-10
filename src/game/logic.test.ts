import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainMovement, activationStep, floorHeight, nearestTarget } from './logic.ts';

test('long frames cannot carry the player through the pillar or outer wall', () => {
  const across = constrainMovement({ x: 0, z: 2.8 }, { x: 0, z: -4 });
  assert.ok(across.z > 1.9);
  const outside = constrainMovement({ x: 0, z: 20 }, { x: 0, z: 32 });
  assert.ok(Math.hypot(outside.x, outside.z) <= 20.66);
});
test('platform requires stairs, and stairs smoothly change eye height', () => {
  const blocked = constrainMovement({ x: 12.7, z: 12.7 }, { x: 14, z: 14 });
  assert.ok(Math.hypot(blocked.x, blocked.z) < 18.4);
  const stairs = constrainMovement({ x: 0, z: 17 }, { x: 0, z: 19 });
  assert.ok(stairs.z > 18.5);
  assert.equal(floorHeight(0, 17.5), .325);
  assert.equal(floorHeight(0, 20), .65);
});
test('activation needs power, proximity and continuous hold, and release drains partial charge', () => {
  assert.equal(activationStep(0, .1, true, false, true), 0);
  assert.equal(activationStep(0, .1, true, true, false), 0);
  assert.ok(activationStep(.4, .1, false, true, true) < .4);
  let charge = 0;
  for (let i = 0; i < 27; i++) charge = activationStep(charge, .1, true, true, true);
  assert.equal(charge, 1);
  assert.equal(activationStep(1, .1, false, true, false), 1);
});
test('investigation is proximity gated and picks the nearest terminal', () => {
  assert.equal(nearestTarget({ x: -8, z: 12 })?.id, 'power');
  assert.equal(nearestTarget({ x: 0, z: 5 })?.id, 'core');
  assert.equal(nearestTarget({ x: 15, z: 10 }), null);
});
