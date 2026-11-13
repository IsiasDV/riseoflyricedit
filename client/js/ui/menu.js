// Boot intro, title screen and settings menu. Supports mouse hover/click,
// keyboard arrows/Enter/Escape and gamepad d-pad/A/B.
import { settings, SETTING_DEFS } from '../state/settings.js';
import { events } from '../core/events.js';
import { profile } from '../state/profile.js';
import { AbstractBackground } from './background.js';
import { showPrompt, showPromptError } from './prompt.js';

const MAIN_ITEMS = [
  { id: 'singleplayer', label: 'SINGLEPLAYER' },
  { id: 'multiplayer', label: 'MULTIPLAYER' },
  { id: 'settings', label: 'SETTINGS' }
];

const ICONS = {
  trophy: '<svg viewBox="0 0 24 24"><path d="M7 3h10v2h3v3c0 2.2-1.8 4-4 4h-.3A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1A5 5 0 0 1 8.3 12H8C5.8 12 4 10.2 4 8V5h3V3zm0 4H6v1c0 1.1.9 2 2 2V7zm10 0v3c1.1 0 2-.9 2-2V7h-2z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.7L5.8 21l1.6-7L2 9.2l7.1-.6L12 2z"/></svg>'
};
const MAIN_SMALL = [
  { id: 'achievements', label: 'ACHIEVEMENTS', icon: 'trophy', small: true },
  { id: 'collectibles', label: 'COLLECTIBLES', icon: 'star', small: true }
];

