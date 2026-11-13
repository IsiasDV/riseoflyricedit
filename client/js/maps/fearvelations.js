// Map definition: Fearvelations. Scaffolded ahead of its assets (see README go-live checklist);
// until `ready: false` is removed from its MAP_DATA entry a match cannot be started on it.
// Optional hooks the engine already supports on a definition: intro (cutscene) + minLoadingMs, bgmInGame,
// greeting, taunts, secret (see choco-rocklate-gladiator-arena.js for a full example).
import * as THREE from '../../vendor/three.module.min.js';
import { gatedWorld, trianglesFromMeshes } from '../game/collision-world.js';
import { createPickupSpawns, GOLD_STYLE, BLUE_STYLE } from './pickup-spawns.js';
import { MAP_DATA } from './map-data.js';
import { createMapProps } from './map-props.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';

const ID = 'fearvelations';
const D = MAP_DATA[ID];
const { model: MODEL, noCollide: NO_COLLIDE, scale: MODEL_SCALE } = D;
const GUN_MODEL = 'assets/general/Gun.glb';
const AMMO_MODEL = 'assets/general/Bullet.glb';
// World-space pickup positions [x, floor y, z]. Derived from MAP_DATA.
export const GUN_SPAWNS = D.gunSpawns;
export const AMMO_SPAWNS = D.ammoSpawns;
const SKY = 0x1d1a2e;

export const fearvelations = {
  id: ID,
  name: 'Fearvelations',
  description: 'Past the strongholds of past and future, time and space, Void must confront his past. Perhaps with allies, he will be able to advance forward in his will. Perhaps it is the Alternative Canon that must be figured out, perhaps the behs are simply figments. Perhaps, Fearvelations is the Journey into Imagination.',
  ready: D.ready !== false,
  banner: 'assets/map/fearvelations/banner/banner.jpg',
  loadingBackground: 'assets/map/fearvelations/loading/loading.jpg',
  loadingAudio: 'assets/map/fearvelations/loading/loading.opus',

  assets: {
    images: ['assets/map/fearvelations/loading/loading.jpg'],
    models: [MODEL, GUN_MODEL, AMMO_MODEL]
  },

  createLevel(loaded) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 40, 260);
    scene.add(new THREE.HemisphereLight(0xdde6ff, 0x20242f, 0.9));
    const sun = new THREE.DirectionalLight(0xfff0e0, 1.0);
    sun.position.set(40, 80, 25);
    scene.add(sun);

    let collision = null;
    const mp = createMapProps({ data: D, mapId: ID, getCollision: () => collision });
    for (const p of mp.props) scene.add(p.group);

    const guns = createPickupSpawns(loaded?.models?.[GUN_MODEL], GUN_SPAWNS, GOLD_STYLE);
    scene.add(guns.group);
    const ammo = createPickupSpawns(loaded?.models?.[AMMO_MODEL], AMMO_SPAWNS, BLUE_STYLE);
    scene.add(ammo.group);

    const [sx, sy, sz] = D.spawn;
    const spawn = { x: sx, y: sy, z: sz, yaw: 0 };
    let killY = -100;
    let mixer = null;
    const src = loaded?.models?.[MODEL];
    const model = src ? cloneSkinned(src) : null;
    if (model) {
      model.scale.setScalar(MODEL_SCALE);
      scene.add(model);
      scene.updateMatrixWorld(true);
      const meshes = [];
      model.traverse((o) => {
        if (o.isSkinnedMesh) o.frustumCulled = false;
        if (o.isMesh && !o.isSkinnedMesh && !NO_COLLIDE.includes(o.name)) meshes.push({ geometry: o.geometry, matrixWorld: o.matrixWorld });
      });
      collision = gatedWorld(trianglesFromMeshes(meshes), D.barrier);
      killY = collision.bounds.minY - 30;
      if (src.animations?.length) {
        mixer = new THREE.AnimationMixer(model);
        for (const c of src.animations) mixer.clipAction(c).play();
      }
    } else {
      console.warn(`[map] ${MODEL} did not load; using placeholder ground`);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x35303f }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
    }

    return {
      scene,
      groundY: 0,
      collision,
      gunSpawns: guns.spawns,
      ammoSpawns: ammo.spawns,
      killY,
      spawn,
      interactables: mp.interactables,
      state: mp.state,
      setBarrierOpen: mp.setBarrierOpen,
      setLinked: mp.setLinked,
      update(dt) {
        for (const p of mp.props) p.update(dt);
        mixer?.update(dt);
        guns.update(dt); ammo.update(dt);
      },
      dispose() {
        mixer?.stopAllAction();
        for (const p of mp.props) p.dispose();
        guns.dispose();
        ammo.dispose();
        scene.traverse((o) => {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) {
            if (!m) continue;
            for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
            m.dispose();
          }
        });
      }
    };
  }
};
