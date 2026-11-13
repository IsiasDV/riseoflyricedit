// Controller rumble via the Gamepad vibration actuator (no-op without a pad or when the setting is OFF).
import { settings, VIBRATION_SCALE } from '../state/settings.js';

const MIN_GAP_MS = 25;

export class Haptics {
  // getPad: () => Gamepad | null.  scale: () => 0..1 (defaults to the CONTROLLER VIBRATION setting).
  constructor(getPad, scale = () => VIBRATION_SCALE[settings.get('vibration')] ?? 0) {
    this.getPad = getPad;
    this.scale = scale;
    this._last = 0;
  }

  // weak / strong: 0..1 motor strengths, ms: duration. force skips the throttle (big events).
  pulse({ weak = 0, strong = 0, ms = 60 }, force = false) {
    const k = this.scale();
    if (!(k > 0)) return false;
    const now = performance.now();
    if (!force && now - this._last < MIN_GAP_MS) return false;
    const gp = this.getPad?.();
    const act = gp?.vibrationActuator;
    try {
      if (act?.playEffect) {
        act.playEffect('dual-rumble', { startDelay: 0, duration: ms, weakMagnitude: Math.min(1, weak * k), strongMagnitude: Math.min(1, strong * k) });
      } else if (gp?.hapticActuators?.[0]?.pulse) {
        gp.hapticActuators[0].pulse(Math.min(1, Math.max(weak, strong) * k), ms);
      } else return false;
    } catch { return false; }
    this._last = now;
    return true;
  }

  // Named effects used by gameplay.
  step() { this.pulse({ weak: 0.18, strong: 0, ms: 35 }); }
  jump() { this.pulse({ weak: 0.2, strong: 0.25, ms: 70 }); }
  land(speed) { const t = Math.min(1, speed / 14); this.pulse({ weak: 0.3 + 0.4 * t, strong: 0.25 + 0.75 * t, ms: 90 + 120 * t }, true); }
  swing() { this.pulse({ weak: 0.3, strong: 0.5, ms: 90 }); }
  shot() { this.pulse({ weak: 0.7, strong: 0.35, ms: 70 }); }
  knockback() { this.pulse({ weak: 0.6, strong: 1, ms: 260 }, true); }
  hurt() { this.pulse({ weak: 0.8, strong: 1, ms: 420 }, true); }
  revivePulse() { this.pulse({ weak: 0.25, strong: 0.15, ms: 60 }); }
  pickup() { this.pulse({ weak: 0.6, strong: 0.2, ms: 90 }, true); setTimeout(() => this.pulse({ weak: 0.6, strong: 0.2, ms: 90 }, true), 140); }
  nuke() { this.pulse({ weak: 1, strong: 1, ms: 800 }, true); }
}
