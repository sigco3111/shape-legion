// Commander skills (data + per-battle state; no DOM). Effects live in sim.js (castRally / castVolley / castCharge), constants in units.js (SK).
// Unlocks come from the Command tech branch (upgrades.js CMD_SKILLS): Rally free, Volley after Command node 1, Charge after node 2.
export const SKILLS = [
  { id: 'rally', key: 1, cd: 12, uses: 3, aim: true },
  { id: 'volley', key: 2, cd: 20, uses: 2, aim: false },
  { id: 'charge', key: 3, cd: 25, uses: 2, aim: false },
];
export function newSkillState(unlocked) {
  return { unlocked: SKILLS.map((_, i) => !!unlocked[i]), uses: SKILLS.map((s) => s.uses), next: SKILLS.map(() => 0), aim: -1 };
}
// Remaining cooldown in seconds (0 = ready); `time` is sim time so pausing pauses cooldowns.
export const cooldownLeft = (st, i, time) => Math.max(0, st.next[i] - time);
export const canUse = (st, i, time) => st.unlocked[i] && st.uses[i] > 0 && cooldownLeft(st, i, time) <= 0;
