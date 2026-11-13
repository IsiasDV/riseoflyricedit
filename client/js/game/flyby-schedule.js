// Menu fly-through timing (pure): cycles maps, preloads the next at 20 s, switches at 30 s once it is ready.
export const FLYBY_MS = 30000;
export const PRELOAD_MS = 20000;

export class FlybySchedule {
  constructor(count, start = 0) { this.count = count; this.index = start % Math.max(1, count); this.t = 0; }
  get next() { return (this.index + 1) % this.count; }
  tick(dt) { this.t += dt * 1000; }
  get shouldPreload() { return this.count > 1 && this.t >= PRELOAD_MS; }
  canSwitch(nextReady) { return this.count > 1 && this.t >= FLYBY_MS && nextReady; }
  advance() { this.index = this.next; this.t = 0; }
}
