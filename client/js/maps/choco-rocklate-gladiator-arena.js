// Map definition: Choco-rocklate Gladiator Arena. Scaffolded ahead of its assets (see README go-live checklist);
// until `ready: false` is removed from its MAP_DATA entry a match cannot be started on it.
import * as THREE from '../../vendor/three.module.min.js';
import { gatedWorld, trianglesFromMeshes } from '../game/collision-world.js';
import { createPickupSpawns, GOLD_STYLE, BLUE_STYLE } from './pickup-spawns.js';
import { MAP_DATA } from './map-data.js';
import { createMapProps } from './map-props.js';
import { createStorm } from './storm.js';
import { createBloodSky, BLOOD_HORIZON_HEX, NIGHT_HORIZON_HEX } from './blood-sky.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';

const ID = 'choco-rocklate-gladiator-arena';
const D = MAP_DATA[ID];
const { model: MODEL, noCollide: NO_COLLIDE, scale: MODEL_SCALE } = D;
const GUN_MODEL = 'assets/general/Gun.glb';
const AMMO_MODEL = 'assets/general/Bullet.glb';
// World-space pickup positions [x, floor y, z]. Derived from MAP_DATA.
export const GUN_SPAWNS = D.gunSpawns;
export const AMMO_SPAWNS = D.ammoSpawns;
export const SKY_MS = 45000; // cold white night -> blood moon vortex, starting when the match starts
export const skyBlendAt = (ms) => { const t = Math.max(0, Math.min(1, ms / SKY_MS)); return t * t * (3 - 2 * t); };
const MOON_DIR = new THREE.Vector3(0.62, 0.34, -0.72).normalize();
const FOG_NEAR = 90, FOG_FAR = 520; // light haze

export const chocoRocklateGladiatorArena = {
  id: ID,
  name: 'Choco-rocklate Gladiator Arena',
  description: "As the false prophecy foretold its founders that many eons ago there was a palace to a place called Choco-rocklate. Only you will find the truth of the Alternative Canon within its borders, but beware, there are Behs that aren't fair.",
  ready: D.ready !== false,
  banner: 'assets/map/choco/banner/banner.jpg',
  loadingBackground: 'assets/map/choco/loading/loading.jpg',
  loadingAudio: 'assets/map/choco/loading/loading.opus',
  // Cutscene before the loading screen (muted; loading.opus plays over it). See MapIntro.
  intro: { video: 'assets/map/choco/loading/intro.mp4', blackHoldMs: 2000, fadeMs: 1000 },
  minLoadingMs: 7000,
  secret: { audio: 'assets/map_choco/secret/secret.opus' },
  bgmInGame: true, // loading.opus keeps playing as the in-game BGM until it ends (not in CLASSIC mode)
  taunts: true, // Grandmaster Beh taunts during the match (see game/grandmaster-beh.js)
  greeting: { from: 'Grandmaster Beh', text: (name) => `Welcome ${name} to the ultimate Choco-rocklate Gladiator Arena! Prepare yourselves!` },

  assets: {
    images: ['assets/map/choco/loading/loading.jpg'],
    models: [MODEL, GUN_MODEL, AMMO_MODEL]
  },

  createLevel(loaded) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT_HORIZON_HEX);
    scene.fog = new THREE.Fog(NIGHT_HORIZON_HEX, FOG_NEAR, FOG_FAR);
    const hemi = new THREE.HemisphereLight(0xdbe7ff, 0x1a2030, 0.8);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xe6efff, 0.9); // moonlight (turns blood red)
    sun.position.copy(MOON_DIR).multiplyScalar(100);
    scene.add(sun);
    const sky = createBloodSky({ moonDir: MOON_DIR, blend: 0 });
    scene.add(sky.group);

    const storm = createStorm({ scene, flashColor: 0xe8d8ff, onFlash: (f) => sky.setFlash(f) });
    let collision = null;
    const mp = createMapProps({ data: D, mapId: ID, getCollision: () => collision });
    const { props, interactables, state } = mp;
    for (const p of props) scene.add(p.group);

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
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x4a3028 }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
    }

    // Sky timeline: blend 0 (cold white night) -> 1 (blood moon + vortex).
    const cold = { hemiSky: new THREE.Color(0xdbe7ff), hemiGround: new THREE.Color(0x1a2030), sun: new THREE.Color(0xe6efff), fog: new THREE.Color(NIGHT_HORIZON_HEX) };
    const red = { hemiSky: new THREE.Color(0xff8a7a), hemiGround: new THREE.Color(0x1c070c), sun: new THREE.Color(0xff5a48), fog: new THREE.Color(BLOOD_HORIZON_HEX) };
    const tmp = new THREE.Color();
    let skyMs = 0, skyOn = false, skyFixed = false, struck = 0;
    const applySky = (b) => {
      sky.setBlend(b);
      hemi.color.copy(cold.hemiSky).lerp(red.hemiSky, b);
      hemi.groundColor.copy(cold.hemiGround).lerp(red.hemiGround, b);
      sun.color.copy(cold.sun).lerp(red.sun, b);
      tmp.copy(cold.fog).lerp(red.fog, b);
      storm.setBase(tmp.getHex());
      scene.fog.far = FOG_FAR * (1.15 - 0.15 * b);
    };
    applySky(0);

    return {
      scene,
      startSkyTransition() { if (!skyFixed) skyOn = true; },
      setSkyBlend(b) { skyFixed = true; skyOn = false; applySky(b); },
      groundY: 0,
      collision,
      gunSpawns: guns.spawns,
      ammoSpawns: ammo.spawns,
      killY,
      spawn,
      interactables,
      state,
      setBarrierOpen: mp.setBarrierOpen,
      setLinked: mp.setLinked,
      update(dt, camera) {
        if (skyOn) {
          skyMs += dt * 1000;
          const b = skyBlendAt(skyMs);
          applySky(b);
          if (struck < 1 && b >= 0.5) { struck = 1; storm.strike(); }
          if (struck < 2 && b >= 0.85) { struck = 2; storm.strike(); }
          if (skyMs >= SKY_MS) skyOn = false;
        }
        sky.update(dt, camera);
        storm.update(dt, camera);
        for (const p of props) p.update(dt);
        mixer?.update(dt);
        guns.update(dt); ammo.update(dt);
      },
      dispose() {
        mixer?.stopAllAction();
        storm.dispose();
        sky.dispose();
        for (const p of props) p.dispose();
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
