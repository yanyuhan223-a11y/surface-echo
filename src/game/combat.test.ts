import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BEAST_DAMAGE, BEAST_MAX_HP, MAG_SIZE, RELOAD_TIME, WEAPON_DAMAGE,
  aimVector, applyDamage, atExtraction, beastsAlive, canFire, constrainSurface, createBeasts,
  createVitals, createWeapon, damageBeast, hitscan, startReload, stepBeast, tickWeapon,
} from './combat.ts';

test('a beast idles out of aggro range, closes in, then swings on cooldown', () => {
  const [far] = createBeasts([{ x: 0, z: 40 }]);
  assert.equal(stepBeast(far, { x: 0, z: 0 }, 1 / 60), 0);
  assert.equal(far.state, 'idle');
  assert.equal(far.z, 40, 'a beast that has not noticed you should not creep closer');

  const [hunter] = createBeasts([{ x: 0, z: 12 }]);
  for (let i = 0; i < 60 * 6; i += 1) stepBeast(hunter, { x: 0, z: 0 }, 1 / 60);
  assert.equal(hunter.state, 'attack');
  assert.ok(hunter.z > 1.5 && hunter.z < 2.6, `expected melee range, got ${hunter.z}`);

  // it just swung, so the follow-up has to wait out the cooldown
  hunter.cooldown = 0;
  assert.equal(stepBeast(hunter, { x: 0, z: 0 }, 1 / 60), BEAST_DAMAGE);
  assert.equal(stepBeast(hunter, { x: 0, z: 0 }, 1 / 60), 0);
});

test('armour soaks damage before health, and health floors at zero', () => {
  const fresh = createVitals();
  const grazed = applyDamage(fresh, 40);
  assert.equal(grazed.hp, fresh.hp, 'armour should absorb the whole hit');
  assert.equal(grazed.armor, fresh.armor - 40);

  const stripped = applyDamage({ ...fresh, armor: 10 }, 30);
  assert.equal(stripped.armor, 0);
  assert.equal(stripped.hp, fresh.hp - 20, 'overflow spills into health');

  const downed = applyDamage({ ...fresh, armor: 0, hp: 12 }, 90);
  assert.equal(downed.hp, 0);
});

test('the railgun picks the nearest target inside the aim cone and ignores the dead', () => {
  const beasts = createBeasts([
    { x: 0, z: 10 },   // straight ahead, far
    { x: 0, z: 4 },    // straight ahead, near
    { x: 0, z: -6 },   // behind
    { x: 30, z: 2 },   // far off to the right
  ]);
  const ahead = hitscan({ x: 0, z: 0 }, 0, 1, beasts);
  assert.equal(ahead?.z, 4, 'nearest in-cone beast wins');

  assert.equal(hitscan({ x: 0, z: 0 }, 1, 0, beasts)?.x, 30, 'aiming right finds the flanker');
  assert.equal(hitscan({ x: 0, z: 0 }, -1, 0, beasts), null, 'nothing stands to the left');

  beasts[1].state = 'dead';
  assert.equal(hitscan({ x: 0, z: 0 }, 0, 1, beasts)?.z, 10, 'corpses are skipped');
});

test('three shots put a hunter down and the clear count follows', () => {
  const beasts = createBeasts([{ x: 0, z: 6 }, { x: 4, z: 6 }, { x: -4, z: 6 }]);
  assert.equal(beastsAlive(beasts), 3);
  const target = beasts[0];
  const shots = Math.ceil(BEAST_MAX_HP / WEAPON_DAMAGE);
  for (let i = 1; i < shots; i += 1) assert.equal(damageBeast(target), false);
  assert.equal(damageBeast(target), true, 'the last shot kills');
  assert.equal(damageBeast(target), false, 'you cannot kill it twice');
  assert.equal(beastsAlive(beasts), 2);
});

test('firing respects the cooldown, and a reload refills from the reserve', () => {
  let w = createWeapon();
  assert.ok(canFire(w));

  w = { ...w, fireCd: .42, mag: w.mag - 1 };
  assert.equal(canFire(w), false, 'cannot fire mid-cooldown');
  w = tickWeapon(w, .5);
  assert.ok(canFire(w));

  const empty = { ...w, mag: 0 };
  assert.equal(canFire(empty), false);
  let reloading = startReload(empty);
  assert.equal(reloading.reloading, RELOAD_TIME);
  assert.equal(canFire(reloading), false, 'no shots while swapping mags');
  reloading = tickWeapon(reloading, RELOAD_TIME + .01);
  assert.equal(reloading.mag, MAG_SIZE);
  assert.equal(reloading.reserve, empty.reserve - MAG_SIZE);
  assert.ok(canFire(reloading));

  const full = createWeapon();
  assert.equal(startReload(full).reloading, 0, 'a full mag does not reload');
  assert.equal(startReload({ ...full, mag: 0, reserve: 0 }).reloading, 0, 'nothing left to load');
});

test('extraction needs you on the pad, and the surface walls hold', () => {
  const beacon = { x: 24, z: 6 };
  assert.equal(atExtraction({ x: 24, z: 8 }, beacon), true);
  assert.equal(atExtraction({ x: 24, z: 12 }, beacon), false);

  const clamped = constrainSurface({ x: 900, z: -900 });
  assert.ok(clamped.x <= 30.5 && clamped.z >= -18.5);
  const inside = constrainSurface({ x: 4, z: -3 });
  assert.deepEqual(inside, { x: 4, z: -3 }, 'open ground is untouched');
});

test('forward is defined once, so the crosshair and the railgun cannot disagree', () => {
  // yaw 0 looks down -Z, which is the convention the third-person camera uses
  const north = aimVector(0);
  assert.ok(Math.abs(north.x) < 1e-9);
  assert.ok(Math.abs(north.z + 1) < 1e-9);

  // a quarter turn puts you on +X
  const east = aimVector(-Math.PI / 2);
  assert.ok(Math.abs(east.x - 1) < 1e-9);
  assert.ok(Math.abs(east.z) < 1e-9);

  // and shots land on whatever the lens is pointing at, not behind the player
  const beasts = createBeasts([{ x: 0, z: -8 }, { x: 0, z: 8 }]);
  const ahead = aimVector(0);
  assert.equal(hitscan({ x: 0, z: 0 }, ahead.x, ahead.z, beasts)?.z, -8);
});
