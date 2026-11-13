// Persistent user settings (graphical fidelity, field of view).
import { events } from '../core/events.js';

export const SETTING_DEFS = {
  fidelity: {
    label: 'GRAPHICAL FIDELITY',
    options: ['LOW', 'MEDIUM', 'HIGH']
  },
  fov: {
    label: 'FIELD OF VIEW',
    options: ['CLOSE-QUARTERS', 'NORMAL', 'QUAKE PRO']
  },
  cameraSensitivity: {
    label: 'CAMERA SENSITIVITY',
    options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  },
  vibration: {
    label: 'CONTROLLER VIBRATION',
    options: ['OFF', 'LOW', 'MEDIUM', 'HIGH']
  },
  motionBlur: {
    label: 'MOTION BLUR',
    options: ['OFF', 'ON']
  },
  classic: {
    label: 'CLASSIC',
    options: ['NO', 'YES']
  },
  volume: {
    label: 'IN-GAME VOLUME',
    options: ['0%', '10%', '20%', '30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%']
  }
};

// Look speed multiplier for mouse and right stick: 1 -> 0.2x, 5 -> 1x, 10 -> 2x.
export function lookScale() {
  return 0.2 * Number(settings.get('cameraSensitivity'));
}

export const VIBRATION_SCALE = { OFF: 0, LOW: 0.4, MEDIUM: 0.7, HIGH: 1 };

export const FOV_VALUES = { 'CLOSE-QUARTERS': 60, NORMAL: 75, 'QUAKE PRO': 110 };
export const PIXEL_RATIO_CAPS = { LOW: 0.75, MEDIUM: 1, HIGH: 2 };

const STORAGE_KEY = 'rol.settings';
const DEFAULTS = { fidelity: 'HIGH', fov: 'NORMAL', cameraSensitivity: '5', vibration: 'MEDIUM', motionBlur: 'OFF', classic: 'NO', volume: '100%' };

class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      for (const key of Object.keys(SETTING_DEFS)) {
        if (SETTING_DEFS[key].options.includes(saved[key])) this.values[key] = saved[key];
      }
    } catch (_) { /* ignore corrupt storage */ }
  }

  get(key) { return this.values[key]; }

  cycle(key, dir = 1) {
    const opts = SETTING_DEFS[key].options;
    const i = opts.indexOf(this.values[key]);
    this.set(key, opts[(i + dir + opts.length) % opts.length]);
  }

  set(key, value) {
    this.values[key] = value;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch (_) {}
    events.emit('settings:changed', { key, value, values: { ...this.values } });
  }
}

export const settings = new Settings();

// In-game (match) audio level 0..1.
export function gameVolume() {
  const v = parseInt(settings.get('volume'), 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) / 100 : 1;
}