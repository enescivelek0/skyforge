import { heightAt, rng, WATER_LEVEL } from './terrain';

export interface Box { x: number; z: number; w: number; d: number; h: number; base: number; color: string }

/** Static obstacles (axis-aligned boxes) — rendered and collided against. */
export const boxes: Box[] = [
  { x: 0, z: 0, w: 3, d: 3, h: 0.2, base: 0, color: '#2b2f36' }, // landing pad
  { x: -28, z: -10, w: 18, d: 24, h: 9, base: 0, color: '#8a9099' }, // hangar
  { x: 26, z: -18, w: 6, d: 6, h: 22, base: 0, color: '#c9ccd1' }, // control tower
  { x: 26, z: -18, w: 9, d: 9, h: 4, base: 22, color: '#3d5a73' }, // tower cab
  { x: 30, z: 18, w: 14, d: 8, h: 5, base: 0, color: '#a39a8a' },
  { x: -20, z: 30, w: 8, d: 8, h: 7, base: 0, color: '#8f7f6d' },
  { x: 0, z: -60, w: 4, d: 40, h: 0.05, base: 0, color: '#3a3d42' }, // runway strip
];

export interface Gate { x: number; y: number; z: number; yaw: number; r: number }

/** A loose racing circuit of rings around the airfield. */
export const gates: Gate[] = (() => {
  const g: Gate[] = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rad = 120 + Math.sin(a * 3) * 45;
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
    const y = Math.max(heightAt(x, z), WATER_LEVEL) + 6 + Math.sin(a * 2) * 4 + 4;
    g.push({ x, y, z, yaw: -a, r: 3.2 });
  }
  return g;
})();

export interface Tree { x: number; y: number; z: number; s: number }

export const trees: Tree[] = (() => {
  const t: Tree[] = [];
  let tries = 0;
  while (t.length < 2200 && tries < 20000) {
    tries++;
    const x = (rng() - 0.5) * 1400, z = (rng() - 0.5) * 1400;
    if (Math.hypot(x, z) < 80) continue;
    const y = heightAt(x, z);
    if (y < WATER_LEVEL + 1.5 || y > 70) continue;
    t.push({ x, y, z, s: 0.7 + rng() * 0.8 });
  }
  return t;
})();
