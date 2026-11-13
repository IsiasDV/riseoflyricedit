// Hold-TAB player list shown at the top of the screen during a match,
// with each player's live match stats (kills / downs / revives).
export class Scoreboard {
  constructor() {
    this.root = document.getElementById('scoreboard');
    this.title = document.getElementById('scoreboard-title');
    this.list = document.getElementById('scoreboard-list');
    this.visible = false;
  }

  // `rows` (optional): live MatchStats rows keyed by player id.
  show(players, localId, mapName, rows = []) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    this.title.textContent = `${mapName} - ${players.length} player${players.length === 1 ? '' : 's'}`;
    this.list.replaceChildren(...players.map((p) => {
      const li = document.createElement('li');
      const r = byId.get(p.id);
      const name = p.id === localId ? `${p.name} (You)` : p.name;
      li.textContent = r ? `${name}  K ${r.kills}  D ${r.downs}  R ${r.revives}` : name;
      if (p.id === localId) li.className = 'me';
      return li;
    }));
    this.root.classList.remove('ui-hidden');
    this.visible = true;
  }

  hide() {
    if (!this.visible) return;
    this.root.classList.add('ui-hidden');
    this.visible = false;
  }
}
