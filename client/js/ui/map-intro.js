// Intro cutscene shown before a map's loading screen (maps with `intro`).
// black -> wait until the video can play through -> fade into the (always muted) video
// -> end/skip -> black hold -> reveal the loading screen underneath while the cover fades out.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const CAN_PLAY_TIMEOUT_MS = 12000;

export class MapIntro {
  constructor() {
    this.cover = document.getElementById('map-intro');
    this.video = document.getElementById('map-intro-video');
    this.hint = document.getElementById('map-intro-hint');
    this._gen = 0;
    this._active = null; // { finish(reason), vote(), setVotes(n,total) }
  }

  get isActive() { return !!this._active; }

  setVotes(votes, total) { this._active?.setVotes(votes, total); }
  forceSkip() { this._active?.finish('skipped'); }
  cancel() { this._gen++; this._active?.finish('cancelled'); this.cover.classList.add('ui-hidden'); }

  // Resolves 'ended' | 'skipped' | 'failed' | 'cancelled'. The cover is left hidden afterwards.
  async play({ url, blackHoldMs = 2000, fadeMs = 1000, multi = false, revealLoading, sendVote }) {
    this.cancel();
    const gen = this._gen;
    const v = this.video, cover = this.cover, hint = this.hint;
    let total = 1, votes = 0, voted = false, done = false;
    let resolveEnd;
    const ended = new Promise((r) => { resolveEnd = r; });
    const timers = [];
    const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };

    const renderHint = () => {
      if (!multi) hint.textContent = 'Press ENTER to skip';
      else if (voted) hint.textContent = `Waiting for others to skip (${votes}/${total})`;
      else hint.textContent = `Press ENTER to skip (${votes}/${total})`;
    };
    const finish = (reason) => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      timers.forEach(clearTimeout);
      v.onended = v.onerror = null;
      resolveEnd(reason);
    };
    const onKey = (e) => {
      if (e.key !== 'Enter' || e.repeat || done) return;
      e.preventDefault();
      if (!multi) { finish('skipped'); return; }
      if (voted) return;
      voted = true;
      sendVote?.();
      renderHint();
    };
    this._active = {
      finish,
      setVotes: (n, t) => { votes = n; total = Math.max(1, t); renderHint(); }
    };

    // Instant black cover; the video stays invisible until it can play through.
    cover.style.transition = 'none';
    cover.style.opacity = '1';
    cover.classList.remove('ui-hidden');
    v.style.transition = 'none';
    v.style.opacity = '0';
    hint.style.opacity = '0';
    renderHint();
    window.addEventListener('keydown', onKey, true);

    v.muted = true; v.defaultMuted = true; v.volume = 0;
    v.playsInline = true; v.preload = 'auto'; v.loop = false;
    v.onerror = () => finish('failed');
    const canPlay = new Promise((r) => {
      v.addEventListener('canplaythrough', () => r(true), { once: true });
      later(() => r(false), CAN_PLAY_TIMEOUT_MS);
    });
    v.src = url;
    v.load();

    let reason;
    if (await canPlay && !done) {
      try {
        await v.play();
        void v.offsetWidth;
        v.style.transition = `opacity ${fadeMs}ms ease`;
        v.style.opacity = '1';
        hint.style.transition = `opacity ${fadeMs}ms ease`;
        hint.style.opacity = '0.45';
        v.onended = () => { if (multi && !voted) { voted = true; sendVote?.(); } finish('ended'); };
        const dur = Number.isFinite(v.duration) ? v.duration : 15;
        later(() => finish('ended'), (dur + 5) * 1000); // watchdog: a stalled video must not hang the match
        reason = await ended;
      } catch {
        reason = 'failed';
      }
    } else {
      reason = done ? await ended : 'failed';
    }
    done = true;
    window.removeEventListener('keydown', onKey, true);
    timers.forEach(clearTimeout);
    v.pause();
    v.onended = v.onerror = null;
    v.removeAttribute('src');
    v.load();
    hint.style.opacity = '0';
    v.style.opacity = '0';
    this._active = null;

    if (reason === 'cancelled' || gen !== this._gen) return 'cancelled';
    if (reason !== 'failed') await wait(blackHoldMs);
    if (gen !== this._gen) return 'cancelled';
    revealLoading?.();
    void cover.offsetWidth;
    cover.style.transition = `opacity ${fadeMs}ms ease`;
    cover.style.opacity = '0';
    await wait(fadeMs);
    if (gen !== this._gen) return 'cancelled';
    cover.classList.add('ui-hidden');
    return reason;
  }
}
