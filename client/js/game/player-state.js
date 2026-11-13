// Local player's gameplay state (health, weapon, ammo, round). Pure logic so it
// can be unit-tested; emits 'player:state' snapshots on every change.
import { events } from '../core/events.js';
import { CHARACTERS } from './characters.js';
import { WEAPONS, STARTING_WEAPON } from './weapons.js';

export class PlayerState {
  constructor(bus = events) {
    this.bus = bus;
    this.clear();
  }

  clear() {
    this.charId = null;
    this.charName = '';
    this.maxHealth = 0;
    this.health = 0;
    this.weaponId = STARTING_WEAPON;
    this.ammo = {};
    this.round = 1;
  }

  reset(charId) {
    const ch = CHARACTERS[charId];
    this.charId = charId;
    this.charName = ch?.name ?? '';
    this.maxHealth = ch?.health ?? 100;
    this.health = this.maxHealth;
    this.weaponId = STARTING_WEAPON;
    this.ammo = Object.fromEntries(Object.values(WEAPONS).map((w) => [w.id, w.ammo]));
    this.round = 1;
    this._emit();
  }

  damage(n) { this.health = Math.max(0, this.health - n); this._emit(); }
  heal(n) { this.health = Math.min(this.maxHealth, this.health + n); this._emit(); }
  // Equip a weapon with its default ammo (pickup).
  giveWeapon(id) {
    if (!WEAPONS[id]) return;
    this.weaponId = id;
    this.ammo[id] = WEAPONS[id].ammo;
    this._emit();
  }

  // Spend one round of the current weapon; false if empty.
  useAmmo() {
    const a = this.ammo[this.weaponId];
    if (!(a > 0)) return false;
    if (a !== Infinity) { this.ammo[this.weaponId] = a - 1; this._emit(); }
    return true;
  }

  addAmmo(n) {
    const a = this.ammo[this.weaponId];
    if (a === undefined || a === Infinity) return;
    this.ammo[this.weaponId] = a + n;
    this._emit();
  }

  // Ammo powerup: top the gun back up to a full magazine.
  refillGun() {
    if (this.ammo.gun === undefined || this.ammo.gun === Infinity) return;
    this.ammo.gun = Math.max(this.ammo.gun, WEAPONS.gun.ammo);
    this._emit();
  }

  get hasGun() { return this.weaponId === 'gun'; }

  setWeapon(id) { if (WEAPONS[id]) { this.weaponId = id; this._emit(); } }
  setRound(n) { this.round = n; this._emit(); }

  snapshot() {
    return {
      charId: this.charId, charName: this.charName,
      health: this.health, maxHealth: this.maxHealth,
      weaponId: this.weaponId, weaponName: WEAPONS[this.weaponId]?.name ?? '',
      fire: !!WEAPONS[this.weaponId]?.fire,
      ammo: this.ammo[this.weaponId] ?? 0, round: this.round
    };
  }

  _emit() { this.bus.emit('player:state', this.snapshot()); }
}
