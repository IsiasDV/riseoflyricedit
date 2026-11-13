// Main menu + lobby background music. Loops until stop() (match loading / in-game).
// Browsers block autoplay before a user gesture, so a blocked play() is retried
// on the first key / pointer / gamepad input.
const URL = 'assets/menu_bgm/lyric.opus';

class Bgm {
  constructor() {
    this.audio = new Audio(URL);
    this.audio.loop = true;
    this.audio.preload = 'auto';
    this.wanted = false;
    const retry = () => { if (this.wanted && this.audio.paused) this._try(); };
    for (const ev of ['keydown', 'pointerdown', 'gamepadconnected']) window.addEventListener(ev, retry);
  }

  _try() {
    this.audio.play().catch(() => { /* blocked until a gesture; retry handler will fire */ });
  }

  play() {
    this.wanted = true;
    if (this.audio.paused) this._try();
  }

  stop() {
    this.wanted = false;
    this.audio.pause();
    this.audio.currentTime = 0;
  }
}

export const bgm = new Bgm();
