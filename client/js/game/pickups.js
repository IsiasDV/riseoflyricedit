// Gun-spawn availability for singleplayer (pure). Multiplayer is server-driven.
export class PickupState {
  constructor(count, respawnMs = 30000, now = () => Date.now()) {
    this.respawnMs = respawnMs;
    this.now = now;
    this.availableAt = new Array(count).fill(0);
  }

  reset() { this.availableAt.fill(0); }
  isAvailable(i) { return this.now() >= this.availableAt[i]; }

  take(i) {
    if (!this.isAvailable(i)) return false;
    this.availableAt[i] = this.now() + this.respawnMs;
    return true;
  }
}
