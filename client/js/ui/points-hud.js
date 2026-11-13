// Right-edge points list: one number per player (sorted highest first), colored by perma-perk;
// the local player's number is larger. DOM is only rebuilt when the data changes.
import { perkHex } from '../game/perks.js';

export class PointsHud {
  constructor() { this.el = document.getElementById('points-hud'); this.sig = ''; this.mine = 0; }

  // entries: [{ id, points, perk, me }]
  render(entries) {
    const list = [...entries].sort((a, b) => b.points - a.points);
    const sig = list.map((e) => `${e.id}:${e.points}:${e.perk}:${e.me ? 1 : 0}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    this.el.replaceChildren(...list.map((e) => {
      const d = document.createElement('div');
      d.className = e.me ? 'pt me' : 'pt';
      d.style.setProperty('--c', perkHex(e.perk));
      d.textContent = String(e.points);
      if (e.me) {
        if (e.points > this.mine) d.classList.add('pop');
        this.mine = e.points;
      }
      return d;
    }));
  }

  clear() { this.sig = ''; this.mine = 0; this.el.replaceChildren(); }
}
