// Lobby screen shown after choosing SINGLEPLAYER (local, one player) or
// after creating/joining a MULTIPLAYER room (server-driven, up to 8 players).
// Handles the top-left menu, top-right player list + stat popup, bottom-left
// map banner/name (+ room code), bottom-right settings button, and the
// multiplayer-only center-right text chat.
import { AbstractBackground } from './background.js';
import { events } from '../core/events.js';
import { settings, SETTING_DEFS } from '../state/settings.js';
import { profile } from '../state/profile.js';
import { PERKS, PERK_IDS, perkOf, perkHex, effectivePerk } from '../game/perks.js';
import { listMaps, getMap, DEFAULT_MAP_ID } from '../maps/maps.js';
import { CHARACTERS, CHARACTER_IDS, randomCharacterId } from '../game/characters.js';

export const MAX_LOBBY_PLAYERS = 8;

export class LobbySystem {
  constructor(network) {
    this.network = network;
    this.root = document.getElementById('lobby-root');
    this.background = new AbstractBackground(document.getElementById('lobby-bg'));
    this.menuList = document.getElementById('lobby-menu-list');
    this.playerList = document.getElementById('lobby-player-list');
    this.roomCodeEl = document.getElementById('lobby-room-code');
    this.bannerEl = document.getElementById('lobby-map-banner');
    this.mapNameEl = document.getElementById('lobby-map-name');
    this.settingsBtn = document.getElementById('lobby-settings-btn');
    this.chatPanel = document.getElementById('lobby-chat');
    this.chatLog = document.getElementById('lobby-chat-log');
    this.chatInput = document.getElementById('lobby-chat-input');

    this.popupOverlay = document.getElementById('lobby-popup-overlay');
    this.popupName = document.getElementById('lobby-popup-name');
    this.popupRename = document.getElementById('lobby-popup-rename');
    this.popupNameInput = document.getElementById('lobby-popup-name-input');
    this.popupSave = document.getElementById('lobby-popup-save');
    this.popupStats = document.getElementById('lobby-popup-stats');
    this.popupClose = document.getElementById('lobby-popup-close');

    this.settingsOverlay = document.getElementById('lobby-settings-overlay');
    this.settingsList = document.getElementById('lobby-settings-list');
    this.settingsClose = document.getElementById('lobby-settings-close');

    this.mapsOverlay = document.getElementById('lobby-maps-overlay');
    this.mapsList = document.getElementById('lobby-maps-list');
    this.mapsTitle = document.getElementById('lobby-maps-title');
    this.mapsBanner = document.getElementById('lobby-maps-banner');
    this.mapsDesc = document.getElementById('lobby-maps-desc');
    this.mapsIndex = 0;
    this.modeEl = document.getElementById('lobby-mode');
    this.leaderEl = document.getElementById('lobby-leader');
    this.playersTitle = document.getElementById('lobby-players-title');
    this.charsOverlay = document.getElementById('lobby-chars-overlay');
    this.charsList = document.getElementById('lobby-chars-list');
    this.charsIndex = 0;
    this.localChar = randomCharacterId(); // singleplayer character (kept across games)
    this.perksOverlay = document.getElementById('lobby-perks-overlay');
    this.perksList = document.getElementById('lobby-perks-list');
    this.perksIndex = 0;
    this._inputReadyAt = 0; // ignore gamepad edges until then (the press that opened a screen)

    this.suspended = false;
    this.mode = null;       // 'single' | 'multi'
    this.isHost = true;
    this.mapId = DEFAULT_MAP_ID;
    this.roomCode = null;
    this.localId = 'local';
    this.players = [{ id: 'local', name: profile.name }];
    this.menuIndex = 0;

    this._bindStatic();
    this._bindNetwork();
  }

  // ---- entry points ----
  openSingleplayer() {
    this.mode = 'single';
    this.isHost = true;
    this.mapId = DEFAULT_MAP_ID;
    this.roomCode = null;
    this.localId = 'local';
    this.players = [{ id: 'local', name: profile.name }];
    this.localChar = randomCharacterId();
    this._show();
  }

