// "Rise of Lyric" NPC teammate (pure; used by the server per lobby and locally in singleplayer).
// Follows the nearest living player, shoots the nearest visible enemy, and chats now and then.
export const LYRIC_MS = 90000;
export const LYRIC_NAME = 'Lyric';
export const LYRIC_JOIN = 'Rise of Lyric! Lyric has joined the team for 90 seconds!';
export const LYRIC_LEAVE = "Time's up! Lyric is out. Good luck, team!";
export const LYRIC_LINES = [
  'Stay behind me!',
  'Beh? More like Meh.',
  "I've got your back!",
  'Rise of Lyric, baby!',
  'Reloading is for the weak.',
  'Watch out, behind you!',
  'Nice shot! Mine was better, though.',
  'They keep coming... good.',
  '90 seconds is a long time to be this awesome.',
  'Anyone else hear that laughing?',
  'I should get moving... oh wait, I already am.',
  'Teamwork makes the dream work!',
  'Is that all they have?',
  "Don't mind me, just carrying the team.",
  'Left! No, your other left!',
  'I was born for this.',
  'Somebody tell Beh I said hi.',
  'Who needs a gun? Oh wait, I have one.',
  "That one's got my name on it.",
  "Keep moving, I'll keep shooting!",
  'Another one down. I lost count.',
  'You are welcome, by the way.',
  "I'd high-five you but I'm busy being legendary.",
  'Careful, they flank!',
  'Cover me while I look cool.',
  "Is it just me or are they getting uglier?",
  'Round after round, still standing.',
  'Lyric to the rescue!',
  'Do not let them surround you!',
  'This is my kind of party.',
  'Ammo? Never heard of her.',
  'I could do this all day. Well, 90 seconds.'
];
// Lines tied to the time left (spoken once each, when the remaining time first drops below `at` seconds).
export const LYRIC_TIMED = [
  { at: 60, text: 'One minute left. Make it count!' },
  { at: 30, text: 'Thirty seconds left. Let us finish strong!' },
  { at: 10, text: 'Ten seconds! It has been an honor.' }
];

const FOLLOW_MIN = 2.5;
const FOLLOW_MAX = 4;
const SPEED = 5.5;
const FIRE_GAP = 0.7;
const RANGE = 40;
const EYE = 1.4;

export class LyricNpc {
  constructor({ x, y, z, world = null, rng = Math.random }) {
    this.x = x; this.y = y; this.z = z;
    this.yaw = 0;
    this.world = world;
    this.rng = rng;
    this.ttl = LYRIC_MS / 1000;
    this.fireCd = 0.5;
    this.chatCd = 3 + rng() * 3;
    this.lastLine = -1;
    this.timed = new Set();
  }

  get done() { return this.ttl <= 0; }

  // players: [{id,x,y,z,down}] feet positions; targets: enemy hit spheres [{id,x,y,z,r}].
  // Returns { fire: [{origin, dir}], chat: [text] }.
  update(dt, players, targets) {
    const out = { fire: [], chat: [] };
    this.ttl -= dt;
    this.fireCd -= dt;
    this.chatCd -= dt;

    let follow = null, fd = Infinity;
    for (const p of players) {
      if (p.down) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < fd) { fd = d; follow = p; }
    }
    if (follow && fd > FOLLOW_MAX) {
      const k = Math.min(1, (SPEED * dt) / fd);
      this.x += (follow.x - this.x) * k;
      this.z += (follow.z - this.z) * k;
      this.yaw = Math.atan2(-(follow.x - this.x), -(follow.z - this.z));
    } else if (follow && fd < FOLLOW_MIN) {
      const k = (SPEED * 0.5 * dt) / Math.max(fd, 0.1);
      this.x -= (follow.x - this.x) * k;
      this.z -= (follow.z - this.z) * k;
    }
    const g = this.world?.groundAt(this.x, this.z, this.y + 1.5, 4);
    if (g) this.y = g.y;
    else if (follow) this.y = follow.y;

    // Nearest enemy within range and line of sight.
    const ox = this.x, oy = this.y + EYE, oz = this.z;
    let best = null, bd = RANGE;
    for (const t of targets || []) {
      const d = Math.hypot(t.x - ox, t.y - oy, t.z - oz);
      if (d >= bd) continue;
      if (this.world && this.world.raycast(ox, oy, oz, (t.x - ox) / d, (t.y - oy) / d, (t.z - oz) / d, Math.max(0, d - t.r)) !== null) continue;
      best = t; bd = d;
    }
    if (best) {
      this.yaw = Math.atan2(-(best.x - ox), -(best.z - oz));
      if (this.fireCd <= 0) {
        this.fireCd = FIRE_GAP;
        const s = 0.03;
        let dx = (best.x - ox) / bd + (this.rng() - 0.5) * s;
        let dy = (best.y - oy) / bd + (this.rng() - 0.5) * s;
        let dz = (best.z - oz) / bd + (this.rng() - 0.5) * s;
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l; dy /= l; dz /= l;
        out.fire.push({ origin: [ox, oy, oz], dir: [dx, dy, dz] });
      }
    }

    for (const t of LYRIC_TIMED) {
      if (this.ttl <= t.at && this.ttl > 1 && !this.timed.has(t.at)) { this.timed.add(t.at); out.chat.push(t.text); this.chatCd = 6 + this.rng() * 4; }
    }
    if (this.chatCd <= 0 && this.ttl > 1) {
      this.chatCd = 6 + this.rng() * 4;
      let i = Math.floor(this.rng() * LYRIC_LINES.length);
      if (i === this.lastLine) i = (i + 1) % LYRIC_LINES.length; // never the same line twice in a row
      this.lastLine = i;
      out.chat.push(LYRIC_LINES[i]);
    }
    return out;
  }

  snapshot() { return { x: this.x, y: this.y, z: this.z, yaw: this.yaw }; }
}
