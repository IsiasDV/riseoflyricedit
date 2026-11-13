// Procedural Ungaland props: the teleporter pad and the bullet-color machine, plus the machine's color picker.
import * as THREE from '../../vendor/three.module.min.js';

export const FIRST_BULLET_COLOR = 0x3aa0ff;

// First use gives blue; every later use a random, fully saturated color that differs from the last one.
export function nextBulletColor(prev, rng = Math.random) {
  if (prev == null) return FIRST_BULLET_COLOR;
  const prevHue = new THREE.Color(prev).getHSL({}).h;
  let h;
  do { h = rng(); } while (Math.abs(h - prevHue) < 0.08 || 1 - Math.abs(h - prevHue) < 0.08);
  return new THREE.Color().setHSL(h, 1, 0.55).getHex();
}

export const colorName = (hex) => `#${hex.toString(16).padStart(6, '0').toUpperCase()}`;

function glow(color, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  return s;
}

const add = (color) => new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (m) { m.map?.dispose?.(); m.dispose(); }
  });
}

// at: [x, floorY, z]
export function createTeleporter(at, { color = 0x6fd2ff } = {}) {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 48), add(color));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.9, 48), add(0x1c5fa8));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; disc.material.opacity = 0.5;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 32, 1, true), add(0x8fdcff));
  beam.position.y = 1.6; beam.material.opacity = 0.18;
  const halo = glow(color, 3); halo.position.y = 1.2;
  group.add(disc, ring, beam, halo);
  let t = 0, k = 1, kT = 1;
  return {
    group,
    setLinked(on) { kT = on ? 1 : 0.2; },
    update(dt) {
      t += dt;
      k += (kT - k) * Math.min(1, dt * 4);
      disc.material.opacity = 0.5 * k;
      halo.material.opacity = k;
      ring.rotation.z = t * 0.8;
      ring.material.opacity = (0.6 + 0.4 * Math.sin(t * 3)) * k;
      beam.material.opacity = (0.14 + 0.07 * Math.sin(t * 2.2)) * k;
      beam.rotation.y = t * 0.5;
    },
    dispose() { disposeGroup(group); }
  };
}

export function createColorMachine(at) {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.3, 0.7), new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6, metalness: 0.5 }));
  body.position.y = 0.65;
  const panelMat = new THREE.MeshBasicMaterial({ color: FIRST_BULLET_COLOR, fog: false, side: THREE.DoubleSide });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), panelMat);
  panel.position.set(0, 0.95, 0.36);
  const halo = glow(FIRST_BULLET_COLOR, 1.8); halo.position.set(0, 0.95, 0.5);
  group.add(body, panel, halo);
  let t = 0;
  return {
    group,
    setColor(hex) { panelMat.color.setHex(hex); halo.material.color.setHex(hex); },
    update(dt) { t += dt; halo.material.opacity = 0.7 + 0.3 * Math.sin(t * 2.5); },
    dispose() { disposeGroup(group); }
  };
}

// Powerup machine: slot-machine box with three reels that flash through colors while spinning.
export function createPowerupMachine(at) {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a1f35, roughness: 0.5, metalness: 0.6 }));
  body.position.y = 0.95;
  const reels = [0, 1, 2].map((i) => {
    const mat = new THREE.MeshBasicMaterial({ color: 0xc84cff, fog: false, side: THREE.DoubleSide });
    const r = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), mat);
    r.position.set(-0.36 + i * 0.36, 1.35, 0.41);
    const back = r.clone(); back.position.z = -0.41;
    group.add(r, back);
    return mat;
  });
  const halo = glow(0xc84cff, 2.6); halo.position.set(0, 1.35, 0);
  group.add(body, halo);
  const hues = [0xff4a3a, 0xffd23a, 0x3a8cff, 0xc84cff, 0x4cff7a];
  let t = 0, spinLeft = 0;
  return {
    group,
    spin() { spinLeft = 1.4; },
    update(dt) {
      t += dt;
      if (spinLeft > 0) {
        spinLeft -= dt;
        reels.forEach((m, i) => m.color.setHex(hues[Math.floor(t * (14 + i * 4) + i) % hues.length]));
        halo.material.color.setHex(hues[Math.floor(t * 10) % hues.length]);
        halo.material.opacity = 1;
      } else {
        reels.forEach((m) => m.color.setHex(0xc84cff));
        halo.material.color.setHex(0xc84cff);
        halo.material.opacity = 0.65 + 0.35 * Math.sin(t * 2);
      }
    },
    dispose() { disposeGroup(group); }
  };
}

// Unlockable energy wall filling the box [min, max]; open() fades it out.
export function createBarrier(min, max) {
  const group = new THREE.Group();
  group.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const wall = new THREE.Mesh(new THREE.BoxGeometry(...size), add(0xff6a3a));
  wall.material.opacity = 0.28;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(wall.geometry), new THREE.LineBasicMaterial({ color: 0xffb070, transparent: true, fog: false }));
  group.add(wall, edges);
  let t = 0, fade = 1, opening = false;
  return {
    group,
    get isOpen() { return opening; },
    open() { opening = true; },
    update(dt) {
      if (!group.visible) return;
      t += dt;
      if (opening) { fade = Math.max(0, fade - dt / 0.9); if (fade === 0) { group.visible = false; return; } }
      wall.material.opacity = (0.22 + 0.1 * Math.sin(t * 2.4)) * fade;
      edges.material.opacity = (0.7 + 0.3 * Math.sin(t * 3.1)) * fade;
    },
    dispose() { disposeGroup(group); }
  };
}
