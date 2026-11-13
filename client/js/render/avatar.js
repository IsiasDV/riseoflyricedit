// Placeholder player avatar: body box plus a front marker so facing is visible.
// Origin is at the player's feet. Replace with a real model later.
import * as THREE from '../../vendor/three.module.min.js';
import { clone as cloneSkinned } from '../../vendor/SkeletonUtils.js';

const COLORS = [0xf74c4c, 0x4cc9f7, 0xf7d44c, 0x6ef74c, 0xc04cf7, 0xf7894c];
export const AVATAR_HEIGHT = 1.8;
export const AVATAR_CROUCH_HEIGHT = 1.2;

export function createAvatar(id) {
  const color = COLORS[Math.abs(Number(id) || 0) % COLORS.length];
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, AVATAR_HEIGHT, 0.8),
    new THREE.MeshStandardMaterial({ color })
  );
  body.position.y = AVATAR_HEIGHT / 2;
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.2, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xffffff })
  );
  nose.position.set(0, AVATAR_HEIGHT * 0.85, -0.5); // forward = -Z
  group.add(body, nose);
  group.userData = { body, nose, crouch: 0 };
  return group;
}

// Avatar built from a loaded glTF scene, normalized to AVATAR_HEIGHT with feet
// at the origin. Geometry/materials are shared with the source (don't dispose).
export function createCharacterAvatar(modelScene, yawOffset = 0, scale = 1) {
  const model = cloneSkinned(modelScene);
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(model, true);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = size.y > 0 ? AVATAR_HEIGHT / size.y : 1;

  model.position.set(-center.x, -box.min.y, -center.z); // feet at origin, centered
  const inner = new THREE.Group(); // uniform scale + facing
  inner.add(model);
  inner.scale.setScalar(s * scale);
  inner.rotation.y = yawOffset;
  const holder = new THREE.Group(); // crouch scales this on Y
  holder.add(inner);

  const group = new THREE.Group();
  group.add(holder);
  group.userData = { model: holder, crouch: 0, shared: true };
  return group;
}

// crouch: 0 (standing) .. 1 (crouched), eased by the caller.
export function setAvatarCrouch(avatar, crouch) {
  const { body, nose, model } = avatar.userData;
  const h = AVATAR_HEIGHT + (AVATAR_CROUCH_HEIGHT - AVATAR_HEIGHT) * crouch;
  if (model) {
    model.scale.y = h / AVATAR_HEIGHT;
    avatar.userData.crouch = crouch;
    return;
  }
  body.scale.y = h / AVATAR_HEIGHT;
  body.position.y = h / 2;
  nose.position.y = h * 0.85;
  avatar.userData.crouch = crouch;
}
