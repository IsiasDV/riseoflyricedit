// DOM control for the match start sequence: countdown, loading screen, and the
// black/fade layer. Pure presentation; GameSession decides the timing/order.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
import { listMaps } from '../maps/maps.js';
import { MapIntro } from './map-intro.js';
import { gameVolume } from '../state/settings.js';
const HIDDEN = 'ui-hidden';

export class MatchScreens {
  constructor() {
    this.countdown = document.getElementById('match-countdown');
    this.countdownNum = document.getElementById('match-countdown-number');
    this.countdownMap = document.getElementById('match-countdown-map');
    this.loading = document.getElementById('map-loading');
    this.loadingTitle = document.getElementById('map-loading-title');
    this.barFill = document.getElementById('map-loading-bar-fill');
    this.fade = document.getElementById('screen-fade');
    this.intro = new MapIntro();
    this._cdRaf = 0;
    this._cdResolve = null;
    // Preload loading-screen audio so it plays with no delay.
    this._audioCache = new Map();
    for (const m of listMaps()) if (m.loadingAudio) this._getAudio(m.loadingAudio);
  }

  _getAudio(url) {
    let a = this._audioCache.get(url);
    if (!a) {
      a = new Audio(url);
      a.preload = 'auto';
      a.loop = true;
      a.load();
      this._audioCache.set(url, a);
    }
    return a;
  }

  // Animated countdown. Resolves true when finished, false if cancelled.
  showCountdown(durationMs, mapName) {
    this.cancelCountdown();
    this.countdownMap.textContent = mapName.toUpperCase();
    this.countdown.classList.remove(HIDDEN);
    const end = performance.now() + durationMs;
    let shown = null;
    return new Promise((resolve) => {
      this._cdResolve = resolve;
      const tick = (now) => {
        const remaining = end - now;
        if (remaining <= 0) {
          this._cdRaf = 0;
          this._cdResolve = null;
          resolve(true);
          return;
        }
        const n = Math.ceil(remaining / 1000);
        if (n !== shown) {
          shown = n;
          this.countdownNum.textContent = n;
          this.countdownNum.classList.remove('pop');
          void this.countdownNum.offsetWidth; // restart the CSS animation
          this.countdownNum.classList.add('pop');
        }
        this._cdRaf = requestAnimationFrame(tick);
      };
      this._cdRaf = requestAnimationFrame(tick);
    });
  }

  cancelCountdown() {
    if (this._cdRaf) cancelAnimationFrame(this._cdRaf);
    this._cdRaf = 0;
    if (this._cdResolve) { this._cdResolve(false); this._cdResolve = null; }
    this.countdown.classList.add(HIDDEN);
  }

  showLoading(map) {
    this.loadingTitle.textContent = map.name;
    this.loading.style.backgroundImage = '';
    if (map.loadingBackground) {
      // Only apply once it exists, so the gradient fallback shows otherwise.
      const img = new Image();
      img.onload = () => { this.loading.style.backgroundImage = `url('${map.loadingBackground}')`; };
      img.src = map.loadingBackground;
    }
    this.setProgress(0);
    this.loading.classList.remove(HIDDEN);
    this._startLoadingAudio(map.loadingAudio);
  }

  // Starts the map loading music (no-op if already playing); used before the intro cutscene.
  startLoadingAudio(map) { this._startLoadingAudio(map.loadingAudio); }

  playIntro(map, opts) { return this.intro.play({ url: map.intro.video, blackHoldMs: map.intro.blackHoldMs, fadeMs: map.intro.fadeMs, ...opts }); }

  // Looping loading-screen audio; stopped by hideLoading().
  _startLoadingAudio(url) {
    if (!url) return;
    if (this._loadingAudio !== this._getAudio(url)) {
      this._loadingAudio?.pause();
      this._loadingAudio = this._getAudio(url);
    }
    if (!this._loadingAudio.paused) return; // already playing (e.g. repeated showLoading)
    this._loadingAudio.currentTime = 0;
    this._loadingAudio.volume = gameVolume();
    this._loadingAudio.play().catch(() => { /* autoplay blocked; ignore */ });
  }

  _stopLoadingAudio() {
    if (!this._loadingAudio) return;
    this._loadingAudio.pause();
    this._loadingAudio.currentTime = 0;
  }

  setProgress(p) {
    this.barFill.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
  }

  // keepAudio: hand the loading track over as in-game BGM (plays out once, then ends).
  hideLoading({ keepAudio = false } = {}) {
    this.loading.classList.add(HIDDEN);
    if (keepAudio && this._loadingAudio && !this._loadingAudio.paused) {
      this._matchBgm = this._loadingAudio;
      this._matchBgm.loop = true; // keeps looping for the whole match
      this._loadingAudio = null;
    } else {
      this._stopLoadingAudio();
    }
  }

  applyVolume() {
    const v = gameVolume();
    if (this._loadingAudio) this._loadingAudio.volume = v;
    if (this._matchBgm) this._matchBgm.volume = v;
  }

  pauseMatchBgm() { this._matchBgm?.pause(); }
  resumeMatchBgm() { const a = this._matchBgm; if (a?.paused) a.play().catch(() => { /* blocked; ignore */ }); }

  stopMatchBgm() {
    if (!this._matchBgm) return;
    this._matchBgm.pause();
    this._matchBgm.currentTime = 0;
    this._matchBgm.loop = true; // cached element is reused by the next loading screen
    this._matchBgm = null;
  }

  // Instant cut to a solid black screen.
  blackOut() {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = '1';
    this.fade.classList.remove(HIDDEN);
  }

  async fadeIn(ms) {
    void this.fade.offsetWidth;
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.opacity = '0';
    await wait(ms);
    this.fade.classList.add(HIDDEN);
  }

  async fadeOut(ms) {
    this.fade.style.transition = 'none';
    this.fade.style.opacity = '0';
    this.fade.classList.remove(HIDDEN);
    void this.fade.offsetWidth;
    this.fade.style.transition = `opacity ${ms}ms ease`;
    this.fade.style.opacity = '1';
    await wait(ms);
  }

  hideAll() {
    this.intro.cancel();
    this.stopMatchBgm();
    this.cancelCountdown();
    this.hideLoading();
    this.fade.classList.add(HIDDEN);
  }
}
