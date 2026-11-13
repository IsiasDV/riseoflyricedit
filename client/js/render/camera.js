// Basic perspective camera setup. No gameplay camera-rig logic yet.
import * as THREE from '../../vendor/three.module.min.js';
import { CLIENT_CONFIG } from '../core/config.js';

export function createCamera() {
  const camera = new THREE.PerspectiveCamera(
    CLIENT_CONFIG.CAMERA_FOV,
    window.innerWidth / window.innerHeight,
    CLIENT_CONFIG.CAMERA_NEAR,
    CLIENT_CONFIG.CAMERA_FAR
  );
  camera.position.set(0, 2, 6);
  return camera;
}
