// Centered round announcements: "ROUND N" on start, "ROUND CLEARED / next round in n" on end.
export class RoundBanner {
  constructor() {
    this.root = document.getElementById('round-banner');
    this.title = document.getElementById('rb-title');
    this.sub = document.getElementById('rb-sub');
    this.mode = null;   // 'start' | 'end' | null
    this.left = 0;      // seconds (end: countdown, start: show time)
  }

  _show(title, sub) {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.root.classList.remove('ui-hidden', 'fade');
  }

  showStart(round) {
    this.mode = 'start';
    this.left = 3;
    this._show(`ROUND ${round}`, '');
  }

  showEnd(nextMs) {
    this.mode = 'end';
    this.left = nextMs / 1000;
    this._show('ROUND CLEARED', `NEXT ROUND IN ${Math.ceil(this.left)}`);
  }

  update(dt) {
    if (!this.mode) return;
    this.left -= dt;
    if (this.mode === 'end') {
      this.sub.textContent = `NEXT ROUND IN ${Math.max(1, Math.ceil(this.left))}`;
    } else if (this.left < 0.6) {
      this.root.classList.add('fade');
    }
    if (this.left <= 0 && this.mode === 'start') this.hide();
  }

  hide() {
    this.mode = null;
    this.root.classList.add('ui-hidden');
  }
}
