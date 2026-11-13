// Lightweight night sky: one shader dome (gradient, stars, moon, clouds) plus a few
// additive crossed-quad "moon ray" shafts. No post-processing, no shadow maps.
import * as THREE from '../../vendor/three.module.min.js';

export const HORIZON_HEX = 0x14183a; // also use for scene.background / fog

// Tileable smooth value noise (R channel), two octaves.
export function makeNoiseTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  const octave = (g, seed) => {
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const lat = Float32Array.from({ length: g * g }, rnd);
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = (x / size) * g, fy = (y / size) * g;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = sm(fx - x0), ty = sm(fy - y0);
      const at = (i, j) => lat[(j % g) * g + (i % g)];
      const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
      const b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      return a * (1 - ty) + b * ty;
    };
  };
  const o1 = octave(8, 12345), o2 = octave(16, 777), o3 = octave(32, 4242);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = (o1(x, y) * 0.55 + o2(x, y) * 0.3 + o3(x, y) * 0.15) * 255;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function makeShaftTexture() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const g = c.getContext('2d');
  const img = g.createImageData(32, 256);
  for (let y = 0; y < 256; y++) {
    const v = y / 255; // 0 = top (moon side), 1 = bottom (ground)
    const along = Math.pow(Math.sin(Math.min(1, v * 6) * Math.PI / 2), 1) * (1 - 0.55 * v);
    for (let x = 0; x < 32; x++) {
      const u = Math.abs(x / 31 - 0.5) * 2;
      const across = Math.pow(1 - u, 2);
      const a = Math.max(0, along * across) * 255;
      const i = (y * 32 + x) * 4;
      img.data[i] = 200; img.data[i + 1] = 215; img.data[i + 2] = 255; img.data[i + 3] = a;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec3 vDir;
uniform float uTime;
uniform vec3 uMoon;
uniform sampler2D uNoise;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zenith = vec3(0.012, 0.018, 0.06);
  vec3 horizon = vec3(0.078, 0.094, 0.227);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.75, h));
  if (h < 0.0) col = horizon * (1.0 + h * 0.5);

  float cm = dot(d, normalize(uMoon));

  // Clouds (two drifting noise layers projected on a flat deck).
  float cloud = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.22) * 0.55;
    float n = texture2D(uNoise, uv * 0.6 + vec2(uTime * 0.004, uTime * 0.002)).r * 0.6
            + texture2D(uNoise, uv * 1.3 + vec2(-uTime * 0.006, uTime * 0.003)).r * 0.4;
    cloud = smoothstep(0.5, 0.78, n) * smoothstep(0.0, 0.18, h);
  }

  // Stars.
  vec3 p = d * 70.0;
  vec3 ip = floor(p);
  vec3 fp = fract(p) - 0.5;
  float r = hash(ip);
  vec3 off = (vec3(hash(ip + 1.7), hash(ip + 5.3), hash(ip + 9.1)) - 0.5) * 0.55;
  float star = step(0.955, r) * smoothstep(0.16, 0.0, length(fp - off));
  star *= 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 60.0);
  star *= smoothstep(0.03, 0.3, h) * (1.0 - cloud) * (1.0 - smoothstep(0.985, 0.999, cm));
  col += vec3(0.85, 0.9, 1.0) * star * (0.5 + r);

  // Moon: halo, disc with faint maria.
  float halo = pow(max(cm, 0.0), 90.0) * 0.55 + pow(max(cm, 0.0), 12.0) * 0.12;
  col += vec3(0.45, 0.55, 0.9) * halo * (1.0 - cloud * 0.7);
  float disc = smoothstep(0.99935, 0.99955, cm);
  if (disc > 0.0) {
    vec3 m = normalize(uMoon);
    vec3 t = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(t, m);
    vec2 mu = vec2(dot(d, t), dot(d, b)) / 0.033;
    float maria = texture2D(uNoise, mu * 0.35 + 0.5).r;
    vec3 moonCol = vec3(0.93, 0.95, 1.0) * (0.78 + 0.22 * smoothstep(0.35, 0.65, maria));
    col = mix(col, moonCol, disc * (1.0 - cloud * 0.55));
  }

  // Clouds lit from the moon with silver edges.
  float lit = 0.18 + 0.82 * pow(max(cm, 0.0), 2.5);
  vec3 cloudCol = mix(vec3(0.035, 0.045, 0.10), vec3(0.55, 0.62, 0.85), lit);
  col = mix(col, cloudCol, cloud * 0.88);

  gl_FragColor = vec4(col, 1.0);
}`;

export function createNightSky({ moonDir, shafts = 12, spread = 70 }) {
  const dir = moonDir.clone().normalize();
  const group = new THREE.Group();
  const noise = makeNoiseTexture();

  const domeMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: { uTime: { value: 0 }, uMoon: { value: dir }, uNoise: { value: noise } },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), domeMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  group.add(dome);

  // Moon ray shafts: crossed quads along the moon direction, scattered over the map.
  const shaftTex = makeShaftTexture();
  const shaftMats = [];
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  let s = 99;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < shafts; i++) {
    const len = 45 + rnd() * 40, width = 3 + rnd() * 7;
    const mat = new THREE.MeshBasicMaterial({
      map: shaftTex, color: 0x9fb4ff, transparent: true, opacity: 0.1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
    });
    mat.userData = { base: 0.07 + rnd() * 0.08, phase: rnd() * 6.28, speed: 0.3 + rnd() * 0.5 };
    shaftMats.push(mat);
    const shaft = new THREE.Group();
    const geo = new THREE.PlaneGeometry(width, len);
    for (const rotY of [0, Math.PI / 2]) {
      const q = new THREE.Mesh(geo, mat);
      q.position.y = len / 2;
      q.rotation.y = rotY;
      shaft.add(q);
    }
    const a = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * spread;
    shaft.position.set(Math.cos(a) * rad, -2, Math.sin(a) * rad);
    shaft.quaternion.copy(quat);
    group.add(shaft);
  }

  let t = 0;
  return {
    group,
    update(dt, camera) {
      t += dt;
      domeMat.uniforms.uTime.value = t;
      if (camera) dome.position.copy(camera.position);
      for (const m of shaftMats) {
        const u = m.userData;
        m.opacity = u.base * (0.7 + 0.3 * Math.sin(t * u.speed + u.phase));
      }
    },
    dispose() {
      noise.dispose(); shaftTex.dispose(); domeMat.dispose(); dome.geometry.dispose();
      shaftMats.forEach((m) => m.dispose());
    }
  };
}
