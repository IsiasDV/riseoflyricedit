// Round progression (pure). Round N spawns playerCount x N enemies, one every
// spawnGapMs; when all are spawned and defeated there is a transition, then N+1.
// update() returns events: { event: 'roundStart', round, total } | { event: 'spawn' }
// | { event: 'roundEnd', round, nextMs }.
export class RoundSystem {
  constructor({ introMs = 5000, transitionMs = 10000, spawnGapMs = 1000 } = {}) {
    this.cfg = { introMs, transitionMs, spawnGapMs };
    this.round = 0;
    this.phase = 'idle'; // idle | wait | active | cleared
    this.timer = 0;
    this.total = 0;
    this.spawned = 0;
    this.gap = 0;
  }

  start(playerCount) {
    this.round = 1;
    this.phase = 'wait';
    this.timer = this.cfg.introMs / 1000;
    this.total = Math.max(1, playerCount) * 1;
    this.spawned = 0;
  }

  update(dt, { playerCount, liveEnemies }) {
    const ev = [];
    if (this.phase === 'wait' || this.phase === 'cleared') {
      this.timer -= dt;
      if (this.timer > 0) return ev;
      if (this.phase === 'cleared') this.round++;
      this.total = Math.max(1, playerCount) * this.round;
      this.spawned = 0;
      this.gap = 0;
      this.phase = 'active';
      ev.push({ event: 'roundStart', round: this.round, total: this.total });
    }
    if (this.phase === 'active') {
      this.gap -= dt;
      while (this.spawned < this.total && this.gap <= 0) {
        this.spawned++;
        this.gap += this.cfg.spawnGapMs / 1000;
        ev.push({ event: 'spawn' });
      }
      if (this.spawned >= this.total && liveEnemies === 0 && !ev.some((e) => e.event === 'spawn')) {
        this.phase = 'cleared';
        this.timer = this.cfg.transitionMs / 1000;
        ev.push({ event: 'roundEnd', round: this.round, nextMs: this.cfg.transitionMs });
      }
    }
    return ev;
  }

  // Nuke: end the active round right now; the next round starts after a short beat.
  skip(nextMs = 3000) {
    if (this.phase !== 'active') return [];
    this.spawned = this.total;
    this.phase = 'cleared';
    this.timer = nextMs / 1000;
    return [{ event: 'roundEnd', round: this.round, nextMs }];
  }

  // For HUD / broadcast. left = enemies not yet spawned + still alive.
  state(liveEnemies = 0) {
    return { round: this.round, phase: this.phase, left: Math.max(0, this.total - this.spawned) + liveEnemies };
  }
}
