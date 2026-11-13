// Client-side world/entity state registry. Holds the latest known snapshot
// of remote players so the render layer can sync meshes to it each frame.
export class WorldState {
  constructor() {
    this.players = new Map(); // id -> { id, name, x, y, z, ry }
    this.localPlayerId = null;
  }

  applySnapshot(snapshot) {
    const seenIds = new Set();
    for (const p of snapshot.players) {
      seenIds.add(p.id);
      this.players.set(p.id, p);
    }
    for (const id of this.players.keys()) {
      if (!seenIds.has(id)) this.players.delete(id);
    }
  }

  removePlayer(id) {
    this.players.delete(id);
  }
}
