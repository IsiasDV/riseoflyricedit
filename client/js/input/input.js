// Keyboard, mouse (pointer lock) and gamepad input tracking. Records raw state
// plus per-frame press edges; movement/gameplay rules live elsewhere.
const DEADZONE = 0.15;

// Radial deadzone, rescaled so output still spans 0..1.
function stick(x, y) {
  const mag = Math.hypot(x, y);
  if (mag < DEADZONE) return { x: 0, y: 0 };
  const scale = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
  return { x: x * scale, y: y * scale };
}

export class InputManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mousePressed = new Set(); // mouse buttons pressed (while locked) since last endFrame()
    this.mouseHeld = new Set();    // mouse buttons currently held (pressed while locked)
    this.pressed = new Set();      // key codes pressed since last endFrame()
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.pointerLocked = false;
    this._padPrev = {};            // button index -> was down last poll
    this.pad = this._emptyPad();

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Avoid stuck keys when the window loses focus.
    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('mousedown', (e) => {
      if (this.pointerLocked) { this.mousePressed.add(e.button); this.mouseHeld.add(e.button); }
    });
    window.addEventListener('mouseup', (e) => this.mouseHeld.delete(e.button));
    window.addEventListener('blur', () => this.mouseHeld.clear());

    canvas.addEventListener('click', () => canvas.requestPointerLock?.());

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDeltaX += e.movementX;
        this.mouseDeltaY += e.movementY;
      }
    });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  isMouseDown(button = 0) {
    return this.mouseHeld.has(button);
  }

  wasMousePressed(button = 0) {
    return this.mousePressed.has(button);
  }

  // True once for each fresh key press (not auto-repeat) until endFrame().
  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Call once per frame to read and clear accumulated mouse movement.
  consumeMouseDelta() {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  // Standard-mapping gamepad: sticks, plus held/edge button state.
  // pad.down[i] = held, pad.edge[i] = pressed since last poll.
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find(Boolean);
    this.gamepad = gp || null;
    if (!gp) {
      this._padPrev = {};
      this.pad = this._emptyPad();
      return this.pad;
    }
    const down = {};
    const edge = {};
    gp.buttons.forEach((b, i) => {
      down[i] = !!b.pressed;
      edge[i] = down[i] && !this._padPrev[i];
      this._padPrev[i] = down[i];
    });
    this.pad = {
      connected: true,
      move: stick(gp.axes[0] || 0, gp.axes[1] || 0),
      look: stick(gp.axes[2] || 0, gp.axes[3] || 0),
      down,
      edge
    };
    return this.pad;
  }

  _emptyPad() {
    return { connected: false, move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, down: {}, edge: {} };
  }

  clearKeys() {
    this.keys.clear();
    this.pressed.clear();
  }

  // Call at the end of each frame.
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
  }
}
