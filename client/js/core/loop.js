// requestAnimationFrame-driven game loop with delta time and FPS tracking.
export class GameLoop {
  constructor({ update, render }) {
    this._update = update;
    this._render = render;
    this._lastTime = 0;
    this._running = false;
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTimer = 0;
  }

  start() {
    this._running = true;
    this._lastTime = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() {
    this._running = false;
  }

  get fps() {
    return this._fps;
  }

  _tick = (now) => {
    if (!this._running) return;

    const deltaMs = now - this._lastTime;
    this._lastTime = now;
    const deltaSeconds = Math.min(deltaMs / 1000, 0.25); // clamp to avoid spiral of death

    this._frameCount++;
    this._fpsTimer += deltaMs;
    if (this._fpsTimer >= 500) {
      this._fps = Math.round((this._frameCount * 1000) / this._fpsTimer);
      this._frameCount = 0;
      this._fpsTimer = 0;
    }

    this._update(deltaSeconds);
    this._render(deltaSeconds);

    requestAnimationFrame(this._tick);
  };
}
