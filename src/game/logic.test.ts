import assert from 'node:assert/strict';
import test from 'node:test';
import { constrainMovement, activationStep, floorHeight, nearestTarget } from './logic.ts';
import { nearestNpc, questReadyToTurnIn, resolveQuestStatus, questProgress, levelFromExp } from './quests.ts';

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
test('NPCs are greeted only within range and by proximity', () => {
  assert.equal(nearestNpc({ x: 4.6, z: 12.5 })?.id, 'warden');
  assert.equal(nearestNpc({ x: 13.5, z: 8.5 })?.id, 'ranger');
  assert.equal(nearestNpc({ x: 0, z: 0 }), null);
});
test('quest turn-in gates depend on world facts', () => {
  assert.equal(questReadyToTurnIn('warden', { status: 'active', powered: false, echoCount: 0, ending: null }), false);
  assert.equal(questReadyToTurnIn('warden', { status: 'active', powered: true, echoCount: 0, ending: null }), true);
  assert.equal(questReadyToTurnIn('ranger', { status: 'active', powered: true, echoCount: 3, ending: null }), false);
  assert.equal(questReadyToTurnIn('ranger', { status: 'active', powered: true, echoCount: 4, ending: null }), true);
  assert.equal(questReadyToTurnIn('signal', { status: 'active', powered: true, echoCount: 6, ending: null }), false);
  assert.equal(questReadyToTurnIn('signal', { status: 'active', powered: true, echoCount: 6, ending: 'human' }), true);
});
test('resolved quest status promotes active to ready when condition met', () => {
  assert.equal(resolveQuestStatus('warden', { status: 'active', powered: true, echoCount: 0, ending: null }), 'ready');
  assert.equal(resolveQuestStatus('warden', { status: 'active', powered: false, echoCount: 0, ending: null }), 'active');
  assert.equal(resolveQuestStatus('ranger', { status: 'available', powered: false, echoCount: 0, ending: null }), 'available');
  assert.equal(resolveQuestStatus('signal', { status: 'done', powered: true, echoCount: 6, ending: 'mimic' }), 'done');
});
test('quest progress reflects real exploration steps, not just a click', () => {
  // ranger needs 4 echoes; progress must count up as you investigate
  assert.deepEqual(questProgress('ranger', { status: 'active', powered: false, echoCount: 0, ending: null }), { current: 0, goal: 4 });
  assert.deepEqual(questProgress('ranger', { status: 'active', powered: false, echoCount: 2, ending: null }), { current: 2, goal: 4 });
  assert.deepEqual(questProgress('ranger', { status: 'active', powered: false, echoCount: 9, ending: null }), { current: 4, goal: 4 });
  // signal is 4 echoes + 1 ending = 5 steps; both parts required
  assert.deepEqual(questProgress('signal', { status: 'active', powered: true, echoCount: 4, ending: null }), { current: 4, goal: 5 });
  assert.deepEqual(questProgress('signal', { status: 'active', powered: true, echoCount: 4, ending: 'human' }), { current: 5, goal: 5 });
  // warden is a single power-on step
  assert.deepEqual(questProgress('warden', { status: 'active', powered: false, echoCount: 0, ending: null }), { current: 0, goal: 1 });
  assert.deepEqual(questProgress('warden', { status: 'active', powered: true, echoCount: 0, ending: null }), { current: 1, goal: 1 });
});
test('exp accumulates into levels so rewards feel earned', () => {
  assert.equal(levelFromExp(0).level, 1);
  assert.equal(levelFromExp(299).level, 1);
  assert.equal(levelFromExp(300).level, 2);
  assert.equal(levelFromExp(660).level, 3);
  assert.ok(levelFromExp(150).ratio > 0 && levelFromExp(150).ratio < 1);
});
