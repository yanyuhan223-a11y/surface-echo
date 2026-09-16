/**
 * 地表遭遇战 · combat rules for the surface zone.
 *
 * Kept free of three.js so it can be unit-tested: the world layer only mirrors these
 * numbers onto meshes. Beasts hunt by proximity, the railgun is hit-scan with a firing
 * cone, and armour soaks damage before health does.
 */

export interface Beast {
  id: number;
  x: number; z: number;
  hp: number; maxHp: number;
  /** radians, where the beast is looking */
  facing: number;
  state: 'idle' | 'chase' | 'attack' | 'dead';
  /** seconds until it can strike again */
  cooldown: number;
  /** >0 while the hit flash is showing */
  flash: number;
  /** brief stagger after being hit */
  stagger: number;
}

export interface Weapon {
  mag: number;
  magSize: number;
  reserve: number;
  /** seconds until the next shot is allowed */
  fireCd: number;
  /** seconds remaining of a reload, 0 when not reloading */
  reloading: number;
}

export interface Vitals {
  hp: number; maxHp: number;
  armor: number; maxArmor: number;
}

export const BEAST_MAX_HP = 100;
export const BEAST_SPEED = 3.05;
export const BEAST_AGGRO = 20;
export const BEAST_REACH = 2.5;
export const BEAST_DAMAGE = 16;
export const BEAST_SWING_CD = 1.35;

export const WEAPON_DAMAGE = 34;
export const WEAPON_RANGE = 42;
/** half-angle (radians) of the hit-scan cone — generous so touch aiming stays fair */
export const WEAPON_CONE = 0.20;
export const FIRE_CD = 0.42;
export const RELOAD_TIME = 1.6;
export const MAG_SIZE = 30;
export const START_RESERVE = 120;

export const EXTRACT_RADIUS = 3.1;

/**
 * The single definition of "forward" for a given yaw. Both the third-person camera
 * and the railgun derive their direction from this, which is what keeps the
 * crosshair honest — a shot always travels where the lens is pointing.
 */
export function aimVector(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

export function createWeapon(): Weapon {
  return { mag: MAG_SIZE, magSize: MAG_SIZE, reserve: START_RESERVE, fireCd: 0, reloading: 0 };
}

export function createVitals(): Vitals {
  return { hp: 100, maxHp: 100, armor: 120, maxArmor: 120 };
}

export function createBeasts(spawns: { x: number; z: number }[]): Beast[] {
  return spawns.map((s, i) => ({
    id: i, x: s.x, z: s.z, hp: BEAST_MAX_HP, maxHp: BEAST_MAX_HP,
    facing: Math.PI, state: 'idle', cooldown: 0, flash: 0, stagger: 0,
  }));
}

export function beastsAlive(beasts: Beast[]): number {
  return beasts.filter(b => b.state !== 'dead').length;
}

/** Advance one beast. Returns the damage it lands on the player this frame (0 if none). */
export function stepBeast(beast: Beast, player: { x: number; z: number }, dt: number): number {
  if (beast.state === 'dead') return 0;
  beast.flash = Math.max(0, beast.flash - dt);
  beast.cooldown = Math.max(0, beast.cooldown - dt);
  beast.stagger = Math.max(0, beast.stagger - dt);

  const dx = player.x - beast.x, dz = player.z - beast.z;
  const dist = Math.hypot(dx, dz) || 1e-6;
  beast.facing = Math.atan2(dx, dz);

  if (dist > BEAST_AGGRO) { beast.state = 'idle'; return 0; }

  if (dist <= BEAST_REACH) {
    beast.state = 'attack';
    if (beast.cooldown <= 0) { beast.cooldown = BEAST_SWING_CD; return BEAST_DAMAGE; }
    return 0;
  }

  beast.state = 'chase';
  if (beast.stagger <= 0) {
    // Stop just short of the player so it does not stand inside them.
    const step = Math.min(BEAST_SPEED * dt, Math.max(0, dist - BEAST_REACH * .82));
    beast.x += dx / dist * step;
    beast.z += dz / dist * step;
  }
  return 0;
}

/** Armour absorbs first, then health. */
export function applyDamage(v: Vitals, amount: number): Vitals {
  const toArmor = Math.min(v.armor, amount);
  const rest = amount - toArmor;
  return { ...v, armor: Math.round(v.armor - toArmor), hp: Math.max(0, Math.round(v.hp - rest)) };
}

export function tickWeapon(w: Weapon, dt: number): Weapon {
  const next: Weapon = { ...w, fireCd: Math.max(0, w.fireCd - dt) };
  if (next.reloading > 0) {
    next.reloading = Math.max(0, next.reloading - dt);
    if (next.reloading === 0) {
      const need = next.magSize - next.mag;
      const take = Math.min(need, next.reserve);
      next.mag += take; next.reserve -= take;
    }
  }
  return next;
}

export function canFire(w: Weapon): boolean {
  return w.mag > 0 && w.fireCd <= 0 && w.reloading === 0;
}

export function startReload(w: Weapon): Weapon {
  if (w.reloading > 0 || w.reserve <= 0 || w.mag >= w.magSize) return w;
  return { ...w, reloading: RELOAD_TIME };
}

/**
 * Hit-scan along the aim direction. Returns the nearest living beast inside the cone,
 * or null. `dirX/dirZ` must be a unit vector on the XZ plane.
 */
export function hitscan(
  origin: { x: number; z: number },
  dirX: number, dirZ: number,
  beasts: Beast[],
): Beast | null {
  let best: Beast | null = null, bestDist = Infinity;
  for (const b of beasts) {
    if (b.state === 'dead') continue;
    const dx = b.x - origin.x, dz = b.z - origin.z;
    const dist = Math.hypot(dx, dz);
    if (dist > WEAPON_RANGE || dist < 1e-4) continue;
    const dot = (dx / dist) * dirX + (dz / dist) * dirZ;
    if (dot <= 0) continue;
    // widen the cone slightly with distance so far targets stay hittable
    const tolerance = WEAPON_CONE + Math.min(.12, dist * .004);
    if (Math.acos(Math.min(1, dot)) > tolerance) continue;
    if (dist < bestDist) { best = b; bestDist = dist; }
  }
  return best;
}

/** Apply weapon damage to a beast. Returns true when this shot killed it. */
export function damageBeast(beast: Beast, amount = WEAPON_DAMAGE): boolean {
  if (beast.state === 'dead') return false;
  beast.hp = Math.max(0, beast.hp - amount);
  beast.flash = .16;
  beast.stagger = .18;
  if (beast.hp === 0) { beast.state = 'dead'; return true; }
  return false;
}

export function atExtraction(player: { x: number; z: number }, beacon: { x: number; z: number }): boolean {
  return Math.hypot(player.x - beacon.x, player.z - beacon.z) <= EXTRACT_RADIUS;
}

/** Surface walkable box — the authored ash field plus its deck approach. */
export function constrainSurface(desired: { x: number; z: number }): { x: number; z: number } {
  return {
    x: Math.max(-26.5, Math.min(30.5, desired.x)),
    z: Math.max(-18.5, Math.min(18.5, desired.z)),
  };
}
