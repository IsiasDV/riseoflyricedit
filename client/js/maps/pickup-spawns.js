// Spinning glowing-aura pickups (guns, ammo...) at fixed world positions.
// Aura = additive fresnel shell + halo sprite + drifting sparkles (no real lights).
import * as THREE from '../../vendor/three.module.min.js';

export const GOLD_STYLE = {
  color: [1.0, 0.78, 0.2], halo: 0xffc83c, spark: 0xffd966, glow: ['255,225,130', '255,190,60', '255,170,30'],
  size: 0.7, hover: 0.8, spinSpeed: 0.9
};
export const BLUE_STYLE = {
  color: [0.2, 0.62, 1.0], halo: 0x3aa0ff, spark: 0x8fd0ff, glow: ['150,215,255', '60,150,255', '30,110,255'],
  size: 0.5, hover: 0.7, spinSpeed: 0.9
};

function glowTexture(glow) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${glow[0]},1)`);
  grad.addColorStop(0.35, `rgba(${glow[1]},0.45)`);
  grad.addColorStop(1, `rgba(${glow[2]},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shellMaterial(rgb) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(...rgb) } },
    vertexShader: `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float pulse = 0.75 + 0.25 * sin(uTime * 2.5);
        gl_FragColor = vec4(uColor * (0.25 + rim * 1.6) * pulse, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    fog: false
  });
}

// positions: [[x, y, z], ...] where y is the floor height; the model hovers above it.
export function createPickupSpawns(model, positions, style = GOLD_STYLE, sparkles = 14) {
  const { size, hover, spinSpeed } = style;
  const group = new THREE.Group();
  const spawns = [];
  if (!model) return { group, spawns, update() {}, dispose() {} };

  // Normalise once: longest side = `size`, centred so it spins about its middle.
  const probe = model.clone(true);
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe);
  const dim = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size / Math.max(dim.x, dim.y, dim.z, 1e-6);

  const shellMat = shellMaterial(style.color);
  const glowTex = glowTexture(style.glow);
  const haloMat = new THREE.SpriteMaterial({
    map: glowTex, color: style.halo, transparent: true, opacity: 0.8,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  });
  const sparkMat = new THREE.PointsMaterial({
    map: glowTex, color: style.spark, size: 0.16, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true
  });

  let t = 0;
  for (const [x, y, z] of positions) {
    const root = new THREE.Group();
    root.position.set(x, y + hover, z);

    const spin = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(scale);
    const mesh = model.clone(true);
    mesh.position.copy(center).multiplyScalar(-1);
    inner.add(mesh);
    const shell = model.clone(true);
    shell.position.copy(center).multiplyScalar(-1);
    shell.traverse((o) => { if (o.isMesh) o.material = shellMat; });
    const shellWrap = new THREE.Group();
    shellWrap.scale.setScalar(1.1);
    shellWrap.add(shell);
    inner.add(shellWrap);
    spin.add(inner);
    root.add(spin);

    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(2.4);
    root.add(halo);

    // Sparkles drifting up around the gun.
    const seeds = Array.from({ length: sparkles }, () => ({
      a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.5,
      p: Math.random(), s: 0.25 + Math.random() * 0.35
    }));
    const pos = new Float32Array(sparkles * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const points = new THREE.Points(geo, sparkMat);
    points.frustumCulled = false;
    root.add(points);

    group.add(root);
    spawns.push({
      position: new THREE.Vector3(x, y, z),
      hover,
      mesh: root, spin, seeds, pos, geo,
      active: true,
      setActive(on) { this.active = on; root.visible = on; }
    });
  }

  return {
    group,
    spawns,
    update(dt) {
      t += dt;
      shellMat.uniforms.uTime.value = t;
      haloMat.opacity = 0.65 + 0.2 * Math.sin(t * 2.5);
      for (const s of spawns) {
        if (!s.active) continue;
        s.spin.rotation.y += spinSpeed * dt;
        s.seeds.forEach((d, i) => {
          d.p = (d.p + d.s * dt) % 1;
          s.pos[i * 3] = Math.cos(d.a + t * 0.6) * d.r;
          s.pos[i * 3 + 1] = -0.3 + d.p * 1.3;
          s.pos[i * 3 + 2] = Math.sin(d.a + t * 0.6) * d.r;
        });
        s.geo.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      shellMat.dispose(); haloMat.dispose(); sparkMat.dispose(); glowTex.dispose();
      spawns.forEach((s) => s.geo.dispose());
    }
  };
}
