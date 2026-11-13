// In-game multiplayer chat: small log on the left, 'T' opens the input,
// Enter sends and returns to the game, Escape cancels.
import { events } from '../core/events.js';

const FADE_MS = 8000;
const MAX_LINES = 50;

export class GameChat {
  constructor({ canvas, input, network, canOpen }) {
    this.canvas = canvas;
    this.input = input;
    this.network = network;
    this.canOpen = canOpen;
    this.isOpen = false;
    this.active = false;
    this.root = document.getElementById('game-chat');
    this.log = document.getElementById('game-chat-log');
    this.field = document.getElementById('game-chat-input');
    this.onChange = () => {};

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyT' || e.repeat || this.isOpen || !this.active || !this.canOpen()) return;
      e.preventDefault();
      this.open();
    }, true);

    this.field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        const text = this.field.value.trim();
        if (text) this.network.sendChat(text);
        this.close(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close(true);
      }
    });
    this.field.addEventListener('keyup', (e) => e.stopPropagation());

    events.on('net:lobbyChat', (m) => { if (this.active) this.addLine(m.name, m.text); });
  }

  // Enable for a multiplayer match; clears old lines.
  start() {
    this.active = true;
    this.log.replaceChildren();
    this.root.classList.remove('ui-hidden');
  }

  stop() {
    this.close(false);
    this.active = false;
    this.root.classList.add('ui-hidden');
    this.log.replaceChildren();
  }

  open() {
    this.isOpen = true; // set first so releasing pointer lock doesn't open the pause menu
    this.input.clearKeys();
    this.root.classList.add('open');
    this.field.value = '';
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.field.focus();
    this.onChange();
  }

  close(relock) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.field.value = '';
    this.field.blur();
    this.input.clearKeys();
    if (relock) {
      try { this.canvas.requestPointerLock?.(); } catch { /* click the canvas instead */ }
    }
    this.onChange();
  }

  addLine(name, text) {
    const line = document.createElement('div');
    line.className = 'gc-line';
    const n = document.createElement('span');
    n.className = 'gc-name';
    n.textContent = `${name}: `;
    line.append(n, document.createTextNode(text));
    this.log.appendChild(line);
    while (this.log.childElementCount > MAX_LINES) this.log.firstChild.remove();
    this.log.scrollTop = this.log.scrollHeight;
    setTimeout(() => line.classList.add('gc-old'), FADE_MS);
  }
}
