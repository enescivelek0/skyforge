import type { Inputs, FlightMode } from './physics';

const keys = new Set<string>();
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}

/** Touch / on-screen sticks write here (-1..1). */
export const virtualSticks = { active: false, throttle: 0, yaw: 0, pitch: 0, roll: 0 };

const sm = { throttle: 0, yaw: 0, pitch: 0, roll: 0 };
let kbThrottleAbs = 0;
export const inputInfo = { gamepad: '' };

const dz = (v: number, d = 0.06) => (Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d));
const expo = (v: number, e = 0.35) => v * (1 - e) + v * v * v * e;
const approach = (cur: number, target: number, rate: number, dt: number) => {
  const d = target - cur;
  const m = rate * dt;
  return Math.abs(d) < m ? target : cur + Math.sign(d) * m;
};
const k = (...codes: string[]) => codes.some((c) => keys.has(c));

export function readInputs(dt: number, mode: FlightMode): Inputs {
  const tT = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0);
  const tY = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
  const tP = (k('ArrowUp', 'KeyI') ? 1 : 0) - (k('ArrowDown', 'KeyK') ? 1 : 0);
  const tR = (k('ArrowRight', 'KeyL') ? 1 : 0) - (k('ArrowLeft', 'KeyJ') ? 1 : 0);
  const rate = mode === 'acro' ? 4 : 5;
  sm.throttle = approach(sm.throttle, tT, 4, dt);
  sm.yaw = approach(sm.yaw, tY, rate, dt);
  sm.pitch = approach(sm.pitch, tP, rate, dt);
  sm.roll = approach(sm.roll, tR, rate, dt);
  kbThrottleAbs = Math.min(1, Math.max(0, kbThrottleAbs + tT * 0.55 * dt));

  const out: Inputs = { throttle: sm.throttle, throttleAbs: kbThrottleAbs, yaw: sm.yaw, pitch: sm.pitch, roll: sm.roll };

  if (virtualSticks.active) {
    out.throttle = virtualSticks.throttle;
    out.throttleAbs = (virtualSticks.throttle + 1) / 2;
    out.yaw = expo(virtualSticks.yaw);
    out.pitch = expo(virtualSticks.pitch);
    out.roll = expo(virtualSticks.roll);
    kbThrottleAbs = out.throttleAbs;
  }

  // gamepad / USB RC transmitter (Mode 2 layout)
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads).find((p) => p && p.axes.length >= 4);
  inputInfo.gamepad = gp ? gp.id : '';
  if (gp) {
    const thr = -dz(gp.axes[1]);
    const g = { yaw: expo(dz(gp.axes[0])), roll: expo(dz(gp.axes[2])), pitch: expo(-dz(gp.axes[3])) };
    if (thr !== 0 || g.yaw || g.roll || g.pitch) {
      out.throttle = thr;
      out.throttleAbs = (thr + 1) / 2;
      kbThrottleAbs = out.throttleAbs;
      out.yaw = g.yaw; out.roll = g.roll; out.pitch = g.pitch;
    }
  }
  return out;
}
