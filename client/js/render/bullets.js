// Draws ProjectileSystem bullets with the Bullet.glb model inside the level scene.
// Bullets may carry a `color` (0xRRGGBB): those are tinted and get an additive halo so they radiate.
import * as THREE from '../../vendor/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0); // Bullet.glb long axis
const LENGTH = 0.3;
const _dir = new THREE.Vector3();

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class BulletRenderer {
  constructor(scene, model) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.meshes = [];
    this.template = null;
    this.colored = new Map(); // color -> tinted template (materials shared by every clone)
    this.halo = null;
    if (model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const inner = model.clone(true);
      inner.position.sub(center);
      const wrap = new THREE.Group();
      wrap.scale.setScalar(LENGTH / Math.max(size.x, size.y, size.z, 1e-6));
      wrap.add(inner);
      this.template = wrap;
    }
  }

  _plain() {
    return this.template ? this.template.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
  }

  _tinted(color) {
    let t = this.colored.get(color);
    if (!t) {
      const col = new THREE.Color(color);
      t = this._plain();
      const mats = new Map();
      t.traverse((o) => {
        if (!o.isMesh) return;
        if (!mats.has(o.material)) {
          const m = o.material.clone();
          if (m.emissive) { m.emissive.copy(col); m.emissiveIntensity = 1.6; }
          if (m.color) m.color.lerp(col, 0.6);
          mats.set(o.material, m);
        }
        o.material = mats.get(o.material);
      });
      this.halo ||= haloTexture();
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.halo, color: col, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false
      }));
      halo.scale.setScalar(0.55);
      const holder = new THREE.Group();
      holder.add(t, halo);
      t = holder;
      this.colored.set(color, t);
    }
    return t.clone(true);
  }

  _setSkin(slot, color) {
    if (slot.userData.color === color) return;
    slot.userData.color = color;
    slot.clear();
    slot.add(color == null ? this._plain() : this._tinted(color));
  }

  sync(list) {
    while (this.meshes.length < list.length) {
      const slot = new THREE.Group();
      slot.userData.color = undefined;
      this.group.add(slot);
      this.meshes.push(slot);
    }
    this.meshes.forEach((m, i) => {
      const b = list[i];
      m.visible = !!b;
      if (!b) return;
      this._setSkin(m, b.color ?? null);
      m.position.set(b.x, b.y, b.z);
      m.quaternion.setFromUnitVectors(UP, _dir.set(b.dx, b.dy, b.dz));
    });
  }

  dispose() { this.scene.remove(this.group); this.meshes = []; }
}
