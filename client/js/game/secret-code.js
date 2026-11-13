// Konami-style code detector. Pure logic (no DOM) so it can be unit-tested.
export const KEY_CODE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight'
];
// Standard-mapping gamepad: D-pad 12 up / 13 down / 14 left / 15 right,
// B 1, A 0, Start 9, Select 8.
export const PAD_CODE = [12, 12, 13, 13, 14, 14, 15, 15, 1, 0, 9, 8];

export class CodeDetector {
  constructor(sequence, { timeoutMs = 3000, now = () => performance.now() } = {}) {
    this.seq = sequence;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.progress = 0;
    this._last = 0;
  }

  // The next expected input, or undefined if idle/complete.
  expects() { return this.progress > 0 ? this.seq[this.progress] : undefined; }

  reset() { this.progress = 0; }

  // Returns true when `input` completes the sequence.
  feed(input) {
    const t = this.now();
    if (this.progress > 0 && t - this._last > this.timeoutMs) this.progress = 0;
    this._last = t;
    if (input === this.seq[this.progress]) this.progress++;
    else this.progress = input === this.seq[0] ? 1 : 0;
    if (this.progress === this.seq.length) { this.progress = 0; return true; }
    return false;
  }
}