  openMultiplayer(initialState) {
    this.mode = 'multi';
    this.localId = this.network.playerId ?? this.localId; // singleplayer had set 'local'
    this.network.setPerk(profile.perk); // keep the server copy in sync with the saved choice
    this._applyLobbyState(initialState);
    this._show();
  }

  // ---- match transition hooks (used by GameSession) ----
  // Suspended: keys are swallowed and popups closed while a match starts.
  suspend() {
    this.suspended = true;
    this._closePopup();
    this._closeSettings();
    this._closeMaps();
    this._closePerks();
    this._closeChars();
  }

  // Back to the interactive lobby (e.g. match aborted).
  resume(reason) {
    this.suspended = false;
    this._inputReadyAt = performance.now() + 300;
    this.root.classList.remove('ui-hidden');
    this._renderAll();
    if (reason) this._appendChat('System', reason, true);
  }

  // Hide the lobby UI without leaving it (match is starting).
  hide() {
    this.root.classList.add('ui-hidden');
  }

  close() {
    this.suspended = false;
    this.root.classList.add('ui-hidden');
    this._closePopup();
    this._closeSettings();
    this._closeMaps();
    this._closePerks();
    this._closeChars();
    if (this.mode === 'multi') this.network.leaveLobby();
    this.mode = null;
    this._lobbyStateInitialized = false;
    this._lastHostId = null;
  }

  get active() { return this.mode !== null; }

  // ---- network-driven state (multiplayer) ----
  _bindNetwork() {
    events.on('net:lobbyState', (state) => {
      if (this.mode !== 'multi') return;
      this._applyLobbyState(state);
    });
    events.on('net:lobbyChat', (msg) => {
      if (this.mode !== 'multi') return;
      this._appendChat(msg.name, msg.text);
    });
    events.on('net:lobbyError', (msg) => {
      this._appendChat('System', msg.message, true);
    });
    events.on('net:welcome', (msg) => {
      if (this.mode !== 'single') this.localId = msg.id;
    });
    events.on('net:lobbyClosed', () => {
      // Defensive: if the server tears down this lobby while we're in it,
      // return to the main menu instead of stranding the player here.
      if (this.mode !== 'multi') return;
      events.emit('lobby:back', { mode: this.mode, reason: 'closed' });
    });
    events.on('net:disconnected', () => {
      // Connection lost mid-lobby: the server dropped our membership, so
      // leave gracefully rather than showing a dead lobby.
      if (this.mode !== 'multi') return;
      events.emit('lobby:back', { mode: this.mode, reason: 'disconnected' });
    });
  }

  _applyLobbyState(state) {
    // Detect players who left since the last state snapshot so everyone
    // remaining in the lobby is notified (multiplayer only).
    const departed = [];
    if (this._lobbyStateInitialized) {
      const nextIds = new Set(state.players.map((p) => p.id));
      for (const p of this.players) {
        if (!nextIds.has(p.id)) departed.push(p);
      }
    }
    this._lobbyStateInitialized = true;

    const prevHostId = this._lastHostId;
    this.roomCode = state.code;
    this.mapId = state.mapId;
    this.players = state.players;
    this.readyNeeded = state.readyNeeded;
    this.isHost = state.hostId === this.localId;
    this._lastHostId = state.hostId;
    this._renderAll();

    // Keep an open popup for another player in sync with relayed stats.
    if (this._popupPlayerId != null && !this.popupOverlay.classList.contains('ui-hidden')) {
      const open = this.players.find((p) => p.id === this._popupPlayerId);
      if (open && open.id !== this.localId) this._openPopup(open, false);
    }

    for (const p of departed) {
      this._appendChat('System', `${p.name} left the lobby.`, true);
    }
    if (prevHostId && prevHostId !== state.hostId && departed.some((p) => p.id === prevHostId)) {
      const host = state.players.find((p) => p.id === state.hostId);
      const who = state.hostId === this.localId ? 'You are' : `${host ? host.name : 'Another player'} is`;
      this._appendChat('System', `${who} now the host.`, true);
    }
  }

  // ---- show/hide ----
  _show() {
    this._inputReadyAt = performance.now() + 300;
    this.root.classList.remove('ui-hidden');
    this.chatPanel.classList.toggle('ui-hidden', this.mode !== 'multi');
    this.chatLog.innerHTML = '';
    this.menuIndex = 0;
    this._renderAll();
  }

