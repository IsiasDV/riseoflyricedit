// First-person weapon viewmodel: its own scene + camera, drawn after the world
// with the depth buffer cleared so it never clips into geometry. The model is
// auto-fitted (orientation/size/anchor) so no hand-tuned numbers are required.
import * as THREE from '../../vendor/three.module.min.js';
import { clone } from '../../vendor/SkeletonUtils.js';
import { WEAPONS } from '../game/weapons.js';

const HOLD_DIST = 0.6;
const STATIC_DIR = new THREE.Vector3(-0.12, 0.02, -1).normalize(); // static weapon forward in view space
const TARGET_DIR = new THREE.Vector3(-0.35, 0.3, -1).normalize(); // root -> tip, into the screen

export class Viewmodel {
  constructor(mainCamera) {
    this.mainCamera = mainCamera;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, mainCamera.aspect, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdde4ff, 0x404060, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, 1, 1);
    this.scene.add(key);
    this.visible = false;
    this.group = null;
    this.mixer = null;
    this.actions = {};
    this._box = null;
    this._offset = [0, 0, 0];
    this._aspect = 0;
    this._bob = [0, 0];
    this._anchorPos = null;
  }

  setWeapon(id, assets) {
    this._clear();
    const def = WEAPONS[id];
    const src = def && assets?.models?.[def.model];
    if (!src) return;
    const obj = clone(src);
    obj.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.mixer = new THREE.AnimationMixer(obj);
    for (const clip of src.animations || []) this.actions[clip.name] = this.mixer.clipAction(clip);
    this.group = new THREE.Group();
    this.group.add(obj);
    this.scene.add(this.group);
    this._offset = def.viewmodel.offset || [0, 0, 0];
    this.play(def.viewmodel.anims?.idle);
    this.mixer.update(0);
    this._fit(obj, def.viewmodel.length || 0.55, def.viewmodel);
  }

  play(name, loop = true) {
    const a = this.actions[name];
    if (!a) return;
    for (const o of Object.values(this.actions)) if (o !== a) o.stop();
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.play();
  }

  // Play a clip once (crossfading in), then return to the idle loop.
  playOnce(name, idle) {
    const a = this.actions[name];
    if (!a || !this.mixer) return;
    const idleAction = this.actions[idle];
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    if (idleAction) a.crossFadeFrom(idleAction, 0.05, false);
    const mixer = this.mixer;
    const done = (e) => {
      if (e.action !== a) return;
      mixer.removeEventListener('finished', done);
      if (idleAction && this.mixer === mixer) {
        idleAction.reset();
        idleAction.play();
        idleAction.crossFadeFrom(a, 0.08, false);
      }
    };
    mixer.addEventListener('finished', done);
  }

  // Orient the root->tip axis into the screen, scale to `length`, cache the box.
  _fit(obj, length, vm) {
    const g = this.group;
    g.updateMatrixWorld(true);
    const isStatic = vm?.kind === 'static';
    let dir;
    if (isStatic) {
      dir = new THREE.Vector3(...(vm.forward || [0, 0, 1])).normalize();
    } else {
      let skinned = null;
      obj.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
      const box = new THREE.Box3().expandByObject(obj, true);
      const root = new THREE.Vector3();
      skinned?.skeleton?.bones[0]?.getWorldPosition(root);
      // Tip = box corner farthest from the root bone.
      let tip = null, best = -1;
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
        const d = c.distanceToSquared(root);
        if (d > best) { best = d; tip = c; }
      }
      dir = tip.sub(root).normalize();
    }
    g.quaternion.setFromUnitVectors(dir, isStatic ? STATIC_DIR : TARGET_DIR);
    g.updateMatrixWorld(true);
    const b2 = new THREE.Box3().expandByObject(obj, true);
    const size = b2.getSize(new THREE.Vector3());
    g.scale.setScalar(length / Math.max(size.x, size.y, size.z, 1e-6));
    g.updateMatrixWorld(true);
    this._box = new THREE.Box3().expandByObject(obj, true); // world box with the group at the origin
    this._aspect = 0; // force re-anchor
  }

  _anchor() {
    const cam = this.camera;
    cam.aspect = this.mainCamera.aspect;
    cam.updateProjectionMatrix();
    this._aspect = cam.aspect;
    const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * HOLD_DIST;
    const halfW = halfH * cam.aspect;
    const b = this._box, o = this._offset;
    const c = b.getCenter(new THREE.Vector3());
    this._anchorPos = [
      halfW * 0.9 - b.max.x + o[0],
      -halfH * 0.9 - b.min.y + o[1],
      -HOLD_DIST - c.z + o[2]
    ];
    this._placeGroup();
  }

  // Walking bob offsets (view-space metres at the hold distance).
  setBob(x, y) { this._bob = [x, y]; this._placeGroup(); }

  _placeGroup() {
    const a = this._anchorPos;
    if (!a || !this.group) return;
    this.group.position.set(a[0] + this._bob[0], a[1] + this._bob[1], a[2]);
  }

  update(dt) {
    if (!this.group) return;
    this.mixer.update(dt);
    if (this._aspect !== this.mainCamera.aspect) this._anchor();
  }

  render(renderer) {
    if (!this.visible || !this.group) return;
    const prev = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prev;
  }

  _clear() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => { o.geometry?.dispose?.(); });
    }
    this.mixer?.stopAllAction();
    this.group = this.mixer = this._box = null;
    this.actions = {};
  }

  dispose() { this._clear(); this.visible = false; }
}
