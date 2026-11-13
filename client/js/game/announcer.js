// Global announcer voice heard by every player (not positional). One clip at a time: a new
// announcement waits for the current one to finish (at most 2 pending) so they never overlap.
import { gameVolume } from '../state/settings.js';

export const ANNOUNCER = {
  dead: 'assets/announcer/AnnounceDead.mp3',
  lyric: 'assets/announcer/AnnounceLyric.mp3',
  nuke: 'assets/announcer/AnnounceNuke.mp3'
};

export const announcerManifest = () => ({ audio: Object.values(ANNOUNCER) });

export class Announcer {
  // getAudio(url) -> HTMLAudioElement-like ({ play(), pause(), currentTime, addEventListener }) or null.
  constructor(getAudio) {
    this.getAudio = getAudio;
    this.queue = [];
    this.current = null;
  }

  say(key) {
    const url = ANNOUNCER[key];
    if (!url) return;
    if (this.current) { if (this.queue.length < 2) this.queue.push(url); return; }
    this._play(url);
  }

  _play(url) {
    const a = this.getAudio(url);
    if (!a) { this._next(); return; }
    this.current = a;
    const done = () => { if (this.current === a) { this.current = null; this._next(); } };
    a.addEventListener('ended', done, { once: true });
    a.addEventListener('error', done, { once: true });
    a.currentTime = 0;
    a.volume = gameVolume();
    const p = a.play();
    if (p && p.catch) p.catch(done); // autoplay blocked: skip it
  }

  _next() {
    const url = this.queue.shift();
    if (url) this._play(url);
  }

  applyVolume() { if (this.current) this.current.volume = gameVolume(); }

  stop() {
    this.queue = [];
    if (this.current) { this.current.pause(); this.current = null; }
  }
}
