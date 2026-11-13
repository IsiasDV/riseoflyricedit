// Game-over leaderboard overlay (shown over the cinematic camera).
import { CHARACTERS } from '../game/characters.js';

const STATUS = { alive: 'ALIVE', down: 'DOWNED', dead: 'DEAD', left: 'LEFT' };

export class GameOverScreen {
  constructor() {
    this.root = document.getElementById('game-over');
    this.round = document.getElementById('go-round');
    this.body = document.getElementById('go-body');
  }

  show(rows, round, localId) {
    this.round.textContent = `Reached round ${round}`;
    this.body.replaceChildren(...rows.map((r) => {
      const tr = document.createElement('tr');
      if (r.id === localId) tr.className = 'me';
      const cells = [r.id === localId ? `${r.name} (You)` : r.name, CHARACTERS[r.char]?.name ?? '-', r.kills, r.downs, r.revives];
      for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.appendChild(td); }
      const st = document.createElement('td');
      st.textContent = STATUS[r.status] ?? r.status;
      st.className = `st-${r.status === 'left' ? 'dead' : r.status}`;
      tr.appendChild(st);
      return tr;
    }));
    this.root.classList.remove('ui-hidden');
  }

  hide() { this.root.classList.add('ui-hidden'); }
}
