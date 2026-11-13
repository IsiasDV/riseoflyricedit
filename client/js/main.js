// Bootstrap: wires together renderer, scene, camera, input, network and UI.
// This is the runtime skeleton only - no gameplay rules are implemented here.
import { createRenderer, bindResize } from './render/renderer.js';
import { createCamera } from './render/camera.js';
import { MotionBlur } from './render/motion-blur.js';
import { createScene, createPlayerMesh } from './render/scene.js';
import { InputManager } from './input/input.js';
import { NetworkClient } from './net/network.js';
import { WorldState } from './state/state.js';
import { GameLoop } from './core/loop.js';
import { events } from './core/events.js';
import { UI } from './ui/ui.js';
import { MenuSystem } from './ui/menu.js';
import { LobbySystem } from './ui/lobby.js';
import { GameSession } from './game/game-session.js';
import { settings, FOV_VALUES, PIXEL_RATIO_CAPS } from './state/settings.js';
import { bgm } from './ui/bgm.js';
import { MenuFlyby } from './ui/menu-flyby.js';
import { profile } from './state/profile.js';

const ui = new UI();
const canvas = document.getElementById('game-canvas');

const renderer = createRenderer(canvas);
const camera = createCamera();
const { scene, testCube } = createScene();
bindResize(renderer, camera);

const motionBlur = new MotionBlur(renderer);

function applySettings() {
  motionBlur.enabled = settings.get('motionBlur') === 'ON'; // off by default
  camera.fov = FOV_VALUES[settings.get('fov')];
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAPS[settings.get('fidelity')]));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
events.on('settings:changed', applySettings);
applySettings();

const input = new InputManager(canvas);
const world = new WorldState();
const network = new NetworkClient();

const lobby = new LobbySystem(network);
const session = new GameSession({ network, lobby, renderer, camera, input, canvas, ui });

// Test-play hook: if ?testplay=<mapId> is in the URL, auto-start singleplayer
// on that map with editor overrides already applied (map-data.js applies them
// at import time). Bypasses the lobby click-through.
const urlParams = new URLSearchParams(location.search);
const testPlayMap = urlParams.get('testplay');
if (testPlayMap) {
  events.emit('lobby:start', { mapId: testPlayMap, mode: 'single' });
}

const flyby = new MenuFlyby(renderer, camera);
const menuRoot = document.getElementById('menu-root');

const remoteMeshes = new Map(); // playerId -> THREE.Mesh

events.on('net:connected', () => {
  ui.setLoadingText('Connected. Syncing world...');
});

events.on('net:welcome', (msg) => {
  world.localPlayerId = msg.id;
  ui.hideLoadingScreen();
  ui.updateStats({ status: 'connected' });
});

events.on('net:disconnected', () => {
  ui.updateStats({ status: 'disconnected' });
});

events.on('net:snapshot', (snapshot) => {
  world.applySnapshot(snapshot);
});

events.on('net:playerLeave', (msg) => {
  world.removePlayer(msg.id);
});

function syncRemoteMeshes() {
  for (const [id, data] of world.players) {
    if (id === world.localPlayerId) continue;

    let mesh = remoteMeshes.get(id);
    if (!mesh) {
      mesh = createPlayerMesh();
      scene.add(mesh);
      remoteMeshes.set(id, mesh);
    }
    mesh.position.set(data.x, data.y + 0.9, data.z);
    mesh.rotation.y = data.ry || 0;
  }

  for (const [id, mesh] of remoteMeshes) {
    if (!world.players.has(id)) {
      scene.remove(mesh);
      remoteMeshes.delete(id);
    }
  }
}

function update(deltaSeconds) {
  // Lobby backdrop: rotate the test cube to show the render loop is alive.
  testCube.rotation.y += deltaSeconds * 0.5;
  syncRemoteMeshes();
  session.update(deltaSeconds);
  flyby.setActive(!menuRoot.classList.contains('hidden') && !session.scene && !lobby.active);
  flyby.update(deltaSeconds);
}

let lastRender = performance.now();
function render() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastRender) / 1000);
  lastRender = now;
  // The match level replaces the lobby backdrop scene while a game is running.
  motionBlur.render(session.scene ?? flyby.scene ?? scene, camera, session.blurParams(), dt);
  flyby.afterRender();
  session.viewmodel.render(renderer);
}

const loop = new GameLoop({ update, render });
loop.start();

setInterval(() => {
  ui.updateStats({
    fps: loop.fps,
    playerCount: world.players.size
  });
}, 500);

ui.setLoadingText('Connecting to server...');
network.connect(profile.name, { ...profile.stats }, profile.perk);
events.on('profile:perk', ({ perk }) => network.setPerk(perk));
events.on('profile:stats', ({ stats }) => network.setStats(stats));

bgm.play();
new MenuSystem(network, lobby).start();
