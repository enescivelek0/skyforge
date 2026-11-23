import * as THREE from 'three';
import { heightAt, WATER_LEVEL, WORLD_LIMIT } from './terrain';
import { boxes, trees, gates } from './worldData';

export type FlightMode = 'angle' | 'acro';
export interface Inputs { throttle: number; throttleAbs: number; yaw: number; pitch: number; roll: number }

/** Physical parameters of a ~1.2 kg quad with a camera payload. */
export const P = {
  mass: 1.2,
  g: 9.81,
  arm: 0.18,
  motorMax: 8.5, // N per motor (TWR ≈ 2.9)
  motorTau: 0.035, // spin-up time constant (s)
  yawK: 0.06, // reaction torque per N of thrust
  I: new THREE.Vector3(0.014, 0.024, 0.014),
  dragLin: 0.06,
  dragQuad: 0.032,
  angDrag: 0.02,
  maxTilt: THREE.MathUtils.degToRad(38),
  angleRate: 3.0,
  acroRate: 8.0,
  climbRate: 6.0,
  batteryWh: 22,
  skid: 0.08,
};

const a = P.arm * Math.SQRT1_2;
// Motor layout (body: +x right, +y up, -z forward): FR, FL, BR, BL
const MOTORS = [
  { x: a, z: -a, s: 1 },
  { x: -a, z: -a, s: -1 },
  { x: a, z: a, s: -1 },
  { x: -a, z: a, s: 1 },
];

export const state = {
  pos: new THREE.Vector3(),
  vel: new THREE.Vector3(),
  q: new THREE.Quaternion(),
  w: new THREE.Vector3(), // body angular velocity
  motors: [0, 0, 0, 0],
  battery: 1,
  crashed: false,
  crashReason: '',
  grounded: true,
  armed: false,
  flightTime: 0,
  gateIndex: 0,
  lap: 0,
  lapStart: 0,
  bestLap: 0,
  lastLap: 0,
  wind: new THREE.Vector3(),
  agl: 0,
};

const PAD_TOP = 0.2;

export function resetSim() {
  state.pos.set(0, PAD_TOP + P.skid, 0);
  state.vel.set(0, 0, 0);
  state.q.identity();
  state.w.set(0, 0, 0);
  state.motors = [0, 0, 0, 0];
  state.battery = 1;
  state.crashed = false;
  state.crashReason = '';
  state.grounded = true;
  state.armed = false;
  state.flightTime = 0;
  state.gateIndex = 0;
  state.lap = 0;
  state.lapStart = 0;
  state.lastLap = 0;
}
resetSim();

// ---- tree spatial hash for collision ----
const CELL = 20;
const treeGrid = new Map<string, typeof trees>();
for (const t of trees) {
  const key = `${Math.floor(t.x / CELL)},${Math.floor(t.z / CELL)}`;
  let arr = treeGrid.get(key);
  if (!arr) treeGrid.set(key, (arr = []));
  arr.push(t);
}

// scratch objects
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _f = new THREE.Vector3();
const _rate = new THREE.Vector3(), _tau = new THREE.Vector3(), _Iw = new THREE.Vector3();
const _qd = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _dq = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ'), _up = new THREE.Vector3();
const _prevPos = new THREE.Vector3();
let gustT = 0;

function crash(reason: string) {
  state.crashed = true;
  state.crashReason = reason;
  state.motors = [0, 0, 0, 0];
}

