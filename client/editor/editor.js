// Map Editor for Rise of Lyric. Editable groups: player spawn, enemy areas,
// gun/ammo spawns, interactables (barrier, teleporter, teleporters,
// colorMachine, powerupMachine, lyricMachine). Read-only: model, scale, noCollide.
import * as THREE from '../../vendor/three.module.min.js';
import { GLTFLoader } from '../../vendor/GLTFLoader.js';
import { MAP_DATA, applyOverrides } from '../js/maps/map-data.js';
import { listMaps, getMap } from '../js/maps/maps.js';
import { loadAssets } from '../js/core/assets.js';
import { CollisionWorld, trianglesFromMeshes } from '../js/game/collision-world.js';

const MAP_IDS = ['ungaland', 'choco-rocklate-gladiator-arena', 'night-of-the-living-void', 'endless-shot', 'fearvelations'];
const EDITABLE_KINDS = ['playerSpawn', 'enemyArea', 'enemyAreaOpen', 'gunSpawn', 'ammoSpawn', 'barrier', 'teleporter', 'teleporterA', 'teleporterB', 'colorMachine', 'powerupMachine', 'lyricMachine'];
const KIND_COLORS = {
  playerSpawn: 0x44ff44, enemyArea: 0xffaa44, enemyAreaOpen: 0xff8888,
  gunSpawn: 0xffd700, ammoSpawn: 0x44aaff, barrier: 0x888888,
  teleporter: 0x44ffaa, teleporterA: 0x44ffaa, teleporterB: 0xff44aa,
  colorMachine: 0xff44ff, powerupMachine: 0xffff44, lyricMachine: 0xff4444
};

let scene, camera, renderer, raycaster, pointer;
let mapMesh, collisionWorld, mapBounds;
let selectedId = null;
let selectedKind = null;
let items = [];
let isDragging = false;
let dragPlane, dragStart, dragOffset;

const canvas = document.getElementById('editor-canvas');
const statusEl = document.getElementById('editor-status');
const mapSelect = document.getElementById('editor-map');
const paletteEl = document.getElementById('editor-palette-buttons');
const propsEl = document.getElementById('editor-properties');
const fieldsEl = document.getElementById('editor-property-fields');
const deleteBtn = document.getElementById('editor-delete-selected');

function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = cls || ''; }

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05050a);
  scene.fog = new THREE.Fog(0x05050a, 10, 200);

  camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new THREE.HemisphereLight(0x8094d8, 0x10121f, 0.75));
  scene.add(new THREE.AmbientLight(0x5560a0, 0.15));
  const moon = new THREE.DirectionalLight(0xb4c4ff, 0.9);
  moon.position.set(-40, 80, -25);
  scene.add(moon);

  const grid = new THREE.GridHelper(200, 40, 0x2a2a40, 0x1a1a2a);
  grid.position.y = 0.01;
  scene.add(grid);

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);


async function loadMap(mapId) {
  setStatus('Loading map...', 'connecting');
  const entry = MAP_DATA[mapId];
  if (!entry) { setStatus('Unknown map: ' + mapId, 'error'); return; }

  while (scene.children.length > 0) scene.remove(scene.children[0]);
  scene.add(new THREE.HemisphereLight(0x8094d8, 0x10121f, 0.75));
  scene.add(new THREE.AmbientLight(0x5560a0, 0.15));
  const moon = new THREE.DirectionalLight(0xb4c4ff, 0.9);
  moon.position.set(-40, 80, -25);
  scene.add(moon);
  const grid = new THREE.GridHelper(200, 40, 0x2a2a40, 0x1a1a2a);
  grid.position.y = 0.01;
  scene.add(grid);

  const loader = new GLTFLoader();
  let gltf;
  try {
    gltf = await new Promise((res, rej) => loader.load(entry.model, res, undefined, rej));
  } catch (e) {
    setStatus('Failed to load ' + entry.model + ' - using placeholder', 'error');
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x14172a }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    mapMesh = null;
    collisionWorld = null;
    mapBounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
    rebuildItems();
    setStatus('Map loaded (placeholder) - ' + mapId);
    return;
  }

  const root = gltf.scene;
  root.scale.setScalar(entry.scale || 1);
  scene.add(root);
  mapMesh = root;

  const meshes = [];
  root.traverse((o) => {
    if (o.isMesh && !o.isSkinnedMesh && !entry.noCollide?.includes(o.name)) {
      meshes.push({ geometry: o.geometry, matrixWorld: o.matrixWorld });
    }
  });
  const tri = trianglesFromMeshes(meshes);
  collisionWorld = new CollisionWorld(tri);
  const b = collisionWorld.bounds;
  mapBounds = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };

  rebuildItems();
  setStatus('Map loaded - ' + mapId);
}

