// Sky dome that blends from a brisk cold white night (uBlend 0) to a blood moon with a swirling cloud
// vortex (uBlend 1): a single shader dome (one draw call, ~4 noise taps per pixel). Same shape as
// createNightSky: { group, update(dt, camera), setFlash(f), setBlend(b), dispose() }.
import * as THREE from '../../vendor/three.module.min.js';
import { makeNoiseTexture } from './night-sky.js';

export const BLOOD_HORIZON_HEX = 0x33080f; // final fog / scene.background colour
export const NIGHT_HORIZON_HEX = 0x1b2232; // starting (cold night) fog / background colour

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
uniform float uFlash;
uniform float uBlend;
uniform vec3 uMoon;
uniform vec3 uVortex;
uniform sampler2D uNoise;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
  float b = uBlend;
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 horizon = mix(vec3(0.20, 0.24, 0.36), vec3(0.20, 0.032, 0.058), b);
  vec3 zenith = mix(vec3(0.018, 0.028, 0.075), vec3(0.035, 0.004, 0.03), b);
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.8, h));
  if (h < 0.0) col = horizon * (1.0 + h * 0.6);

  // Stars: many and bright on the cold night, sparse and dim under the blood moon.
  vec3 p = d * 60.0;
  vec3 ip = floor(p);
  vec3 fp = fract(p) - 0.5;
  float r0 = hash(ip);
  float star = step(mix(0.95, 0.975, b), r0) * smoothstep(0.14, 0.0, length(fp));
  col += mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.7, 0.7), b) * star * mix(0.85, 0.35, b) * smoothstep(0.05, 0.4, h);

  // Swirling vortex: polar coordinates around uVortex; it gathers, widens and starts to spin as b grows.
  vec3 ax = normalize(uVortex);
  vec3 t = normalize(cross(ax, vec3(0.0, 0.0, 1.0)));
  vec3 bb = cross(ax, t);
  float ang = acos(clamp(dot(d, ax), -1.0, 1.0));
  float az = atan(dot(d, bb), dot(d, t)) / 6.2831853;
  float cloud = 0.0, lit = 0.0;
  float gather = smoothstep(0.0, 0.55, b);
  if (h > -0.08) {
    vec2 uv = vec2(az + 1.35 * b * log(ang + 0.05) - uTime * (0.002 + 0.01 * b), ang * 0.9 - uTime * 0.006);
    float n = texture2D(uNoise, uv * vec2(3.0, 1.4)).r * 0.6 + texture2D(uNoise, uv * vec2(7.0, 3.0) + 0.37).r * 0.4;
    float falloff = (1.0 - smoothstep(0.85, 1.55, ang)) * smoothstep(0.03, 0.2, ang);
    cloud = smoothstep(0.42, 0.74, n) * falloff * gather;
    lit = smoothstep(0.55, 0.9, n) * 0.6 + exp(-ang * 2.5) * 0.5;
    col += vec3(0.9, 0.12, 0.07) * exp(-ang * 11.0) * 0.55 * smoothstep(0.5, 1.0, b); // glowing eye
  }

  // Moon: small cold white disc -> large blood-red mottled disc.
  float cm = dot(d, normalize(uMoon));
  float halo = pow(max(cm, 0.0), 60.0) * mix(0.5, 0.75, b) + pow(max(cm, 0.0), 8.0) * 0.16;
  col += mix(vec3(0.45, 0.58, 0.95), vec3(0.85, 0.1, 0.05), smoothstep(0.1, 0.9, b)) * halo * (1.0 - cloud * 0.6);
  float thr = mix(0.9992, 0.9964, smoothstep(0.0, 0.9, b));
  float disc = smoothstep(thr, thr + 0.0005, cm);
  if (disc > 0.0) {
    vec3 m = normalize(uMoon);
    vec3 mt = normalize(cross(m, vec3(0.0, 1.0, 0.0)));
    vec3 mb = cross(mt, m);
    vec2 mu = vec2(dot(d, mt), dot(d, mb)) / mix(0.04, 0.085, b);
    float mottle = texture2D(uNoise, mu * 0.4 + 0.5).r;
    vec3 coldMoon = vec3(0.93, 0.96, 1.0) * (0.8 + 0.2 * smoothstep(0.35, 0.65, mottle));
    vec3 bloodMoon = vec3(0.78, 0.07, 0.04) * (0.62 + 0.55 * smoothstep(0.3, 0.7, mottle));
    col = mix(col, mix(coldMoon, bloodMoon, smoothstep(0.15, 0.85, b)), disc * (1.0 - cloud * 0.45));
  }

  vec3 coldCloud = mix(vec3(0.05, 0.06, 0.11), vec3(0.55, 0.62, 0.85), clamp(lit, 0.0, 1.0));
  vec3 redCloud = mix(vec3(0.045, 0.0, 0.02), vec3(0.62, 0.1, 0.08), clamp(lit + 0.25 * pow(max(cm, 0.0), 3.0), 0.0, 1.0));
  col = mix(col, mix(coldCloud, redCloud, smoothstep(0.2, 0.9, b)), cloud * 0.9);

  col += vec3(0.85, 0.7, 0.8) * uFlash * (0.12 + 0.3 * cloud);
  gl_FragColor = vec4(col, 1.0);
}`;

export function createBloodSky({ moonDir, vortexDir = new THREE.Vector3(0.12, 0.9, -0.25), blend = 1 }) {
  const group = new THREE.Group();
  const noise = makeNoiseTexture();
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      uTime: { value: 0 }, uFlash: { value: 0 }, uBlend: { value: blend }, uNoise: { value: noise },
      uMoon: { value: moonDir.clone().normalize() }, uVortex: { value: vortexDir.clone().normalize() }
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  group.add(dome);
  let t = 0;
  return {
    group,
    setFlash(f) { mat.uniforms.uFlash.value = f; },
    setBlend(b) { mat.uniforms.uBlend.value = b; },
    update(dt, camera) {
      t += dt;
      mat.uniforms.uTime.value = t;
      if (camera) dome.position.copy(camera.position);
    },
    dispose() { noise.dispose(); mat.dispose(); dome.geometry.dispose(); }
  };
}
