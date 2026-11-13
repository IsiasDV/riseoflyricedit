// Powerup HUD: active buff chips with draining bars (top right), and a center announcement banner.
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

export class PowerupHud {
  constructor() {
    this.root = document.getElementById('powerup-hud');
    this.buffEl = document.getElementById('pu-buff');
    this.lyricEl = document.getElementById('pu-lyric');
    this.banner = document.getElementById('powerup-banner');
    this.buffs = new Map(); // kind -> { label, color, left, total, el }
    this.lyric = null;
    this.bannerLeft = 0;
  }

  setBuff(kind, label, color, seconds) {
    this.clearBuff(kind);
    if (seconds > 0) this.buffs.set(kind, { label, color, left: seconds, total: seconds, el: this.buffEl.appendChild(document.createElement('div')) });
    this._render();
  }

  clearBuff(kind) { this.buffs.get(kind)?.el.remove(); this.buffs.delete(kind); this._render(); }
  setLyric(label, color, seconds) { this.lyric = seconds > 0 ? { label, color, left: seconds, total: seconds } : null; this._render(); }

  announce(text, color) {
    this.banner.textContent = text;
    this.banner.style.setProperty('--c', hex(color));
    this.banner.classList.remove('ui-hidden', 'fade', 'show');
    void this.banner.offsetWidth; // restart the slide-in animation
    this.banner.classList.add('show');
    this.bannerLeft = 3;
  }

  update(dt) {
    for (const [k, b] of this.buffs) if ((b.left -= dt) <= 0) this.clearBuff(k);
    if (this.lyric && (this.lyric.left -= dt) <= 0) this.lyric = null;
    this._render();
    if (this.bannerLeft > 0) {
      this.bannerLeft -= dt;
      if (this.bannerLeft < 0.6) this.banner.classList.add('fade');
      if (this.bannerLeft <= 0) this.banner.classList.add('ui-hidden');
    }
  }

  _line(el, b) {
    el.classList.toggle('ui-hidden', !b);
    if (!b) { el.textContent = ''; return; }
    const text = `${b.label} ${Math.ceil(b.left)}s`;
    if (el.textContent !== text) el.textContent = text;
    el.style.setProperty('--c', hex(b.color));
    el.style.setProperty('--p', String(Math.max(0, b.left / b.total)));
    el.classList.toggle('ending', b.left < 5);
  }

  _render() {
    for (const b of this.buffs.values()) this._line(b.el, b);
    this._line(this.lyricEl, this.lyric);
    this.root.classList.toggle('ui-hidden', !this.buffs.size && !this.lyric);
  }

  clear() {
    for (const k of [...this.buffs.keys()]) this.clearBuff(k);
    this.lyric = null;
    this.bannerLeft = 0;
    this.banner.classList.add('ui-hidden');
    this._render();
  }
}
