// In-match HUD: health bar (bottom-left), ammo + weapon (bottom-right), round (top-right).
// DOM is only touched when player state changes; CSS does the animation (class re-triggers).
import { events } from '../core/events.js';
import { ammoLabel } from '../game/weapons.js';
import { perkOf, perkHex } from '../game/perks.js';

// Restart a CSS animation class on an element.
function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the animation restarts
  el.classList.add(cls);
}

export class Hud {
  constructor() {
    const el = (id) => document.getElementById(id);
    this.root = el('game-hud');
    this.bar = el('hud-health-bar');
    this.fill = el('hud-health-fill');
    this.trail = el('hud-health-trail');
    this.charName = el('hud-char');
    this.perk = el('hud-perk');
    this.ammo = el('hud-ammo-num');
    this.weapon = el('hud-weapon');
    this.round = el('hud-round-num');
    this.crosshair = el('crosshair');
    this._pct = 1;
    this._round = null;
    this._ammoText = null;
    this._ammoNum = null;
    events.on('player:state', (s) => this.render(s));
  }

  render(s) {
    const pct = s.maxHealth ? Math.max(0, Math.min(1, s.health / s.maxHealth)) : 0;
    const level = pct > 0.5 ? 'ok' : pct > 0.25 ? 'warn' : 'low';
    this.fill.style.width = `${pct * 100}%`;
    this.trail.style.width = `${pct * 100}%`;
    this.fill.dataset.level = level;
    this.bar.dataset.level = level;
    this.root.classList.toggle('low-health', level === 'low' && pct > 0);
    if (pct < this._pct - 0.001) retrigger(this.bar, 'hit');
    this._pct = pct;

    this.charName.textContent = s.charName;

    const ammoText = ammoLabel(s.ammo);
    if (ammoText !== this._ammoText) {
      this.ammo.textContent = ammoText;
      if (this._ammoText !== null) retrigger(this.ammo, 'pop');
      if (this._ammoNum !== null && s.ammo < this._ammoNum) retrigger(this.crosshair, 'fire');
      this._ammoText = ammoText;
    }
    this._ammoNum = s.ammo;
    this.ammo.dataset.low = s.fire && Number.isFinite(s.ammo) && s.ammo <= 2 ? '1' : '';
    this.weapon.textContent = s.weaponName;

    if (s.round !== this._round) {
      this.round.textContent = s.round;
      if (this._round !== null) retrigger(this.round, 'pop');
      this._round = s.round;
    }
    this.crosshair.classList.toggle('ui-hidden', !s.fire);
  }

  setPerk(id) {
    this.perk.textContent = perkOf(id).name;
    this.perk.style.setProperty('--c', perkHex(id));
  }

  show() { this.root.classList.remove('ui-hidden'); }
  hide() { this.root.classList.add('ui-hidden'); }
}
