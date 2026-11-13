// Base scene setup: lighting, ground plane, and a placeholder test cube so the
// runtime is visibly working. No game art/design is implemented here.
import * as THREE from '../../vendor/three.module.min.js';

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11141a);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.8);
  directional.position.set(5, 10, 7);
  scene.add(directional);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0x2a2f3a })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const testCube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x4c9ef7 })
  );
  testCube.position.set(0, 0.5, 0);
  scene.add(testCube);

  return { scene, testCube };
}

// Creates a simple placeholder mesh representing a remote player entity.
export function createPlayerMesh(color = 0xf74c4c) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.8, 0.8),
    new THREE.MeshStandardMaterial({ color })
  );
}
