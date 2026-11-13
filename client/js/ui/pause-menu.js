// In-match pause overlay: blurred game behind a high-contrast top-left menu
// (RESUME GAME / OPTIONS / EXIT GAME). The match keeps running underneath.
import { settings, SETTING_DEFS } from '../state/settings.js';

export class PauseMenu {
  constructor({ onResume, onExit, canPause }) {
    this.canPause = canPause;
    this._openedAt = 0;
    this.onResume = onResume;
    this.onExit = onExit;
    this.root = document.getElementById('pause-root');
    this.list = document.getElementById('pause-list');
    this.mode = 'main'; // main | options
    this.index = 0;
    this.isOpen = false;
    window.addEventListener('keydown', (e) => this._onKey(e));
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._openedAt = performance.now();
    this.mode = 'main';
    this.index = 0;
    this.root.classList.remove('ui-hidden');
    this._render();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('ui-hidden');
  }

  _items() {
    if (this.mode === 'options') {
      return [
        ...Object.keys(SETTING_DEFS).map((key) => ({
          id: key, label: SETTING_DEFS[key].label, value: settings.get(key), setting: true
        })),
        { id: 'back', label: 'BACK' }
      ];
    }
    return [
      { id: 'resume', label: 'RESUME GAME' },
      { id: 'options', label: 'OPTIONS' },
      { id: 'exit', label: 'EXIT GAME' }
    ];
  }

  _render() {
    const items = this._items();
    this.index = Math.min(this.index, items.length - 1);
    this.list.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = i === this.index ? 'active' : '';
      const label = document.createElement('span');
      label.textContent = item.label;
      li.appendChild(label);
      if (item.setting) {
        const v = document.createElement('span');
        v.className = 'menu-value';
        v.textContent = `< ${item.value} >`;
        li.appendChild(v);
      }
      li.addEventListener('mouseenter', () => {
        this.index = i;
        [...this.list.children].forEach((el, j) => el.classList.toggle('active', j === i));
      });
      li.addEventListener('click', () => { this.index = i; this._activate(1); });
      this.list.appendChild(li);
    });
  }

  _activate(dir) {
    const item = this._items()[this.index];
    if (!item) return;
    if (item.setting) { settings.cycle(item.id, dir); this._render(); return; }
    if (item.id === 'resume') this.onResume();
    else if (item.id === 'options') { this.mode = 'options'; this.index = 0; this._render(); }
    else if (item.id === 'back') { this.mode = 'main'; this.index = 1; this._render(); }
    else if (item.id === 'exit') this.onExit();
  }

  // Controller: D-pad navigates/adjusts, A activates, B backs out, Start resumes.
  // `edge` maps button index -> pressed since last poll.
  handlePad(edge) {
    if (!this.isOpen || performance.now() - this._openedAt < 200) return;
    const n = this._items().length;
    if (edge[12] || edge[13]) {
      this.index = (this.index + (edge[13] ? 1 : -1) + n) % n;
      this._render();
    } else if (edge[14] || edge[15]) {
      if (this._items()[this.index]?.setting) this._activate(edge[15] ? 1 : -1);
    } else if (edge[0]) {
      this._activate(1);
    } else if (edge[1]) {
      if (this.mode === 'options') { this.mode = 'main'; this.index = 1; this._render(); }
      else this.onResume();
    } else if (edge[9]) {
      this.onResume();
    }
  }

  _onKey(e) {
    const k = e.key;
    if (!this.isOpen) {
      if (k === 'Escape' && !e.repeat && this.canPause()) { this.open(); e.preventDefault(); }
      return;
    }
    // Some browsers fire keydown for the same Esc that released pointer lock.
    if (k === 'Escape' && performance.now() - this._openedAt < 200) return;
    const n = this._items().length;
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      this.index = (this.index + (k === 'ArrowDown' ? 1 : -1) + n) % n;
      this._render();
    } else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      if (this._items()[this.index]?.setting) this._activate(k === 'ArrowRight' ? 1 : -1);
    } else if (k === 'Enter' || k === ' ') {
      if (e.repeat) return;
      this._activate(1);
    } else if (k === 'Escape') {
      if (this.mode === 'options') { this.mode = 'main'; this.index = 1; this._render(); }
      else this.onResume();
    } else return;
    e.preventDefault();
  }
}
