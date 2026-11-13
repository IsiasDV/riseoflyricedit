// Map definition: Ungaland. Set up ahead of its assets (see README "Ungaland go-live checklist");
// until MAP_DATA.ungaland.ready is true a match cannot be started on it.
import * as THREE from '../../vendor/three.module.min.js';
import { CollisionWorld, trianglesFromMeshes } from '../game/collision-world.js';
import { createPickupSpawns, GOLD_STYLE, BLUE_STYLE } from './pickup-spawns.js';
import { MAP_DATA } from './map-data.js';
import { COSTS } from '../game/interactions.js';
import { createTeleporter, createColorMachine, createPowerupMachine } from './props.js';
import { createNightSky, HORIZON_HEX } from './night-sky.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';

const { model: MODEL, noCollide: NO_COLLIDE, scale: MODEL_SCALE } = MAP_DATA.ungaland;
const GUN_MODEL = 'assets/general/Gun.glb';
const AMMO_MODEL = 'assets/general/Bullet.glb';
// World-space pickup positions (x, floor y, z). Derived from MAP_DATA.ungaland.
export const GUN_SPAWNS = MAP_DATA.ungaland.gunSpawns;
export const AMMO_SPAWNS = MAP_DATA.ungaland.ammoSpawns;
const MOON_DIR = new THREE.Vector3(-0.4, 0.47, -0.8).normalize();
const FOG_NEAR = 8, FOG_FAR = 70;

export const ungaland = {
  id: 'ungaland',
  name: 'Ungaland',
  description: 'A stronghold village in Western Africa invaded by the Behs. This is the continuation of the Alternative Canon.',
  ready: MAP_DATA.ungaland.ready !== false,
  banner: 'assets/map/ungaland/banner.jpg',
  loadingBackground: 'assets/map/ungaland/loading.png',
  loadingAudio: 'assets/map/ungaland/loading.opus',
  secret: { audio: 'assets/map_ungaland/secret/secret.opus' },

  assets: {
    images: ['assets/map/ungaland/loading.png'],
    models: [MODEL, GUN_MODEL, AMMO_MODEL]
  },

  createLevel(loaded) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(HORIZON_HEX);
    scene.fog = new THREE.Fog(HORIZON_HEX, FOG_NEAR, FOG_FAR);
    scene.add(new THREE.HemisphereLight(0x8094d8, 0x10121f, 0.75));
    scene.add(new THREE.AmbientLight(0x5560a0, 0.15));
    const moon = new THREE.DirectionalLight(0xb4c4ff, 0.95);
    moon.position.copy(MOON_DIR).multiplyScalar(100);
    scene.add(moon);
    const sky = createNightSky({ moonDir: MOON_DIR });
    scene.add(sky.group);
    const tp = MAP_DATA.ungaland.teleporter, cm = MAP_DATA.ungaland.colorMachine;
    const teleporter = createTeleporter(tp.at);
    const machine = createColorMachine(cm.at);
    const pm = MAP_DATA.ungaland.powerupMachine.at;
    const spinner = createPowerupMachine(pm);
    scene.add(teleporter.group, machine.group, spinner.group);
    const interactables = [
      { id: 'teleporter', kind: 'teleporter', x: tp.at[0], y: tp.at[1], z: tp.at[2], radius: 2.2, prompt: 'TELEPORT', cost: COSTS.teleporter, to: tp.to },
      { id: 'colorMachine', kind: 'colorMachine', x: cm.at[0], y: cm.at[1], z: cm.at[2], radius: 2.2, prompt: 'BULLET COLOR MACHINE', cost: COSTS.colorMachine, machine },
      { id: 'spin', kind: 'spin', x: pm[0], y: pm[1], z: pm[2], radius: 2.2, prompt: 'POWERUP MACHINE', cost: COSTS.spin, machine: spinner }
    ];
    let time = 0;
    let mixer = null;

    const guns = createPickupSpawns(loaded?.models?.[GUN_MODEL], GUN_SPAWNS, GOLD_STYLE);
    scene.add(guns.group);
    const ammo = createPickupSpawns(loaded?.models?.[AMMO_MODEL], AMMO_SPAWNS, BLUE_STYLE);
    scene.add(ammo.group);

    const [sx, sy, sz] = MAP_DATA.ungaland.spawn;
    const spawn = { x: sx, y: sy, z: sz, yaw: 0 };
    let collision = null;
    let killY = -100;
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
      collision = new CollisionWorld(trianglesFromMeshes(meshes));
      killY = collision.bounds.minY - 30;
      const clip = (src.animations || []).find((c) => c.name === 'Beh');
      if (clip) {
        mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clip).play();
      }
    } else {
      console.warn(`[map] ${MODEL} did not load; using placeholder ground`);
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x14172a }));
      ground.rotation.x = -Math.PI / 2;
      scene.add(ground);
      const grid = new THREE.GridHelper(400, 200, 0x2a3060, 0x1a1f40);
      grid.position.y = 0.01;
      scene.add(grid);
    }

    return {
      scene,
      groundY: 0,
      collision,
      gunSpawns: guns.spawns,
      ammoSpawns: ammo.spawns,
      killY,
      spawn,
      interactables,
      update(dt, camera) {
        time += dt;
        sky.update(dt, camera);
        teleporter.update(dt);
        machine.update(dt);
        spinner.update(dt);
        mixer?.update(dt);
        // Breathing mist: slow layered swells in fog distance and moonlight.
        const swell = Math.sin(time * 0.21) * 0.6 + Math.sin(time * 0.53 + 1.3) * 0.4;
        scene.fog.near = FOG_NEAR * (1 + 0.18 * swell);
        scene.fog.far = FOG_FAR * (1 + 0.15 * swell);
        moon.intensity = 0.95 + 0.06 * Math.sin(time * 0.37);
        guns.update(dt); ammo.update(dt);
      },
      dispose() {
        mixer?.stopAllAction();
        sky.dispose();
        teleporter.dispose();
        machine.dispose();
        spinner.dispose();
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
