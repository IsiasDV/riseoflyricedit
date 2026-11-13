// Main-menu background: a camera flying through every map, crossfading to the next every 30 s.
import { listMaps } from '../maps/maps.js';
import { loadAssets } from '../core/assets.js';
import { CinematicCamera } from '../game/cinematic.js';
import { FlybySchedule } from '../game/flyby-schedule.js';

const FADE_MS = 2500;

export class MenuFlyby {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.maps = listMaps().filter((m) => m.ready !== false);
    this.root = document.getElementById('menu-root');
    this.fade = document.getElementById('menu-fade');
    this.sched = new FlybySchedule(this.maps.length, Math.floor(Math.random() * this.maps.length));
    this.active = false;
    this.cur = null;     // { level, cine }
    this.nextBuilt = null;
    this._token = 0;
    this._swapNow = false;
  }

  get scene() { return this.active && this.cur ? this.cur.level.scene : null; }

  async _build(map, token) {
    try {
      const loaded = await loadAssets(map.assets);
      if (token !== this._token) return null;
      const level = map.createLevel(loaded);
      level.setSkyBlend?.(1); // fly-through shows the final sky
      const col = level.collision;
      const cine = new CinematicCamera({ bounds: col?.bounds ?? { minX: -30, maxX: 30, minY: 0, maxY: 5, minZ: -30, maxZ: 30 }, world: col ?? null });
      return { level, cine };
    } catch (e) {
      console.warn('[menu-flyby] could not build', map.id, e);
      return null;
    }
  }

  _show(built) {
    this.cur = built;
    this.root.classList.add('flyby');
  }

  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this._token++;
    if (on) {
      const token = this._token;
      this._build(this.maps[this.sched.index], token).then((b) => { if (b && token === this._token) this._show(b); });
    } else {
      this.cur?.level.dispose();
      this.nextBuilt?.level.dispose();
      this.cur = this.nextBuilt = null;
      this.root.classList.remove('flyby');
    }
  }

  update(dt) {
    if (!this.active || !this.cur) return;
    const c = this.cur.cine.update(dt);
    this.camera.position.set(...c.position);
    this.camera.lookAt(...c.target);
    this.camera.updateMatrixWorld();
    this.cur.level.update(dt, this.camera);
    this.sched.tick(dt);
    if (this.sched.shouldPreload && !this.nextBuilt && !this._loadingNext) {
      this._loadingNext = true;
      const token = this._token;
      this._build(this.maps[this.sched.next], token).then((b) => {
        this._loadingNext = false;
        if (token !== this._token) b?.level.dispose();
        else if (b) this.nextBuilt = b;
        else this.sched.advance(); // skip a map that cannot load
      });
    }
    if (this.sched.canSwitch(!!this.nextBuilt)) this._swapNow = true;
  }

  // Call right after the frame was rendered: snapshots it and swaps maps under a fading overlay.
  afterRender() {
    if (!this._swapNow) return;
    this._swapNow = false;
    const src = this.renderer.domElement, f = this.fade;
    f.width = src.width; f.height = src.height;
    f.getContext('2d').drawImage(src, 0, 0);
    f.style.transition = 'none';
    f.style.opacity = '1';
    const old = this.cur;
    this.cur = this.nextBuilt;
    this.nextBuilt = null;
    this.sched.advance();
    void f.offsetWidth;
    f.style.transition = `opacity ${FADE_MS}ms ease`;
    f.style.opacity = '0';
    setTimeout(() => old.level.dispose(), FADE_MS + 200);
  }
}
