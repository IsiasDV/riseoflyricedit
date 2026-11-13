// Perma-perks: one selectable permanent perk per player (pure; shared by client and server).
export const PERKS = {
  speed:   { id: 'speed',   name: 'The Speed',        color: 0xffd23a, desc: 'Your movement speed is 25% faster across walking and running.' },
  medic:   { id: 'medic',   name: 'The Medic',        color: 0x3a8cff, desc: 'Revive downed players in 2 seconds. Multiplayer only.', multiOnly: true },
  vulture: { id: 'vulture', name: 'The Vulture',      color: 0xff8a2a, desc: 'See enemy outlines through walls and geometry.' },
  oneman:  { id: 'oneman',  name: 'The One Man Show', color: 0xff4a3a, desc: 'Revive yourself once per round (press F / X while downed).' },
  classic: { id: 'classic', name: 'The Classic',      color: 0x4cff7a, desc: 'No perma-perk. Just you and the Hand.' }
};
export const PERK_IDS = Object.keys(PERKS);
export const DEFAULT_PERK = 'classic';
export const SPEED_PERK_MULT = 1.25;
export const MEDIC_REVIVE_MS = 2000;
export const SELF_REVIVE_PROTECT_S = 2.5;

export const isPerk = (id) => typeof id === 'string' && Object.hasOwn(PERKS, id);
export const perkOf = (id) => PERKS[isPerk(id) ? id : DEFAULT_PERK];
// Medic does nothing without teammates, so singleplayer falls back to the Classic.
export const effectivePerk = (id, mode) => (!isPerk(id) || (mode !== 'multi' && PERKS[id].multiOnly) ? DEFAULT_PERK : id);
export const perkHex = (id) => `#${perkOf(id).color.toString(16).padStart(6, '0')}`;
