// Shows the other players of the current match inside the level scene, smoothing
// the 20Hz server states into per-frame motion.
import { createAvatar, createCharacterAvatar, setAvatarCrouch } from '../render/avatar.js';
import { CHARACTERS } from './characters.js';
import { AVATAR_HEIGHT, AVATAR_CROUCH_HEIGHT } from '../render/avatar.js';
import { createNameplate, setNameplateText, createQuestionMark, createReviveLabel, disposeNameplate } from '../render/nameplate.js';

export class RemotePlayers {
  // characters: { [playerId]: charId }; loaded: result of loadAssets (has .models).
  constructor(scene, localId, characters = {}, loaded = {}, nameOf = () => '') {
    this.nameOf = nameOf;
    this.time = 0;
    this.scene = scene;
    this.localId = localId;
    this.characters = characters;
    this.loaded = loaded;
    this.entries = new Map(); // id -> { avatar, target }
  }

  setLocalId(id) { this.localId = id; }

  applyState(msg) {
    const seen = new Set();
    for (const p of msg.players) {
      if (p.id === this.localId) continue;
      seen.add(p.id);
      let e = this.entries.get(p.id);
      if (!e) {
        const avatar = this._makeAvatar(p.id);
        avatar.position.set(p.x, p.y, p.z); // appear in place, don't slide in
        avatar.rotation.y = p.yaw;
        this._addTags(avatar, p.id);
        this.scene.add(avatar);
        e = { avatar, target: p };
        this.entries.set(p.id, e);
      }
      e.target = p;
    }
    for (const [id, e] of this.entries) {
      if (!seen.has(id)) {
        this.scene.remove(e.avatar);
        this._dispose(e.avatar);
        this.entries.delete(id);
      }
    }
  }

  update(dt) {
    const k = 1 - Math.exp(-15 * dt);
    this.time += dt;
    for (const { avatar, target } of this.entries.values()) {
      avatar.position.x += (target.x - avatar.position.x) * k;
      avatar.position.y += (target.y - avatar.position.y) * k;
      avatar.position.z += (target.z - avatar.position.z) * k;
      // shortest-arc yaw interpolation
      let dy = (target.yaw - avatar.rotation.y) % (Math.PI * 2);
      if (dy > Math.PI) dy -= Math.PI * 2;
      if (dy < -Math.PI) dy += Math.PI * 2;
      avatar.rotation.y += dy * k;
      const c = avatar.userData.crouch;
      setAvatarCrouch(avatar, c + (((target.crouch || target.down) ? 1 : 0) - c) * k);
      const { plate, mark, revive, id } = avatar.userData.tags;
      const h = AVATAR_HEIGHT + (AVATAR_CROUCH_HEIGHT - AVATAR_HEIGHT) * avatar.userData.crouch;
      setNameplateText(plate, this.nameOf(id) || 'Player');
      plate.position.y = h + 0.35;
      mark.visible = !!target.away && !target.down;
      revive.visible = !!target.down;
      revive.position.y = h + 1.4 + Math.sin(this.time * 4) * 0.08;
      mark.position.y = h + 0.9 + Math.sin(this.time * 3) * 0.05;
    }
  }

  clear() {
    for (const { avatar } of this.entries.values()) {
      this.scene.remove(avatar);
      this._dispose(avatar);
    }
    this.entries.clear();
  }

  _addTags(avatar, id) {
    const plate = createNameplate(this.nameOf(id) || 'Player');
    const mark = createQuestionMark();
    mark.visible = false;
    const revive = createReviveLabel();
    revive.visible = false;
    avatar.add(plate, mark, revive);
    avatar.userData.tags = { plate, mark, revive, id };
  }

  _makeAvatar(id) {
    const ch = CHARACTERS[this.characters[id]];
    const scene = ch && this.loaded.models?.[ch.model];
    if (scene) {
      try { return createCharacterAvatar(scene, ch.yawOffset, ch.scale); } catch (e) { console.warn('[avatar] model failed', e); }
    }
    return createAvatar(id); // fallback cube
  }

  _dispose(avatar) {
    const t = avatar.userData.tags;
    if (t) { disposeNameplate(t.plate); disposeNameplate(t.mark); disposeNameplate(t.revive); }
    if (avatar.userData.shared) return; // model geometry/materials are shared
    avatar.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }
}