const MULTI_ITEMS = [
  { id: 'createLobby', label: 'CREATE LOBBY' },
  { id: 'joinLobby', label: 'JOIN LOBBY' },
  { id: 'backMulti', label: 'BACK TO MAIN MENU' }
];

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class MenuSystem {
  constructor(network, lobby) {
    this.network = network;
    this.lobby = lobby;
    this.root = document.getElementById('menu-root');
    this.intro = document.getElementById('intro');
    this.introMain = document.getElementById('intro-main');
    this.introSub = document.getElementById('intro-sub');
    this.title = document.getElementById('title-screen');
    this.list = document.getElementById('menu-list');
    this.background = new AbstractBackground(document.getElementById('menu-bg'));
    this.mode = 'intro'; // intro | main | settings
    this.index = 0;
    this.padHeld = {};
    this.running = true;

    window.addEventListener('keydown', (e) => this._onKey(e));
    this._pollPad();

    events.on('lobby:back', () => this._onLobbyBack());
  }

  _onLobbyBack() {
    if (!this.lobby?.active) return; // already left
    // Show the title first so a failure while leaving can't strand the player.
    this.root.classList.remove('hidden');
    this.title.classList.add('show');
    this.mode = 'main';
    this.index = 0;
    this._renderList();
    // Hold gamepad buttons until released so the press that triggered "back"
    // doesn't also activate a main-menu item.
    for (const b of [0, 1]) this.padHeld[b] = true;
    try {
      this.lobby.close();
    } finally {
      this.lobby.root.classList.add('ui-hidden');
    }
  }

  _showRoot(show) {
    this.root.classList.toggle('hidden', !show);
  }

  // Intro sequence; ENTER skips straight to the title screen.
  async start() {
    let skipped = false;
    const skip = new Promise((resolve) => {
      this._skipIntro = () => { skipped = true; resolve(); };
    });
    const pause = (ms) => Promise.race([wait(ms), skip]);

    await pause(400);
    if (!skipped) {
      this.introMain.classList.add('show');
      await pause(1400);
    }
    if (!skipped) {
      this.introSub.classList.add('show');
      await pause(2200);
    }
    if (!skipped) {
      this.intro.classList.add('fade-out');
      await pause(1200);
    }
    this._skipIntro = null;
    this.intro.classList.add('hidden');
    this.title.classList.add('show');
    this.mode = 'main';
    this._renderList();
  }

  // ---- rendering ----
  _items() {
    if (this.mode === 'settings') {
      const rows = Object.keys(SETTING_DEFS).map((key) => ({
        id: key,
        label: SETTING_DEFS[key].label,
        value: settings.get(key),
        setting: true
      }));
      rows.push({ id: 'back', label: 'BACK' });
      return rows;
    }
    if (this.mode === 'multi') return MULTI_ITEMS;
    return [...MAIN_ITEMS, ...MAIN_SMALL];
  }

  _renderList() {
    const items = this._items();
    this.index = Math.min(this.index, items.length - 1);
    this.list.innerHTML = '';
    let row = null;
    items.forEach((item, i) => {
      if (item.small) {
        if (!row) { row = document.createElement('li'); row.className = 'menu-row'; this.list.appendChild(row); }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'menu-small' + (i === this.index ? ' active' : '');
        b.innerHTML = `${ICONS[item.icon]}<span></span>`;
        b.lastChild.textContent = item.label;
        b.addEventListener('mouseenter', () => { this.index = i; this._updateActive(); });
        b.addEventListener('click', () => { this.index = i; this._activate(1); });
        row.appendChild(b);
        return;
      }
      const li = document.createElement('li');
      li.className = 'menu-item' + (i === this.index ? ' active' : '');
      const label = document.createElement('span');
      label.textContent = item.label;
      li.appendChild(label);
      if (item.setting) {
        const val = document.createElement('span');
        val.className = 'menu-value';
        val.textContent = `< ${item.value} >`;
        li.appendChild(val);
      }
      li.addEventListener('mouseenter', () => { this.index = i; this._updateActive(); });
      li.addEventListener('click', () => { this.index = i; this._activate(1); });
      this.list.appendChild(li);
    });
  }

  _updateActive() {
    [...this.list.querySelectorAll('.menu-item, .menu-small')].forEach((el, i) => el.classList.toggle('active', i === this.index));
  }

  // ---- input ----
  _move(d) {
    const n = this._items().length;
    const first = MAIN_ITEMS.length;
    if (this.mode === 'main' && this.index >= first) this.index = d < 0 ? first - 1 : 0; // leave the small-button row
    else if (this.mode === 'main' && this.index === 0 && d < 0) this.index = first;
    else if (this.mode === 'main' && this.index === first - 1 && d > 0) this.index = first;
    else this.index = (this.index + d + n) % n;
    this._updateActive();
  }

  _activate(dir) {
    const item = this._items()[this.index];
    if (!item) return;
    if (this.mode === 'main') {
      if (item.id === 'settings') { this.mode = 'settings'; this.index = 0; this._renderList(); }
      else if (item.id === 'singleplayer') this._enterSingleplayer();
      else if (item.small) { /* achievements / collectibles: not implemented yet */ }
      else if (item.id === 'multiplayer') { this.mode = 'multi'; this.index = 0; this._renderList(); }
      events.emit('menu:select', item.id);
    } else if (this.mode === 'multi') {
      if (item.id === 'createLobby') this._createLobby();
      else if (item.id === 'joinLobby') this._joinLobby();
      else if (item.id === 'backMulti') { this.mode = 'main'; this.index = 1; this._renderList(); }
    } else if (item.setting) {
      settings.cycle(item.id, dir);
      this._renderList();
    } else if (item.id === 'back') {
      this._back();
    }
  }

  _back() {
    if (this.mode === 'multi') {
      this.mode = 'main';
      this.index = 1;
      this._renderList();
      return;
    }
    if (this.mode !== 'settings') return;
    this.mode = 'main';
    this.index = MAIN_ITEMS.findIndex((i) => i.id === 'settings');
    this._renderList();
  }

  _hideTitle() {
    this.title.classList.remove('show');
    this.root.classList.add('hidden');
  }

  _enterSingleplayer() {
    this._hideTitle();
    this.lobby?.openSingleplayer();
  }

  async _createLobby() {
    const name = await showPrompt({ title: 'ENTER USERNAME', placeholder: 'Username', initialValue: profile.name });
    if (!name) return;
    profile.setName(name);
    const off = events.on('net:lobbyState', (state) => {
      off();
      this._hideTitle();
      this.lobby?.openMultiplayer(state);
    });
    this.network.createLobby(name);
  }

  async _joinLobby() {
    const name = await showPrompt({ title: 'ENTER USERNAME', placeholder: 'Username', initialValue: profile.name });
    if (!name) return;
    profile.setName(name);
    const code = await showPrompt({ title: 'ENTER LOBBY CODE', placeholder: 'e.g. AB12' });
    if (!code) return;

    const onState = events.on('net:lobbyState', (state) => {
      cleanup();
      this._hideTitle();
      this.lobby?.openMultiplayer(state);
    });
    const onError = events.on('net:lobbyError', (msg) => {
      cleanup();
      showPromptError(msg.message);
      this._joinLobby();
    });
    function cleanup() { onState(); onError(); }
    this.network.joinLobby(name, code.toUpperCase());
  }

  _adjust(dir) {
    const item = this._items()[this.index];
    if (this.mode === 'settings' && item?.setting) this._activate(dir);
    else if (this.mode === 'main' && item?.small) { this.index = this.index === MAIN_ITEMS.length ? this.index + 1 : this.index - 1; this._updateActive(); }
  }

  _onKey(e) {
    if (this.mode === 'intro') {
      if (e.key === 'Enter' && !e.repeat && this._skipIntro) { this._skipIntro(); e.preventDefault(); }
      return;
    }
    // Decide ownership once per event so a single keypress can never be
    // handled by the lobby and then again by the title menu.
    if (this.lobby?.active) {
      if (this.lobby.handleKey(e)) e.preventDefault();
      return;
    }
    if (e.repeat && (e.key === 'Enter' || e.key === ' ')) return;
    const k = e.key;
    if (k === 'ArrowUp') this._move(-1);
    else if (k === 'ArrowDown') this._move(1);
    else if (k === 'ArrowLeft') this._adjust(-1);
    else if (k === 'ArrowRight') this._adjust(1);
    else if (k === 'Enter' || k === ' ') this._activate(1);
    else if (k === 'Escape' || k === 'Backspace') this._back();
    else return;
    e.preventDefault();
  }

  _pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = [...pads].find(Boolean);
    if (pad && this.mode !== 'intro' && !this.lobby?.active) {
      const actions = { 12: () => this._move(-1), 13: () => this._move(1),
        14: () => this._adjust(-1), 15: () => this._adjust(1),
        0: () => this._activate(1), 1: () => this._back() };
      for (const b of Object.keys(actions)) {
        const pressed = !!pad.buttons[b]?.pressed;
        if (pressed && !this.padHeld[b]) actions[b]();
        this.padHeld[b] = pressed;
      }
    }
    requestAnimationFrame(() => this._pollPad());
  }
}
