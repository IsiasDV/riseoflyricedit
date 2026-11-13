// Renders enemies from simulation snapshots: [{ id, x, y, z, yaw, state }].
// Each enemy is a skinned clone of the enemy model with its idle clip looping;
// state 'dying' plays the defeat clip once.
import * as THREE from '../../vendor/three.module.min.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';
import { createNameplate, disposeNameplate } from './nameplate.js';

export class EnemyRenderer {
  // label (optional): floating nameplate above each instance (e.g. the Lyric NPC).
  constructor(scene, def, modelScene, { label = null } = {}) {
    this.label = label;
    this.scene = scene;
    this.def = def;
    this.src = modelScene;
    this.kinds = { beh: { def, src: modelScene } };
    this.entries = new Map();
    this.outline = false;
    this.uniforms = { uPx: { value: 2.5 }, uViewport: { value: new THREE.Vector2(1, 1) } };
    this._mats = null;
  }

  // The Vulture: a white silhouette outline that shows through walls. A mask pass marks the whole
  // enemy in the stencil buffer, then a copy pushed outward by a constant pixel width is drawn
  // only where the stencil is not set, leaving just the ring.
  setOutline(on) {
    this.outline = on;
    for (const e of this.entries.values()) for (const m of e.outlineMeshes) m.visible = on;
  }

  _outlineMats() {
    if (this._mats) return this._mats;
    const mask = new THREE.MeshBasicMaterial({
      colorWrite: false, depthTest: false, depthWrite: false, transparent: true, fog: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp
    });
    const line = new THREE.MeshBasicMaterial({
      color: 0xffffff, toneMapped: false, fog: false, side: THREE.DoubleSide,
      depthTest: false, depthWrite: false, transparent: true,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp
    });
    const u = this.uniforms;
    line.onBeforeCompile = (sh) => {
      sh.uniforms.uPx = u.uPx;
      sh.uniforms.uViewport = u.uViewport;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'uniform float uPx;\nuniform vec2 uViewport;\nvoid main() {')
        .replace('#include <project_vertex>', `#include <project_vertex>
#if !defined( USE_ENVMAP ) && !defined( USE_SKINNING )
  vec3 objectNormal = normal;
#endif
  vec2 ofs = (projectionMatrix * vec4(normalize(normalMatrix * objectNormal), 0.0)).xy;
  if (length(ofs) > 1e-5) gl_Position.xy += normalize(ofs) * uPx * 2.0 / uViewport * gl_Position.w;`);
    };
    this._mats = { mask, line };
    return this._mats;
  }

  // Register another enemy kind (own model + definition), e.g. the Meh.
  addKind(kind, def, modelScene) { this.kinds[kind] = { def, src: modelScene }; }

  _make(s) {
    const k = this.kinds[s.kind] ?? this.kinds.beh;
    const def = k.def, src = k.src;
    const model = cloneSkinned(src);
    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    model.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(model, true);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    const inner = new THREE.Group();
    inner.add(model);
    inner.scale.setScalar(size.y > 0 ? def.height / size.y : 1);
    inner.rotation.y = def.yawOffset;
    const group = new THREE.Group();
    group.add(inner);
    group.position.set(s.x, s.y, s.z);
    group.rotation.y = s.yaw;
    this.scene.add(group);
    const outlineMeshes = [];
    const { mask, line } = this._outlineMats();
    const sources = [];
    model.traverse((o) => { if (o.isMesh) sources.push(o); });
    for (const o of sources) {
      [[mask, 998], [line, 999]].forEach(([mat, order]) => {
        const x = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
        if (o.isSkinnedMesh) x.bind(o.skeleton, o.bindMatrix);
        x.frustumCulled = false;
        x.renderOrder = order;
        x.visible = this.outline;
        o.parent.add(x);
        x.position.copy(o.position); x.quaternion.copy(o.quaternion); x.scale.copy(o.scale);
        outlineMeshes.push(x);
      });
    }
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const c of src.animations || []) actions[c.name] = mixer.clipAction(c);
    const idle = actions[def.anims.idle];
    if (idle) idle.play();
    let plate = null;
    if (this.label) {
      plate = createNameplate(this.label);
      plate.position.set(0, def.height + 0.5, 0);
      group.add(plate);
    }
    return { group, mixer, actions, target: s, dying: false, plate, outlineMeshes, def };
  }

  _die(e) {
    if (e.dying) return;
    e.dying = true;
    const die = e.actions[e.def.anims.die];
    if (!die) return;
    die.setLoop(THREE.LoopOnce, 1);
    die.clampWhenFinished = true;
    e.actions[e.def.anims.idle]?.fadeOut(0.1);
    die.reset().fadeIn(0.1).play();
  }

  // Immediate defeat (singleplayer / 'die' events) without waiting for a snapshot.
  kill(id) {
    const e = this.entries.get(id);
    if (e) this._die(e);
  }

  apply(list) {
    const seen = new Set();
    for (const s of list) {
      seen.add(s.id);
      let e = this.entries.get(s.id);
      if (!e) { e = this._make(s); this.entries.set(s.id, e); }
      e.target = s;
      if (s.state === 'dying') this._die(e);
    }
    for (const [id, e] of this.entries) if (!seen.has(id)) this._remove(id, e);
  }

  _remove(id, e) {
    this.scene.remove(e.group);
    if (e.plate) disposeNameplate(e.plate);
    e.mixer.stopAllAction();
    this.entries.delete(id);
  }

  update(dt) {
    if (this.outline) {
      const pr = Math.min(window.devicePixelRatio || 1, 2);
      this.uniforms.uViewport.value.set(window.innerWidth * pr, window.innerHeight * pr);
      this.uniforms.uPx.value = 2.5 * pr;
    }
    const k = 1 - Math.exp(-15 * dt);
    for (const e of this.entries.values()) {
      const t = e.target, g = e.group;
      g.position.x += (t.x - g.position.x) * k;
      g.position.y += (t.y - g.position.y) * k;
      g.position.z += (t.z - g.position.z) * k;
      let dy = (t.yaw - g.rotation.y) % (Math.PI * 2);
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      g.rotation.y += dy * k;
      e.mixer.update(dt);
    }
  }

  clear() {
    this._mats?.mask.dispose(); this._mats?.line.dispose(); this._mats = null;
    for (const [id, e] of [...this.entries]) this._remove(id, e);
  }
}
