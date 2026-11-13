// Animated abstract gradient/blob background drawn on a 2D canvas.
// Used by the title menu and the lobby. Skips drawing while its canvas is hidden.
import { settings } from '../state/settings.js';

export class AbstractBackground {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.blobs = Array.from({ length: 9 }, (_, i) => ({
      x: Math.random(), y: Math.random(), r: 0.25 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 0.02, vy: (Math.random() - 0.5) * 0.02,
      hue: 200 + i * 20 + Math.random() * 20
    }));
    window.addEventListener('resize', () => this._resize());
    this._resize();
    requestAnimationFrame((n) => this._render(n));
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.5; // blurry gradients need little resolution
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  _render(now) {
    requestAnimationFrame((n) => this._render(n));
    if (this.canvas.getClientRects().length === 0) return; // not displayed: skip drawing
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;
    const t = now / 1000;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#06061a');
    grad.addColorStop(1, '#1a0630');
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const count = settings.get('fidelity') === 'LOW' ? 4 : this.blobs.length;
    for (let i = 0; i < count; i++) {
      const b = this.blobs[i];
      b.x += b.vx * 0.016; b.y += b.vy * 0.016;
      if (b.x < -0.1 || b.x > 1.1) b.vx *= -1;
      if (b.y < -0.1 || b.y > 1.1) b.vy *= -1;
      const cx = (b.x + Math.sin(t * 0.3 + i) * 0.05) * w;
      const cy = (b.y + Math.cos(t * 0.25 + i * 2) * 0.05) * h;
      const r = b.r * Math.max(w, h);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `hsla(${(b.hue + t * 6) % 360}, 90%, 55%, 0.35)`);
      g.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
