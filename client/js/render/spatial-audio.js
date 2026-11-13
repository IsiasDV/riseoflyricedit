import { gameVolume } from '../state/settings.js';

// Positional (3D) one-shot sounds via WebAudio. Sound bytes come from the
// preloaded `sounds` assets and are decoded on first use.
export class SpatialAudio {
  constructor() {
    this.ctx = null;
    this.bytes = {};      // url -> ArrayBuffer
    this.buffers = new Map(); // url -> Promise<AudioBuffer|null>
  }

  setSounds(sounds = {}) { this.bytes = sounds; this.buffers.clear(); }

  // Call from a user gesture / match start so the context can run.
  resume() {
    try {
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { /* no WebAudio */ }
  }

  _buffer(url) {
    if (!this.buffers.has(url)) {
      const raw = this.bytes[url];
      const p = raw && this.ctx
        ? this.ctx.decodeAudioData(raw.slice(0)).catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(url, p);
    }
    return this.buffers.get(url);
  }

  async playAt(url, x, y, z, volume = 1) {
    this.resume();
    if (!this.ctx) return;
    const buf = await this._buffer(url);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const pan = this.ctx.createPanner();
    pan.panningModel = 'HRTF';
    pan.distanceModel = 'inverse';
    pan.refDistance = 4;
    pan.maxDistance = 150;
    pan.rolloffFactor = 1.2;
    pan.positionX.value = x; pan.positionY.value = y; pan.positionZ.value = z;
    const gain = this.ctx.createGain();
    gain.gain.value = volume * gameVolume();
    src.connect(pan).connect(gain).connect(this.ctx.destination);
    src.start();
  }

  // Keep the listener on the camera (THREE.Camera).
  updateListener(camera) {
    const l = this.ctx?.listener;
    if (!l || !l.positionX) return;
    const e = camera.matrixWorld.elements;
    const p = camera.position;
    l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
    l.forwardX.value = -e[8]; l.forwardY.value = -e[9]; l.forwardZ.value = -e[10];
    l.upX.value = e[4]; l.upY.value = e[5]; l.upZ.value = e[6];
  }
}
