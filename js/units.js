// Unit definitions and balance tables. Everything tunable lives here.
export const VER = '2026111101';
export const TICK_HZ = 30;
export const DT = 1 / TICK_HZ;
export const ARENA = { w: 1600, h: 900 };
export const NT = 5;
export const T = { CIRCLE: 0, SQUARE: 1, ARCHER: 2, RIDER: 3, SIEGE: 4 };
export const ATK = { MELEE: 0, ARROW: 1, BOULDER: 2 };
export const HP_SCALE = 2.2; // global battle-length knob (scales every unit's HP)

// shape = type. Speeds in world units / second, ranges in world units.
export const UNITS = [
  { id: 'circle',   shape: 'circle',   cost: 1, hp: 32,  dmg: 5,  cd: 0.85, range: 0,   minRange: 0,  speed: 62,  r: 4.5, armor: 0,    pierce: 0, atk: ATK.MELEE,   splash: 0 },
  { id: 'square',   shape: 'square',   cost: 3, hp: 150, dmg: 8,  cd: 1.0,  range: 0,   minRange: 0,  speed: 38,  r: 6.5, armor: 0.4,  pierce: 0, atk: ATK.MELEE,   splash: 0 },
  { id: 'archer',   shape: 'triangle', cost: 3, hp: 30,  dmg: 15, cd: 1.0,  range: 160, minRange: 0,  speed: 48,  r: 5,   armor: 0,    pierce: 1, atk: ATK.ARROW,   splash: 0 },
  { id: 'rider',    shape: 'diamond',  cost: 4, hp: 90,  dmg: 10, cd: 0.7,  range: 0,   minRange: 0,  speed: 110, r: 5.5, armor: 0,    pierce: 0, atk: ATK.MELEE,   splash: 0 },
  { id: 'siege',    shape: 'pentagon', cost: 8, hp: 110, dmg: 51, cd: 3.0,  range: 340, minRange: 70, speed: 26,  r: 8,   armor: 0,    pierce: 0, atk: ATK.BOULDER, splash: 42 },
];
export const SIEGE_MELEE_DMG = 2; // siege is helpless when enemies are inside minRange

// MULT[attacker][defender]: damage multiplier (counter table).
//            Circle Square Archer Rider Siege
export const MULT = [
  /* Circle */ [1.0, 0.9, 1.2, 1.0, 1.3],
  /* Square */ [1.0, 1.0, 1.2, 1.0, 1.3],
  /* Archer */ [1.0, 1.7, 1.0, 0.7, 1.1],
  /* Rider  */ [1.0, 0.6, 1.8, 1.0, 1.3],
  /* Siege  */ [1.5, 1.0, 1.0, 0.9, 1.0],
];
// Target preference: score = dist^2 * PREF[attacker][defender] (lower = more wanted).
export const PREF = [
  [1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1],
  [1, 0.8, 1, 0.8, 1],
  [1, 1.2, 0.5, 1, 0.5],
  [0.8, 1, 1, 1, 1],
];
// Rider first-hit charge: bonus multiplier, rearm time (s), per-defender resistance to the bonus.
export const CHARGE = { mul: 2.4, rearm: 4, resist: [0, 0.75, 0, 0, 0] };

export const TEAMS = [
  { id: 'blue', base: '#3da5ff', light: '#c4e6ff', dark: '#1456c8', glow: '#4aa8ff', rgb: [74, 168, 255] },
  { id: 'red',  base: '#ff4d5e', light: '#ffc6cc', dark: '#a8122a', glow: '#ff5a6a', rgb: [255, 90, 106] },
];

export function unitValue(t) { return UNITS[t].cost; }
