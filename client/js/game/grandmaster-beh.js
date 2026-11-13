// Grandmaster Beh's taunts for the Choco-rocklate Gladiator Arena (pure; shared by server + singleplayer).
export const BEH_NAME = 'Grandmaster Beh';

export const LINES = {
  idle: [
    "Run along, little gladiators. The arena has seen braver fools than you.",
    "Oh, you're still standing? How adorable, gladiators.",
    "Do keep swinging, gladiators. It makes your defeat so much more entertaining.",
    "I'd wish you luck, gladiators, but luck is for those with a chance.",
    "Such enthusiasm! Such a shame it won't save you.",
    "The false prophecy promised a champion. Clearly it never met you lot.",
    "Is that your best, gladiators? Truly? I was prepared to be impressed.",
    "Take your time, gladiators. The Behs are very patient. And very unfair.",
    "Don't worry, gladiators. Falling down is practically a tradition here.",
    "You hold that weapon so bravely. Bless your hearts.",
    "Every gladiator thinks they're the exception. Every gladiator is wrong.",
    "The crowd is cheering, gladiators. Well, the Behs are. For your downfall.",
    "Look at you all, scurrying about. I could watch this all eon.",
    "Courage is cute, gladiators. Survival is better. You'll find neither."
  ],
  round: [
    "Round {round}, little gladiators. Try not to cry.",
    "Round {round} already? I do admire your stubbornness, gladiators.",
    "Round {round} begins. Do try to last longer than the last gladiators.",
    "Oh, round {round}. This is where the fun, and your fear, begins.",
    "Round {round}, gladiators. Say goodbye to your confidence."
  ],
  down: [
    "{name} has fallen. How predictable.",
    "And {name} hits the floor. Gladiators, take notes.",
    "Poor {name}. I did warn you the Behs weren't fair.",
    "Down goes {name}! Somebody fetch them a pillow.",
    "{name}, darling, the ground is not where gladiators are meant to be."
  ],
  over: [
    "Pathetic. Even the prophecy is embarrassed for you, gladiators.",
    "And so the gladiators fall, exactly as I foretold. Run along now.",
    "Defeated again. I'd say I'm surprised, but I'd be lying."
  ]
};

const HIST = 4;

export class Taunter {
  constructor({ rng = Math.random, firstDelayMs = 30000, minMs = 40000, maxMs = 80000 } = {}) {
    this.rng = rng;
    this.minMs = minMs; this.maxMs = maxMs;
    this.t = firstDelayMs / 1000;
    this.cool = 0;
    this.recent = [];
  }

  _next() { return (this.minMs + this.rng() * (this.maxMs - this.minMs)) / 1000; }

  _pick(pool, vars = {}) {
    const fresh = pool.filter((l) => !this.recent.includes(l));
    const list = fresh.length ? fresh : pool;
    const line = list[Math.floor(this.rng() * list.length)];
    this.recent.push(line);
    if (this.recent.length > HIST) this.recent.shift();
    return line.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  }

  // Random idle taunt; returns text or null.
  update(dt) {
    this.cool = Math.max(0, this.cool - dt);
    this.t -= dt;
    if (this.t > 0) return null;
    this.t = this._next();
    this.cool = 8;
    return this._pick(LINES.idle);
  }

  onRound(round) {
    if (round < 2 || this.cool > 0 || this.rng() >= 0.5) return null;
    this.cool = 12;
    return this._pick(LINES.round, { round });
  }

  onDown(name) {
    if (this.cool > 0 || this.rng() >= 0.35) return null;
    this.cool = 20;
    return this._pick(LINES.down, { name });
  }

  onGameOver() { return this._pick(LINES.over); }
}