function trianglesFromMeshes(meshes) {
  const out = [];
  for (const { geometry, matrixWorld } of meshes) {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    const count = idx ? idx.count : pos.count;
    for (let i = 0; i + 2 < count; i += 3) {
      const a = idx ? idx.getX(i) : i;
      const b = idx ? idx.getX(i + 1) : i + 1;
      const c = idx ? idx.getX(i + 2) : i + 2;
      const pa = new THREE.Vector3().fromBufferAttribute(pos, a).applyMatrix4(matrixWorld);

function rebuildItems() {
  items.forEach(it => { if (it.mesh) scene.remove(it.mesh); });
  items = [];

  const entry = MAP_DATA[mapSelect.value];
  if (!entry) return;

  const spawn = entry.spawn || [0, 0.5, 0];
  addItem('spawn-' + mapSelect.value, 'playerSpawn', spawn[0], spawn[1], spawn[2]);

  (entry.enemyAreas || []).forEach((a, i) => {
    addItem('area-' + i, 'enemyArea', (a.min[0] + a.max[0]) / 2, (a.min[1] + a.max[1]) / 2, (a.min[2] + a.max[2]) / 2, a.min, a.max);
  });
  (entry.enemyAreasOpen || []).forEach((a, i) => {
    addItem('areaOpen-' + i, 'enemyAreaOpen', (a.min[0] + a.max[0]) / 2, (a.min[1] + a.max[1]) / 2, (a.min[2] + a.max[2]) / 2, a.min, a.max);
  });

  (entry.gunSpawns || []).forEach((p, i) => addItem('gun-' + i, 'gunSpawn', p[0], p[1], p[2]));
  (entry.ammoSpawns || []).forEach((p, i) => addItem('ammo-' + i, 'ammoSpawn', p[0], p[1], p[2]));

  if (entry.teleporter) addItem('teleporter', 'teleporter', entry.teleporter.at[0], entry.teleporter.at[1], entry.teleporter.at[2], entry.teleporter.to);
  if (entry.teleporters) {
    addItem('teleporterA', 'teleporterA', entry.teleporters.a[0], entry.teleporters.a[1], entry.teleporters.a[2], entry.teleporters.b);
    addItem('teleporterB', 'teleporterB', entry.teleporters.b[0], entry.teleporters.b[1], entry.teleporters.b[2], entry.teleporters.a);
  }
  if (entry.colorMachine) addItem('colorMachine', 'colorMachine', entry.colorMachine.at[0], entry.colorMachine.at[1], entry.colorMachine.at[2]);
  if (entry.powerupMachine) addItem('powerupMachine', 'powerupMachine', entry.powerupMachine.at[0], entry.powerupMachine.at[1], entry.powerupMachine.at[2]);
  if (entry.lyricMachine) addItem('lyricMachine', 'lyricMachine', entry.lyricMachine.at[0], entry.lyricMachine.at[1], entry.lyricMachine.at[2]);
  if (entry.barrier) addItem('barrier', 'barrier', (entry.barrier.min[0] + entry.barrier.max[0]) / 2, entry.barrier.min[1], (entry.barrier.min[2] + entry.barrier.max[2]) / 2, entry.barrier.min, entry.barrier.max);

  renderItems();
}

function addItem(id, kind, x, y, z, extra1, extra2) {
  const color = KIND_COLORS[kind] || 0xffffff;
  const mesh = kind === 'enemyArea' || kind === 'enemyAreaOpen' || kind === 'barrier'
    ? new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4 }))
    : new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, y, z);
  scene.add(mesh);
  items.push({ id, kind, x, y, z, extra1, extra2, mesh, selected: false });
}

