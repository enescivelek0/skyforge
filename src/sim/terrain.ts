import { createNoise2D } from 'simplex-noise';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(20261124);
const noise = createNoise2D(mulberry32(1337));

export const TERRAIN_SIZE = 1600;
export const WATER_LEVEL = -6;
export const WORLD_LIMIT = 760;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Deterministic terrain height — used by both the mesh and the physics. */
export function heightAt(x: number, z: number): number {
  let h = 0, amp = 1, freq = 1 / 380;
  for (let i = 0; i < 5; i++) {
    h += noise(x * freq, z * freq) * amp;
    amp *= 0.5; freq *= 2.03;
  }
  h *= 28;
  const d = Math.hypot(x, z);
  // mountain ring at the edge of the map
  const ridge = 1 - Math.abs(noise(x / 260, z / 260));
  h += smoothstep(380, 720, d) * ridge * ridge * 140;
  // flat airfield in the middle
  return h * smoothstep(70, 200, d);
}
