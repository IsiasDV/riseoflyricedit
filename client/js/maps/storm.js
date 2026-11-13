// Cheap rain + lightning: one GPU-animated line-segment mesh (single draw call) that follows
// the camera, and occasional soft lightning flashes (light/colour pulse + a thin distant bolt).
import * as THREE from '../../vendor/three.module.min.js';

export const RAIN_COUNT = 700;
export const RAIN_BOX = 36;          // rain volume edge length (m) around the camera
export const STRIKE_MIN_S = 9;
export const STRIKE_MAX_S = 22;
const FLASH_STRENGTH = 0.55;         // max colour lerp toward the flash colour
const FLASH_LIGHT = 1.4;             // extra light intensity at the peak of a flash

export const nextStrikeDelay = (rnd = Math.random) => STRIKE_MIN_S + rnd() * (STRIKE_MAX_S - STRIKE_MIN_S);

// Flash envelope 0..1 for time t (s) since the strike began: two quick pulses over ~0.3 s.
export function flashEnvelope(t) {
  if (t < 0 || t > 0.32) return 0;
  const pulse = (c, w) => Math.max(0, 1 - Math.abs(t - c) / w);
  return Math.min(1, pulse(0.04, 0.05) + 0.7 * pulse(0.2, 0.09));
}

const RAIN_VERT = `
uniform float uTime; uniform float uBox;
attribute float aSeed; attribute float aEnd;
varying float vA;
void main() {
  vec3 p = position;
  p.y = mod(position.y - uTime * (22.0 + aSeed * 6.0), uBox) - uBox * 0.5 + aEnd * 0.9;
  p.x += aEnd * 0.05;
  vA = 0.35 + 0.35 * aSeed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const RAIN_FRAG = `
varying float vA; uniform float uFlash;
void main() { gl_FragColor = vec4(mix(vec3(0.62, 0.7, 0.85), vec3(1.0), uFlash), vA * 0.45); }`;

export function createStorm({ scene, flashColor = 0xdde8ff, onFlash = null }) {
  const group = new THREE.Group();
  group.frustumCulled = false;

  // Rain: each streak is 2 vertices sharing a base position; aEnd offsets the tail in the shader.
  const pos = new Float32Array(RAIN_COUNT * 6);
  const seed = new Float32Array(RAIN_COUNT * 2);
  const end = new Float32Array(RAIN_COUNT * 2);
  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = (Math.random() - 0.5) * RAIN_BOX, y = Math.random() * RAIN_BOX, z = (Math.random() - 0.5) * RAIN_BOX;
    pos.set([x, y, z, x, y, z], i * 6);
    seed[i * 2] = seed[i * 2 + 1] = Math.random();
    end[i * 2 + 1] = 1;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  rainGeo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBox: { value: RAIN_BOX }, uFlash: { value: 0 } },
    vertexShader: RAIN_VERT,
    fragmentShader: RAIN_FRAG,
    transparent: true, depthWrite: false, fog: false
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);

  // Lightning bolt (regenerated per strike), far away on the horizon.
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
  const boltMat = new THREE.LineBasicMaterial({ color: flashColor, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const bolt = new THREE.Line(boltGeo, boltMat);
  bolt.frustumCulled = false;
  scene.add(bolt);
  scene.add(group);

  const flashLight = new THREE.AmbientLight(flashColor, 0);
  scene.add(flashLight);
  const baseBg = scene.background?.clone?.() ?? new THREE.Color(0);
  const baseFog = scene.fog?.color?.clone?.() ?? baseBg.clone();
  const flashCol = new THREE.Color(flashColor);

  let t = 0, untilStrike = nextStrikeDelay(), strikeT = -1;

  function newBolt(camera) {
    const a = Math.random() * Math.PI * 2, d = 160 + Math.random() * 60;
    const cx = camera.position.x + Math.cos(a) * d, cz = camera.position.z + Math.sin(a) * d;
    const arr = boltGeo.attributes.position.array;
    let x = cx, y = camera.position.y + 120, z = cz;
    for (let i = 0; i < 22; i++) {
      arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      x += (Math.random() - 0.5) * 9; z += (Math.random() - 0.5) * 9; y -= 120 / 21 * 1.4;
    }
    boltGeo.attributes.position.needsUpdate = true;
  }

  return {
    group,
    strike() { if (strikeT < 0) untilStrike = 0; },
    setBase(hex) { baseBg.set(hex); baseFog.set(hex); },
    update(dt, camera) {
      t += dt;
      if (camera) group.position.copy(camera.position);
      rainMat.uniforms.uTime.value = t;
      untilStrike -= dt;
      if (untilStrike <= 0 && strikeT < 0) { strikeT = 0; if (camera) newBolt(camera); }
      let f = 0;
      if (strikeT >= 0) {
        strikeT += dt;
        f = flashEnvelope(strikeT);
        if (strikeT > 0.32) { strikeT = -1; untilStrike = nextStrikeDelay(); f = 0; }
      }
      rainMat.uniforms.uFlash.value = f;
      onFlash?.(f);
      boltMat.opacity = f * 0.9;
      flashLight.intensity = f * FLASH_LIGHT;
      if (scene.background?.isColor) scene.background.copy(baseBg).lerp(flashCol, f * FLASH_STRENGTH);
      if (scene.fog) scene.fog.color.copy(baseFog).lerp(flashCol, f * FLASH_STRENGTH);
    },
    dispose() {
      rainGeo.dispose(); rainMat.dispose(); boltGeo.dispose(); boltMat.dispose();
      scene.remove(bolt, group, flashLight);
    }
  };
}
