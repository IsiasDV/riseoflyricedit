// Weapon definitions. Add a weapon = add an entry (model, viewmodel tuning, anims).
// ammo: Infinity for unlimited; a number is the starting/magazine ammo.
//   melee: swing weapon (Hand). fire: projectile weapon (Gun).
export const WEAPONS = {
  hand: {
    id: 'hand',
    name: 'Hand',
    ammo: Infinity,
    model: 'assets/general/PlayerHand.glb',
    melee: { cooldown: 0.5, hitDelay: 0.18, range: 2.2, arcDeg: 70, knockback: 13, hop: 1.5 },
    viewmodel: {
      length: 0.55,              // long-axis size in view space (metres at the 0.6 m hold distance)
      offset: [0, 0, 0],         // extra x, y, z nudge after auto-fit
      anims: { idle: 'Idle', attack: 'Slapping', grab: 'Grabbing', hold: 'Holding', die: 'Dying' }
    }
  },
  gun: {
    id: 'gun',
    name: 'Gun',
    ammo: 8,
    model: 'assets/general/Gun.glb',
    fire: { cooldown: 0.2, speed: 70, range: 150, projectile: 'assets/general/Bullet.glb' },
    viewmodel: {
      kind: 'static',            // no skeleton: orient by `forward` (model-space barrel axis)
      forward: [0, 0, 1],
      length: 0.45,
      offset: [0, 0, 0],
      anims: {}
    }
  }
};

export const STARTING_WEAPON = 'hand';

// Every weapon model + projectile model, so pickups never load mid-match.
export function weaponManifest() {
  const models = new Set();
  for (const w of Object.values(WEAPONS)) {
    models.add(w.model);
    if (w.fire?.projectile) models.add(w.fire.projectile);
  }
  return { models: [...models] };
}

export function ammoLabel(ammo) {
  return ammo === Infinity ? '∞' : String(ammo);
}
