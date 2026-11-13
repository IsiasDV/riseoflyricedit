// Shared prop builder for maps whose MAP_DATA defines barrier / teleporters / machines (Choco, Endless Shot, ...).
// getCollision(): the level's CollisionWorld (the barrier is its gate).
import { createTeleporter, createColorMachine, createPowerupMachine, createBarrier } from './props.js';
import { costOf } from '../game/interactions.js';

export function createMapProps({ data, mapId, getCollision }) {
  const props = [];
  const interactables = [];
  const state = { barrierOpen: false, linked: false };
  const near = (at, extra) => ({ x: at[0], y: at[1], z: at[2], radius: 2.2, ...extra });

  if (data.barrier) {
    const wall = createBarrier(data.barrier.min, data.barrier.max);
    props.push(wall);
    const cost = costOf(mapId, 'barrier');
    const [bx, by, bz] = [(data.barrier.min[0] + data.barrier.max[0]) / 2, data.barrier.min[1], (data.barrier.min[2] + data.barrier.max[2]) / 2];
    interactables.push({ id: 'barrier', kind: 'barrier', x: bx, y: by, z: bz, radius: 4.2, prompt: 'UNLOCK BARRIER', cost,
      gone: () => state.barrierOpen, describe: () => ({ text: `[E] UNLOCK BARRIER - ${cost} PTS`, need: cost }) });
    state.wall = wall;
  }
  if (data.teleporters) {
    const { a, b } = data.teleporters;
    const cost = costOf(mapId, 'tpA');
    const ta = createTeleporter(a, { color: 0x6fd2ff });
    const tb = createTeleporter(b, { color: 0xff6ad5 });
    ta.setLinked(false); tb.setLinked(false);
    props.push(ta, tb);
    state.pads = [ta, tb];
    interactables.push(
      near(a, { id: 'tpA', kind: 'tpA', prompt: 'TELEPORTER A', cost, to: b,
        describe: () => (state.linked ? { text: `[E] TELEPORT TO B - ${cost} PTS`, need: cost } : { text: 'TELEPORTER A - LINK IT AT TELEPORTER B FIRST', blocked: true }) }),
      near(b, { id: 'tpB', kind: 'tpB', prompt: 'TELEPORTER B', cost, to: a,
        describe: () => (state.linked ? { text: `[E] TELEPORT TO A - ${cost} PTS`, need: cost } : { text: '[E] LINK TELEPORTERS - FREE', need: 0 }) })
    );
  }
  if (data.colorMachine) {
    const m = createColorMachine(data.colorMachine.at);
    props.push(m);
    interactables.push(near(data.colorMachine.at, { id: 'colorMachine', kind: 'colorMachine', prompt: 'BULLET COLOR MACHINE', cost: costOf(mapId, 'colorMachine'), machine: m }));
  }
  if (data.powerupMachine) {
    const s = createPowerupMachine(data.powerupMachine.at);
    props.push(s);
    interactables.push(near(data.powerupMachine.at, { id: 'spin', kind: 'spin', prompt: 'POWERUP MACHINE', cost: costOf(mapId, 'spin'), machine: s }));
  }
  if (data.lyricMachine) {
    const s = createPowerupMachine(data.lyricMachine.at);
    props.push(s);
    interactables.push(near(data.lyricMachine.at, { id: 'lyricMachine', kind: 'lyricMachine', prompt: 'RISE OF LYRIC', cost: costOf(mapId, 'lyricMachine'), machine: s }));
  }
  return {
    props, interactables, state,
    setBarrierOpen(open = true) {
      state.barrierOpen = open;
      getCollision()?.setGateOpen(open);
      if (open) state.wall?.open();
    },
    setLinked(on = true) {
      state.linked = on;
      state.pads?.forEach((p) => p.setLinked(on));
    }
  };
}
