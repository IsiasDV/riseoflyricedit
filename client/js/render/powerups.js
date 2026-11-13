// Glowing powerup orbs dropped by enemies. Each orb spins/bobs, has a colored halo, and flickers
// faster and faster during its last FLICKER_FROM seconds until it despawns.
import * as THREE from '../../vendor/three.module.min.js';
import { POWERUPS, FLICKER_FROM } from '../game/powerups.js';

function haloTexture(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rgb = `${(color >> 16) & 255},${(color >> 8) & 255},${color & 255}`;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.45)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class PowerupRenderer {
  constructor(scene) {
    this.scene = scene;
    this.orbs = new Map(); // id -> { root, ttl, t, mats, tex, geo }
  }

  add(d) {
    if (this.orbs.has(d.id)) return;
    const color = POWERUPS[d.kind]?.color ?? 0xffffff;
    const root = new THREE.Group();
    root.position.set(d.x, d.y + 0.9, d.z);
    const geo = new THREE.IcosahedronGeometry(0.3, 1);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color }));
    const shell = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    shell.scale.setScalar(1.5);
    const tex = haloTexture(color);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    halo.scale.setScalar(2.2);
    root.add(core, shell, halo);
    this.scene.add(root);
    this.orbs.set(d.id, { root, core, shell, ttl: d.ttl, t: Math.random() * 6, mats: [core.material, shell.material, halo.material], tex, geo, baseY: root.position.y });
  }

  remove(id) {
    const o = this.orbs.get(id);
    if (!o) return;
    this.scene.remove(o.root);
    o.mats.forEach((m) => m.dispose());
    o.tex.dispose();
    o.geo.dispose();
    this.orbs.delete(id);
  }

  update(dt) {
    for (const o of this.orbs.values()) {
      o.ttl -= dt; o.t += dt;
      o.core.rotation.y += dt * 2;
      o.shell.rotation.y -= dt * 1.3;
      o.root.position.y = o.baseY + Math.sin(o.t * 2.2) * 0.12;
      if (o.ttl < FLICKER_FROM) {
        const k = 1 - Math.max(0, o.ttl) / FLICKER_FROM;      // 0 -> 1 as it nears despawn
        const hz = 2 + k * 10;                                // 2 Hz -> 12 Hz
        o.flick = (o.flick ?? 0) + dt * hz;
        o.root.visible = Math.floor(o.flick * 2) % 2 === 0;
      }
    }
  }

  clear() { for (const id of [...this.orbs.keys()]) this.remove(id); }
}
