// In-game debug console: '~' opens a thin command bar, ESC closes it and returns
// the mouse to the camera. Commands are a registry: { name: () => 'message' }.
export class DevConsole {
  constructor({ canvas, input, canOpen, commands }) {
    this.canvas = canvas;
    this.input = input;
    this.canOpen = canOpen;
    this.commands = commands;
    this.isOpen = false;
    this.root = document.getElementById('dev-console');
    this.field = document.getElementById('dev-console-input');
    this.out = document.getElementById('dev-console-out');

    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backquote' || this.isOpen || e.repeat || !this.canOpen()) return;
      e.preventDefault();
      this.open();
    }, true);

    // Keep typed keys away from gameplay input and the pause menu.
    this.field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); this.close(true); }
      else if (e.key === 'Enter') { e.preventDefault(); this._run(); }
    });
    this.field.addEventListener('keyup', (e) => e.stopPropagation());
  }

  open() {
    this.isOpen = true; // set first so the pointer-lock release doesn't open the pause menu
    this.input.clearKeys();
    this.root.classList.remove('ui-hidden');
    this.field.value = '';
    this.out.textContent = '';
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.field.focus();
  }

  close(relock = false) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.add('ui-hidden');
    this.field.value = '';
    this.field.blur();
    this.input.clearKeys();
    if (relock) {
      try { this.canvas.requestPointerLock?.(); } catch { /* click the canvas instead */ }
    }
  }

  _run() {
    const text = this.field.value.trim().toLowerCase();
    this.field.value = '';
    if (!text) return;
    const cmd = Object.hasOwn(this.commands, text) ? this.commands[text] : null;
    this.out.textContent = cmd ? cmd.run() : `Unknown command: ${text} (type help)`;
  }
}