export function step(dt: number, inp: Inputs, mode: FlightMode, windStrength: number, windDir: number) {
  const s = state;
  if (s.crashed) return;
  _prevPos.copy(s.pos);

  if (!s.armed && (inp.throttle > 0.15 || (mode === 'acro' && inp.throttleAbs > 0.1))) s.armed = true;

  // ---------- wind with gusts ----------
  gustT += dt;
  const gust = 1 + 0.35 * Math.sin(gustT * 0.7) * Math.sin(gustT * 1.9 + 1) + 0.15 * Math.sin(gustT * 5.3);
  const altFactor = Math.min(1.6, 0.6 + Math.max(0, s.agl) / 40);
  s.wind
    .set(Math.cos(windDir), 0.05 * Math.sin(gustT * 2.1), Math.sin(windDir))
    .multiplyScalar(windStrength * gust * altFactor);

  // ---------- flight controller ----------
  _e.setFromQuaternion(s.q, 'YXZ');
  if (mode === 'angle') {
    _e.set(-inp.pitch * P.maxTilt, _e.y, -inp.roll * P.maxTilt, 'YXZ');
    _qd.setFromEuler(_e);
    _qe.copy(s.q).invert().multiply(_qd);
    if (_qe.w < 0) { _qe.x *= -1; _qe.y *= -1; _qe.z *= -1; _qe.w *= -1; }
    _rate.set(_qe.x, _qe.y, _qe.z).multiplyScalar(2 * 8.0);
    _rate.y = -inp.yaw * P.angleRate;
  } else {
    _rate.set(-inp.pitch * P.acroRate, -inp.yaw * P.acroRate * 0.6, -inp.roll * P.acroRate);
  }
  const kr = 22;
  const cmdTx = P.I.x * kr * (_rate.x - s.w.x);
  const cmdTy = P.I.y * kr * 0.8 * (_rate.y - s.w.y);
  const cmdTz = P.I.z * kr * (_rate.z - s.w.z);

  _up.set(0, 1, 0).applyQuaternion(s.q);
  // battery sag: available thrust falls off when the pack is low
  const sag = s.battery <= 0 ? 0 : 0.72 + 0.28 * Math.min(1, s.battery / 0.25);
  const motorMax = P.motorMax * sag;

  let T: number;
  if (!s.armed) T = 0;
  else if (mode === 'angle') {
    const cosT = Math.max(0.45, _up.y);
    T = (P.mass * (P.g + (inp.throttle * P.climbRate - s.vel.y) * 2.4)) / cosT;
  } else {
    T = inp.throttleAbs * 4 * motorMax;
  }
  T = THREE.MathUtils.clamp(T, 0, 4 * motorMax);
  const lockAttitude = s.grounded && T < P.mass * P.g * 0.5;

  // ---------- motor mixer with saturation & spin-up lag ----------
  const a2 = 4 * a * a;
  let Ttot = 0, tx = 0, ty = 0, tz = 0, power = 0;
  for (let i = 0; i < 4; i++) {
    const m = MOTORS[i];
    let cmd = T / 4;
    if (!lockAttitude) cmd += (cmdTx * -m.z) / a2 + (cmdTz * m.x) / a2 + (cmdTy * m.s) / (4 * P.yawK);
    cmd = s.armed ? THREE.MathUtils.clamp(cmd, T > 0.5 ? 0.15 : 0, motorMax) : 0;
    const f = s.motors[i] + (cmd - s.motors[i]) * Math.min(1, dt / P.motorTau);
    s.motors[i] = f;
    Ttot += f;
    tx += -m.z * f; tz += m.x * f; ty += m.s * P.yawK * f;
    power += Math.pow(f, 1.5) * 4.2; // W, rough prop power curve
  }

  // ground effect
  if (s.agl < 0.6) Ttot *= 1 + 0.12 * (1 - Math.max(0, s.agl) / 0.6);

  // ---------- translational dynamics ----------
  _f.set(0, Ttot, 0).applyQuaternion(s.q);
  _f.y -= P.mass * P.g;
  _v.copy(s.vel).sub(s.wind);
  const sp = _v.length();
  const broad = sp > 1e-4 ? 1 + 0.6 * Math.abs(_v2.copy(_v).divideScalar(sp).dot(_up)) : 1;
  _f.addScaledVector(_v, -(P.dragLin + P.dragQuad * sp) * broad);
  s.vel.addScaledVector(_f, dt / P.mass);
  s.pos.addScaledVector(s.vel, dt);

  // ---------- rotational dynamics ----------
  _tau.set(tx, ty, tz);
  _Iw.set(P.I.x * s.w.x, P.I.y * s.w.y, P.I.z * s.w.z);
  _tau.sub(_v.copy(s.w).cross(_Iw)).addScaledVector(s.w, -P.angDrag);
  s.w.x += (_tau.x / P.I.x) * dt;
  s.w.y += (_tau.y / P.I.y) * dt;
  s.w.z += (_tau.z / P.I.z) * dt;
  const wl = s.w.length();
  if (wl > 1e-6) {
    _dq.setFromAxisAngle(_v.copy(s.w).divideScalar(wl), wl * dt);
    s.q.multiply(_dq).normalize();
  }

  // ---------- battery ----------
  if (s.armed) {
    s.battery = Math.max(0, s.battery - ((power + 6) * dt) / 3600 / P.batteryWh);
    s.flightTime += dt;
  }

  // ---------- collisions ----------
  let ground = heightAt(s.pos.x, s.pos.z);
  s.grounded = false;
  for (const b of boxes) {
    if (Math.abs(s.pos.x - b.x) < b.w / 2 + 0.1 && Math.abs(s.pos.z - b.z) < b.d / 2 + 0.1) {
      const top = b.base + b.h;
      if (s.pos.y - P.skid < top && s.pos.y > b.base - 0.2) {
        if (_prevPos.y - P.skid >= top - 0.05) ground = Math.max(ground, top);
        else if (s.vel.length() > 2.5) return crash('Bir yapıya çarptın');
        else { s.pos.x = _prevPos.x; s.pos.z = _prevPos.z; s.vel.x *= -0.3; s.vel.z *= -0.3; }
      }
    }
  }
  const cell = treeGrid.get(`${Math.floor(s.pos.x / CELL)},${Math.floor(s.pos.z / CELL)}`);
  if (cell) for (const t of cell) {
    const dx = s.pos.x - t.x, dz = s.pos.z - t.z, hy = s.pos.y - t.y;
    const height = 9 * t.s;
    if (hy > 0 && hy < height) {
      const trunk = 2.2 * t.s;
      const r = (hy < trunk ? 0.35 * t.s : 2.6 * t.s * (1 - (hy - trunk) / (height - trunk))) + 0.15;
      if (dx * dx + dz * dz < r * r) return crash('Ağaca çarptın');
    }
  }
  if (s.pos.y < WATER_LEVEL + 0.05 && heightAt(s.pos.x, s.pos.z) < WATER_LEVEL) return crash('Suya düştün');

  s.agl = s.pos.y - P.skid - ground;
  if (s.agl <= 0) {
    const impact = -s.vel.y;
    const horiz = Math.hypot(s.vel.x, s.vel.z);
    if (impact > 5 || horiz > 8 || (_up.y < 0.55 && (impact > 1.5 || horiz > 2))) return crash('Sert iniş: gövde hasar gördü');
    s.pos.y = ground + P.skid;
    s.agl = 0;
    if (s.vel.y < 0) s.vel.y = 0;
    const fr = Math.pow(0.002, dt);
    s.vel.x *= fr; s.vel.z *= fr;
    s.grounded = true;
    if (Ttot < P.mass * P.g * 0.9) {
      _e.setFromQuaternion(s.q, 'YXZ');
      _qd.setFromEuler(_e.set(0, _e.y, 0, 'YXZ'));
      s.q.slerp(_qd, Math.min(1, dt * 12));
      s.w.multiplyScalar(Math.pow(0.001, dt));
    }
  }

  // soft world boundary
  const d = Math.hypot(s.pos.x, s.pos.z);
  if (d > WORLD_LIMIT) {
    s.pos.x *= WORLD_LIMIT / d; s.pos.z *= WORLD_LIMIT / d;
    s.vel.x *= -0.2; s.vel.z *= -0.2;
  }
  if (s.pos.y > 600) { s.pos.y = 600; s.vel.y = Math.min(0, s.vel.y); }

  // ---------- gate checks ----------
  const gt = gates[s.gateIndex];
  _v.set(s.pos.x - gt.x, s.pos.y - gt.y, s.pos.z - gt.z);
  if (_v.length() < gt.r) {
    if (s.gateIndex === 0) {
      if (s.lap > 0) {
        s.lastLap = s.flightTime - s.lapStart;
        if (!s.bestLap || s.lastLap < s.bestLap) {
          s.bestLap = s.lastLap;
          try { localStorage.setItem('skyforge.bestLap', String(s.bestLap)); } catch { /* ignore */ }
        }
      }
      s.lapStart = s.flightTime;
      s.lap++;
    }
    s.gateIndex = (s.gateIndex + 1) % gates.length;
  }
}

try {
  const b = Number(localStorage.getItem('skyforge.bestLap'));
  if (b > 0) state.bestLap = b;
} catch { /* ignore */ }