function renderItems() {
  items.forEach(it => {
    const s = it.selected ? 1.5 : 1;
    it.mesh.scale.setScalar(s);
    it.mesh.position.set(it.x, it.y, it.z);

function buildPalette() {
  paletteEl.innerHTML = '';
  EDITABLE_KINDS.forEach(kind => {
    const btn = document.createElement('button');
    btn.textContent = kind;
    btn.onclick = () => {
      document.querySelectorAll('#editor-palette-buttons button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedKind = kind;
      selectedId = null;
      showProperties(null);
    };
    paletteEl.appendChild(btn);
  });
}

function showProperties(item) {
  fieldsEl.innerHTML = '';
  if (!item) { propsEl.classList.add('hidden'); return; }
  propsEl.classList.remove('hidden');

  const addField = (label, key, type = 'number') => {
    const row = document.createElement('div');
    row.className = 'property-row';
    const lab = document.createElement('label'); lab.textContent = label;
    const input = document.createElement('input'); input.type = type; input.value = item[key] ?? '';
    input.onchange = () => {
      const v = type === 'number' ? parseFloat(input.value) : input.value;
      if (!isNaN(v)) { item[key] = v; updateItemInDraft(item); renderItems(); }
    };
    row.appendChild(lab); row.appendChild(input); fieldsEl.appendChild(row);
  };

  addField('X', 'x'); addField('Y', 'y'); addField('Z', 'z');
  if (item.cost !== undefined) addField('Cost', 'cost');
  if (item.extra2 && item.kind === 'teleporter') { addField('To X', 'toX'); addField('To Y', 'toY'); addField('To Z', 'toZ'); }
}

function updateItemInDraft(item) {
  const entry = MAP_DATA[mapSelect.value];
  if (!entry) return;
  if (item.kind === 'playerSpawn') entry.spawn = [item.x, item.y, item.z];
  else if (item.kind === 'enemyArea') {
    const idx = parseInt(item.id.replace('area-', ''));
    entry.enemyAreas[idx] = { min: item.extra1, max: item.extra2 };
  } else if (item.kind === 'gunSpawn') {
    const idx = parseInt(item.id.replace('gun-', ''));
    entry.gunSpawns[idx] = [item.x, item.y, item.z];
  } else if (item.kind === 'ammoSpawn') {
    const idx = parseInt(item.id.replace('ammo-', ''));
    entry.ammoSpawns[idx] = [item.x, item.y, item.z];
  } else if (item.kind === 'teleporter') { entry.teleporter.at = [item.x, item.y, item.z]; entry.teleporter.to = item.extra1; }
  else if (item.kind === 'colorMachine') { entry.colorMachine.at = [item.x, item.y, item.z]; }

function onMouseDown(e) {
  if (e.button !== 0) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(items.map(it => it.mesh));
  if (hits.length > 0) {
    const mesh = hits[0].object;
    const item = items.find(it => it.mesh === mesh);
    if (item) {
      selectedId = item.id; selectedKind = item.kind;
      items.forEach(it => { it.selected = it.id === selectedId; });
      showProperties(item);
      renderItems();
      dragStart = new THREE.Vector3(e.clientX, e.clientY);
      dragOffset = new THREE.Vector3(item.x, item.y, item.z);
      isDragging = true;
      return;
    }
  }

  if (selectedKind) {
    const hit = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
    if (hit) {
      const id = selectedKind + '-' + Date.now();
      addItem(id, selectedKind, hit.x, hit.y, hit.z);
      items.forEach(it => it.selected = false);
      const newItem = items[items.length - 1];
      newItem.selected = true;
      selectedId = newItem.id;
      showProperties(newItem);
      renderItems();
      updateItemInDraft(newItem);
    }
  }
}

function onMouseMove(e) {
  if (!isDragging || !selectedId) return;
  const item = items.find(it => it.id === selectedId);
  if (!item) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.ray.intersectPlane(dragPlane, new THREE.Vector3());
  if (hit) {
    item.x = hit.x; item.y = hit.y; item.z = hit.z;
    item.mesh.position.set(hit.x, hit.y, hit.z);
    renderItems();
  }
}

function onMouseUp() { isDragging = false; }
function onWheel(e) { e.preventDefault(); }

function autosave() {
  try {
    localStorage.setItem('editor_draft_' + mapSelect.value, JSON.stringify(draft));
  } catch (e) { console.warn('autosave failed', e); }
}

function loadDraft() {
  try {
    const saved = localStorage.getItem('editor_draft_' + mapSelect.value);
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const [k, v] of Object.entries(parsed)) {
        if (MAP_DATA[mapSelect.value][k] !== undefined) MAP_DATA[mapSelect.value][k] = v;
      }
    }
  } catch (e) { console.warn('load draft failed', e); }
}

function downloadOverrides() {
  const overrides = {};
  for (const id of MAP_IDS) {
    const entry = MAP_DATA[id];
    const o = {};
    for (const field of ['spawn', 'enemyAreas', 'enemyAreasOpen', 'gunSpawns', 'ammoSpawns', 'barrier', 'teleporter', 'teleporters', 'colorMachine', 'powerupMachine', 'lyricMachine', 'ready']) {
      if (entry[field] !== undefined) o[field] = entry[field];
    }
    if (Object.keys(o).length > 0) overrides[id] = o;
  }
  const content = '// Editor overrides for MAP_DATA.\nexport const OVERRIDES = ' + JSON.stringify(overrides, null, 2) + ';\n';
  const blob = new Blob([content], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

mapSelect.onchange = () => { loadMap(mapSelect.value); };
deleteBtn.onclick = () => {
  if (!selectedId) return;
  items = items.filter(it => it.id !== selectedId);
  const toRemove = items.find(it => it.id === selectedId);
  if (toRemove && toRemove.mesh) scene.remove(toRemove.mesh);
  selectedId = null; selectedKind = null;
  propsEl.classList.add('hidden');
  autosave();
};
document.getElementById('editor-save').onclick = downloadOverrides;
document.getElementById('editor-testplay').onclick = testPlay;

mapSelect.innerHTML = MAP_IDS.map(id => `<option value="${id}">${id}</option>`).join('');
mapSelect.value = 'ungaland';
buildPalette();
initThree();
loadMap('ungaland');

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

  a.href = url; a.download = 'map-overrides.js'; a.click();
  URL.revokeObjectURL(url);
}

function testPlay() {
  const mapId = mapSelect.value;
  localStorage.setItem('editor_testplay_map', mapId);
  window.open(window.location.origin + '/?testplay=' + mapId, '_blank');
}

  else if (item.kind === 'powerupMachine') { entry.powerupMachine.at = [item.x, item.y, item.z]; }
  else if (item.kind === 'lyricMachine') { entry.lyricMachine.at = [item.x, item.y, item.z]; }
  else if (item.kind === 'barrier') { entry.barrier.min = item.extra1; entry.barrier.max = item.extra2; }
  autosave();
}

    if (it.kind === 'enemyArea' || it.kind === 'enemyAreaOpen' || it.kind === 'barrier') {
      if (it.extra1 && it.extra2) {
        const [x0, y0, z0] = it.extra1; const [x1, y1, z1] = it.extra2;
        it.mesh.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
        it.mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
      }
    }
  });
}

      const pb = new THREE.Vector3().fromBufferAttribute(pos, b).applyMatrix4(matrixWorld);
      const pc = new THREE.Vector3().fromBufferAttribute(pos, c).applyMatrix4(matrixWorld);
      out.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z, pc.x, pc.y, pc.z);
    }
  }
  return new Float32Array(out);
}

  window.addEventListener('resize', onResize);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
}

function onResize() {
  camera.aspect = canvas.clientWidth / canvas.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}
