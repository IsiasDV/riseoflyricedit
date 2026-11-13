// Floating text sprites above remote players: username plate and "?" away marker.
import * as THREE from '../../vendor/three.module.min.js';

function plateCanvas(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(244, g.measureText(text).width + 24);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.roundRect?.(128 - w / 2, 8, w, 48, 12); g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.strokeText(text, 128, 33, 232);
  g.fillStyle = '#fff';
  g.fillText(text, 128, 33, 232);
  return c;
}

function makeSprite(canvas, w, h) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(w, h, 1);
  return s;
}

export function createNameplate(text) {
  const s = makeSprite(plateCanvas(text), 1.6, 0.4);
  s.userData.text = text;
  return s;
}

export function setNameplateText(sprite, text) {
  if (sprite.userData.text === text) return;
  sprite.userData.text = text;
  sprite.material.map.dispose();
  const tex = new THREE.CanvasTexture(plateCanvas(text));
  tex.colorSpace = THREE.SRGBColorSpace;
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
}

export function createQuestionMark() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 56px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.strokeText('?', 32, 34);
  g.fillStyle = '#ffd34d';
  g.fillText('?', 32, 34);
  return makeSprite(c, 0.5, 0.5);
}

export function disposeNameplate(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

// Giant red "REVIVE" label shown above downed players.
export function createReviveLabel() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 96px Segoe UI, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,0.95)';
  g.strokeText('REVIVE', 256, 68);
  g.fillStyle = '#ff3b3b';
  g.fillText('REVIVE', 256, 68);
  const s = makeSprite(c, 3.2, 0.8);
  s.material.depthTest = false; // readable through walls
  s.renderOrder = 10;
  return s;
}