  _renderAll() {
    this._renderTitle();
    this._renderMenu();
    this._renderPlayers();
    this._renderMapInfo();
  }

  // ---- top-left menu ----
  _menuItems() {
    if (this.mode === 'single') {
      return [
        { id: 'start', label: 'START GAME' },
        { id: 'changeMap', label: 'CHANGE MAP' },
        { id: 'perk', label: 'PERMA-PERK' },
        { id: 'back', label: 'BACK TO MAIN MENU' }
      ];
    }
    return [
      { id: 'ready', label: this._selfReady() ? 'UNREADY' : 'READY UP' },
      { id: 'changeMap', label: 'CHANGE MAP', disabled: !this.isHost },
      { id: 'perk', label: 'PERMA-PERK' },
      { id: 'back', label: 'BACK TO MAIN MENU' }
    ];
  }

  _selfReady() {
    return !!this.players.find((p) => p.id === this.localId)?.ready;
  }

  _renderMenu() {
    const items = this._menuItems();
    this.menuIndex = Math.min(this.menuIndex, items.length - 1);
    this._menuItemsCache = items;
    this.menuList.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      li.className = 'menu-item' + (item.disabled ? ' disabled' : '');
      li.textContent = item.label;
      // Only toggle classes on hover: rebuilding the list here would replace
      // the element under the cursor and swallow the click.
      li.addEventListener('mouseenter', () => { this.menuIndex = i; this._updateMenuActive(); });
      li.addEventListener('click', () => { this.menuIndex = i; this._activateMenu(item); });
      this.menuList.appendChild(li);
    });
    this._updateMenuActive();
  }

  _updateMenuActive() {
    [...this.menuList.children].forEach((el, i) => el.classList.toggle('active', i === this.menuIndex));
  }

  _activateMenu(item) {
    if (item.disabled || this.suspended) return;
    if ((item.id === 'start' || (item.id === 'ready' && !this._selfReady())) && getMap(this.mapId).ready === false) {
      this._appendChat('System', `${getMap(this.mapId).name} isn't ready yet - pick another map.`, true);
      return;
    }
    if (item.id === 'start') {
      // GameSession runs the countdown/loading flow (server-driven in multiplayer).
      events.emit('lobby:start', { mapId: this.mapId, mode: this.mode });
    } else if (item.id === 'ready') {
      this.network.setReady(!this._selfReady());
    } else if (item.id === 'perk') {
      this._openPerks();
    } else if (item.id === 'changeMap') {
      this._openMaps();
    } else if (item.id === 'back') {
      events.emit('lobby:back', { mode: this.mode });
    }
  }

  // ---- top-left title + party leader line ----
  _renderTitle() {
    this.modeEl.textContent = this.mode === 'multi' ? 'MULTIPLAYER' : 'SINGLEPLAYER';
    this.leaderEl.classList.toggle('ui-hidden', !(this.mode === 'multi' && this.isHost));
  }

  _charOf(p) { return p.id === this.localId && this.mode !== 'multi' ? this.localChar : p.char; }

  // ---- bottom-right player list ----
  _renderPlayers() {
    this.playerList.innerHTML = '';
    const btn = (label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'mini-btn';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', (e) => { e.stopPropagation(); if (!this.suspended) fn(); });
      return b;
    };
    this.players.forEach((p) => {
      const self = p.id === this.localId;
      const li = document.createElement('li');
      li.className = 'lobby-player-row' + (self ? ' self' : '');
      const top = document.createElement('div');
      top.className = 'row-top';
      const label = document.createElement('span');
      label.className = 'row-name';
      label.textContent = p.name;
      top.appendChild(label);
      if (self) top.appendChild(btn('EDIT', 'Change your username', () => this._openPopup(p, true)));
      top.appendChild(btn('STATS', 'Player stats', () => this._openPopup(p, false)));
      if (this.mode === 'multi' && p.id === this._lastHostId) {
        const tag = document.createElement('span');
        tag.className = 'host-tag';
        tag.textContent = 'HOST';
        top.appendChild(tag);
      }
      if (this.mode === 'multi' && p.ready) {
        const tag = document.createElement('span');
        tag.className = 'ready-tag';
        tag.textContent = 'READY';
        top.appendChild(tag);
      }
      li.appendChild(top);

      const meta = document.createElement('div');
      meta.className = 'row-meta';
      const perkId = self ? effectivePerk(profile.perk, this.mode) : (p.perk ?? 'classic');
      const pk = document.createElement('span');
      pk.className = 'perk-tag';
      pk.style.setProperty('--c', perkHex(perkId));
      pk.innerHTML = '<span class="perk-dot"></span>';
      pk.append(perkOf(perkId).name.replace('The ', '').toUpperCase());
      meta.appendChild(pk);
      const ch = document.createElement('span');
      ch.className = 'row-char';
      ch.textContent = CHARACTERS[this._charOf(p)]?.name ?? '...';
      meta.appendChild(ch);
      if (self) meta.appendChild(btn('EDIT', 'Change your character', () => this._openChars()));
      li.appendChild(meta);
      this.playerList.appendChild(li);
    });
    this.playersTitle.textContent = `PLAYERS ${this.players.length}/${this.mode === 'multi' ? MAX_LOBBY_PLAYERS : 1}`;
    const status = document.getElementById('lobby-ready-status');
    if (this.mode === 'multi') {
      const n = this.players.filter((p) => p.ready).length;
      status.textContent = `${n}/${this.players.length} ready (need ${this.readyNeeded})`;
      status.classList.remove('ui-hidden');
    } else {
      status.classList.add('ui-hidden');
    }
  }

  // ---- character picker ----
  get _charsOpen() { return !this.charsOverlay.classList.contains('ui-hidden'); }

  _openChars() {
    const me = this.players.find((p) => p.id === this.localId);
    const cur = me ? this._charOf(me) : this.localChar;
    this.charsIndex = Math.max(0, CHARACTER_IDS.indexOf(cur));
    this.charsList.innerHTML = '';
    CHARACTER_IDS.forEach((id, i) => {
      const li = document.createElement('li');
      li.textContent = CHARACTERS[id].name;
      li.classList.toggle('current', id === cur);
      li.addEventListener('mouseenter', () => this._setCharsIndex(i));
      li.addEventListener('click', () => this._selectChar(id));
      this.charsList.appendChild(li);
    });
    this._inputReadyAt = performance.now() + 250;
    this.charsOverlay.classList.remove('ui-hidden');
    this._setCharsIndex(this.charsIndex);
  }

  _closeChars() { this.charsOverlay.classList.add('ui-hidden'); }

  _setCharsIndex(i) {
    this.charsIndex = (i + CHARACTER_IDS.length) % CHARACTER_IDS.length;
    [...this.charsList.children].forEach((el, j) => el.classList.toggle('active', j === this.charsIndex));
  }

  _selectChar(id) {
    this._closeChars();
    if (this.mode === 'multi') this.network.setCharacter(id); // server validates + broadcasts lobbyState
    else { this.localChar = id; this._renderPlayers(); }
  }

  // ---- bottom-left map info ----
  _renderMapInfo() {
    const map = getMap(this.mapId);
    this.mapNameEl.textContent = map.ready === false ? `${map.name} (COMING SOON)` : map.name;
    this._setBanner(this.bannerEl, map, 'MAP BANNER');
    this._setBackdrop(map);

    if (this.mode === 'multi' && this.roomCode) {
      this.roomCodeEl.textContent = `ROOM CODE: ${this.roomCode}`;
      this.roomCodeEl.classList.remove('ui-hidden');
    } else {
      this.roomCodeEl.classList.add('ui-hidden');
    }
  }

  // Blurred banner behind the lobby; the animated canvas shows through when there is no banner.
  _setBackdrop(map) {
    const el = this.bgImg ||= document.getElementById('lobby-bg-img');
    if (!el || el.dataset.mapId === map.id) return;
    el.dataset.mapId = map.id;
    const img = new Image();
    img.onload = () => { if (el.dataset.mapId === map.id) { el.style.backgroundImage = `url('${map.banner}')`; el.classList.add('on'); } };
    img.onerror = () => { if (el.dataset.mapId === map.id) { el.style.backgroundImage = ''; el.classList.remove('on'); } };
    img.src = map.banner;
  }

  // Shows map.banner in `el`, keeping placeholder text until the image loads.
  _setBanner(el, map, placeholder) {
    el.style.backgroundImage = '';
    el.textContent = placeholder;
    const img = new Image();
    img.onload = () => {
      if (el.dataset.mapId !== map.id) return; // a different map was hovered meanwhile
      el.style.backgroundImage = `url('${map.banner}')`;
      el.textContent = '';
    };
    img.onerror = () => { /* keep placeholder text, banner art not supplied */ };
    el.dataset.mapId = map.id;
    img.src = map.banner;
  }

  // ---- maps popup ----
  get _mapsOpen() { return !this.mapsOverlay.classList.contains('ui-hidden'); }

  _openMaps() {
    const maps = listMaps();
    this.mapsIndex = Math.max(0, maps.findIndex((m) => m.id === this.mapId));
    this.mapsList.innerHTML = '';
    maps.forEach((m, i) => {
      const li = document.createElement('li');
      li.textContent = m.name;
      li.classList.toggle('soon', m.ready === false);
      li.classList.toggle('current', m.id === this.mapId);
      li.addEventListener('mouseenter', () => this._setMapsIndex(i));
      li.addEventListener('click', () => { this._setMapsIndex(i); this._selectMap(m.id); });
      this.mapsList.appendChild(li);
    });
    this._inputReadyAt = performance.now() + 250;
    this.mapsOverlay.classList.remove('ui-hidden');
    this._setMapsIndex(this.mapsIndex);
  }

  _closeMaps() {
    this.mapsOverlay.classList.add('ui-hidden');
  }

  _setMapsIndex(i) {
    const maps = listMaps();
    this.mapsIndex = (i + maps.length) % maps.length;
    [...this.mapsList.children].forEach((el, j) => el.classList.toggle('active', j === this.mapsIndex));
    this.mapsList.children[this.mapsIndex]?.scrollIntoView({ block: 'nearest' });
    this.mapsDesc.scrollTop = 0;
    const map = maps[this.mapsIndex];
    this.mapsTitle.textContent = map.name;
    this.mapsDesc.textContent = map.description || '';
    this._setBanner(this.mapsBanner, map, '');
  }

  _selectMap(id) {
    this._closeMaps();
    if (this.mode === 'multi') this._appendChat('System', `Map: ${getMap(id).name}`, true);
    if (id === this.mapId) return;
    if (this.mode === 'single') {
      this.mapId = id;
      this._renderMapInfo();
    } else {
      this.network.setMap(id); // server validates host + phase, then broadcasts lobbyState
    }
  }

  // ---- perma-perk picker ----
  get _perksOpen() { return !this.perksOverlay.classList.contains('ui-hidden'); }

  _perkDisabled(id) { return !!PERKS[id].multiOnly && this.mode !== 'multi'; }

  _openPerks() {
    const cur = effectivePerk(profile.perk, this.mode);
    this.perksIndex = Math.max(0, PERK_IDS.indexOf(cur));
    this.perksList.innerHTML = '';
    PERK_IDS.forEach((id, i) => {
      const li = document.createElement('li');
      li.style.setProperty('--c', perkHex(id));
      li.innerHTML = '<span class="perk-dot"></span>';
      li.append(PERKS[id].name);
      li.classList.toggle('current', id === cur);
      li.classList.toggle('disabled', this._perkDisabled(id));
      li.addEventListener('mouseenter', () => this._setPerksIndex(i));
      li.addEventListener('click', () => { this._setPerksIndex(i); this._selectPerk(id); });
      this.perksList.appendChild(li);
    });
    this._inputReadyAt = performance.now() + 250;
    this.perksOverlay.classList.remove('ui-hidden');
    this._setPerksIndex(this.perksIndex);
  }

  _closePerks() { this.perksOverlay.classList.add('ui-hidden'); }

  _setPerksIndex(i) {
    this.perksIndex = (i + PERK_IDS.length) % PERK_IDS.length;
    [...this.perksList.children].forEach((el, j) => el.classList.toggle('active', j === this.perksIndex));
    const p = PERKS[PERK_IDS[this.perksIndex]];
    document.getElementById('lobby-perks-preview').style.setProperty('--c', perkHex(p.id));
    document.getElementById('lobby-perks-title').textContent = p.name.toUpperCase();
    document.getElementById('lobby-perks-desc').textContent = p.desc;
    const cur = effectivePerk(profile.perk, this.mode) === p.id;
    document.getElementById('lobby-perks-note').textContent = this._perkDisabled(p.id) ? 'MULTIPLAYER ONLY' : cur ? 'SELECTED' : 'PRESS ENTER / CLICK TO SELECT';
    if (this.perksIndex !== this._perkShown) { // restart the swap animation on change
      this._perkShown = this.perksIndex;
      const prev = document.getElementById('lobby-perks-preview');
      prev.classList.remove('swap'); void prev.offsetWidth; prev.classList.add('swap');
    }
  }

  _selectPerk(id) {
    if (this._perkDisabled(id)) return;
    this._closePerks();
    this._closeChars();
    profile.setPerk(id); // relayed to the server through main.js
    this._renderPlayers();
  }

  // ---- player popup ----
  // rename: true shows the username editor (own row's EDIT button); otherwise stats only.
  _openPopup(player, rename = false) {
    const isSelf = player.id === this.localId;
    this.popupName.textContent = player.name;
    this.popupRename.classList.toggle('ui-hidden', !(isSelf && rename));
    this.popupNameInput.value = player.name;

    this._popupPlayerId = player.id;
    this.popupStats.innerHTML = '';
    // Self: local profile. Others: totals relayed by the server in lobbyState.
    const stats = (isSelf ? profile.stats : player.stats) ?? {};
    const rows = [
      ['Games Played', stats.gamesPlayed ?? 0],
      ['Kills', stats.kills ?? 0],
      ['Deaths', stats.deaths ?? 0],
      ['Downs', stats.downs ?? 0],
      ['Revives', stats.revives ?? 0],
      ['Best Round', stats.bestRound ?? 0]
    ];
    for (const [label, value] of rows) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${label}</span><span>${value}</span>`;
      this.popupStats.appendChild(li);
    }
    this.popupOverlay.classList.remove('ui-hidden');
  }

  _closePopup() {
    this.popupOverlay.classList.add('ui-hidden');
    this._popupPlayerId = null;
  }

  _savePopupName() {
    const name = this.popupNameInput.value.trim();
    if (!name) return;
    profile.setName(name);
    if (this.mode === 'single') {
      this.players = [{ id: 'local', name }];
      this._renderPlayers();
    } else {
      this.network.setName(name);
    }
    this._closePopup();
  }

  // ---- settings overlay ----
  _openSettings() {
    this.settingsList.innerHTML = '';
    Object.keys(SETTING_DEFS).forEach((key) => {
      const li = document.createElement('li');
      const def = SETTING_DEFS[key];
      const label = document.createElement('span');
      label.textContent = def.label;
      const value = document.createElement('span');
      value.textContent = settings.get(key);
      value.style.cursor = 'pointer';
      value.addEventListener('click', () => {
        settings.cycle(key, 1);
        value.textContent = settings.get(key);
      });
      li.appendChild(label);
      li.appendChild(value);
      this.settingsList.appendChild(li);
    });
    this.settingsOverlay.classList.remove('ui-hidden');
  }

  _closeSettings() {
    this.settingsOverlay.classList.add('ui-hidden');
  }

  // ---- chat ----
  _appendChat(name, text, isSystem = false) {
    const line = document.createElement('div');
    line.className = 'lobby-chat-line';
    line.innerHTML = isSystem
      ? `<span class="chat-name" style="color:#ff7a7a">${name}:</span>${this._escape(text)}`
      : `<span class="chat-name">${this._escape(name)}:</span>${this._escape(text)}`;
    this.chatLog.appendChild(line);
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  _escape(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Called by MenuSystem (the single global key dispatcher) while active.
  handleKey(e) {
    if (this.suspended) return true;
    const popupOpen = !this.popupOverlay.classList.contains('ui-hidden');
    const settingsOpen = !this.settingsOverlay.classList.contains('ui-hidden');
    const k = e.key;
    if (this._mapsOpen) {
      if (k === 'Escape') this._closeMaps();
      else if (k === 'ArrowUp' || k === 'ArrowDown') this._setMapsIndex(this.mapsIndex + (k === 'ArrowDown' ? 1 : -1));
      else if ((k === 'Enter' || k === ' ') && !e.repeat) this._selectMap(listMaps()[this.mapsIndex].id);
      else return false;
      return true;
    }
    if (this._charsOpen) {
      if (k === 'Escape') this._closeChars();
      else if (k === 'ArrowUp' || k === 'ArrowDown') this._setCharsIndex(this.charsIndex + (k === 'ArrowDown' ? 1 : -1));
      else if ((k === 'Enter' || k === ' ') && !e.repeat) this._selectChar(CHARACTER_IDS[this.charsIndex]);
      else return false;
      return true;
    }
    if (this._perksOpen) {
      if (k === 'Escape') this._closePerks();
      else if (k === 'ArrowUp' || k === 'ArrowDown') this._setPerksIndex(this.perksIndex + (k === 'ArrowDown' ? 1 : -1));
      else if ((k === 'Enter' || k === ' ') && !e.repeat) this._selectPerk(PERK_IDS[this.perksIndex]);
      else return false;
      return true;
    }
    if (k === 'Escape') {
      if (popupOpen) this._closePopup();
      else if (settingsOpen) this._closeSettings();
      else events.emit('lobby:back', { mode: this.mode });
      return true;
    }
    if (popupOpen || settingsOpen) return false;
    const items = this._menuItemsCache || this._menuItems();
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      this.menuIndex = (this.menuIndex + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      this._updateMenuActive();
      return true;
    }
    if (k === 'Enter' || k === ' ') {
      this._activateMenu(items[this.menuIndex]);
      return true;
    }
    return false;
  }

  // Controller (edge: button index -> pressed this frame; called from GameSession).
  // D-pad up/down navigate, A activates, B closes popups.
  handlePad(edge) {
    if (this.suspended || performance.now() < this._inputReadyAt) return;
    const dir = edge[13] ? 1 : edge[12] ? -1 : 0;
    if (this._mapsOpen) {
      if (dir) this._setMapsIndex(this.mapsIndex + dir);
      else if (edge[0]) this._selectMap(listMaps()[this.mapsIndex].id);
      else if (edge[1]) this._closeMaps();
      return;
    }
    if (this._charsOpen) {
      if (dir) this._setCharsIndex(this.charsIndex + dir);
      else if (edge[0]) this._selectChar(CHARACTER_IDS[this.charsIndex]);
      else if (edge[1]) this._closeChars();
      return;
    }
    if (this._perksOpen) {
      if (dir) this._setPerksIndex(this.perksIndex + dir);
      else if (edge[0]) this._selectPerk(PERK_IDS[this.perksIndex]);
      else if (edge[1]) this._closePerks();
      return;
    }
    if (!this.popupOverlay.classList.contains('ui-hidden') || !this.settingsOverlay.classList.contains('ui-hidden')) {
      if (edge[1]) { this._closePopup(); this._closeSettings(); }
      return;
    }
    const items = this._menuItemsCache || this._menuItems();
    if (dir) {
      this.menuIndex = (this.menuIndex + dir + items.length) % items.length;
      this._updateMenuActive();
    } else if (edge[0]) {
      this._activateMenu(items[this.menuIndex]);
    }
  }

  // ---- static bindings ----
  _bindStatic() {
    document.getElementById('lobby-chars-close').addEventListener('click', () => this._closeChars());
    document.getElementById('lobby-perks-close').addEventListener('click', () => this._closePerks());
    this.settingsBtn.addEventListener('click', () => this._openSettings());
    this.settingsClose.addEventListener('click', () => this._closeSettings());
    this.popupClose.addEventListener('click', () => this._closePopup());
    this.popupSave.addEventListener('click', () => this._savePopupName());

    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) {
          this.network.sendChat(text);
          this.chatInput.value = '';
        }
      }
    });
    this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());
  }
}


