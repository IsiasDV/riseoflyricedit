// Per-lobby spawn-point state (pure; the lobby manager owns timers and messaging).
export class SpawnPoints {
  constructor(spawns, { radius, respawnMs }, now = () => Date.now()) {
    this.spawns = spawns;           // [{x, y, z}]
    this.radius = radius;
    this.respawnMs = respawnMs;
    this.now = now;
    this.availableAt = spawns.map(() => 0);
  }

  reset() { this.availableAt.fill(0); }

  // pos: { x, y, z }. Marks the spawn taken and returns true if allowed.
  tryTake(index, pos) {
    const s = this.spawns[index];
    if (!s || !pos) return false;
    if (this.now() < this.availableAt[index]) return false;
    if (Math.hypot(pos.x - s.x, pos.z - s.z) > this.radius || Math.abs(pos.y - s.y) > 3) return false;
    this.availableAt[index] = this.now() + this.respawnMs;
    return true;
  }
}

// Gun spawns also track who already holds the gun (one gun per player).
export class GunSpawnState extends SpawnPoints {
  constructor(spawns, opts, now) {
    super(spawns, opts, now);
    this.holders = new Set();
  }

  reset() { super.reset(); this.holders.clear(); }

  tryTake(playerId, index, pos) {
    if (this.holders.has(playerId)) return false;
    if (!super.tryTake(index, pos)) return false;
    this.holders.add(playerId);
    return true;
  }

  hasGun(playerId) { return this.holders.has(playerId); }
  release(playerId) { this.holders.delete(playerId); }
}
