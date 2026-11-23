import { create } from 'zustand';
import type { FlightMode } from './sim/physics';

export type CamMode = 'chase' | 'fpv' | 'orbit';

export interface Telemetry {
  alt: number; agl: number; speed: number; vspeed: number;
  heading: number; pitch: number; roll: number;
  battery: number; motors: number[]; thrustPct: number;
  time: number; dist: number; wind: number;
  crashed: boolean; crashReason: string; armed: boolean;
  gate: number; lap: number; lastLap: number; bestLap: number;
  gamepad: string;
}

interface Store {
  started: boolean;
  mode: FlightMode;
  cam: CamMode;
  wind: number; // m/s
  windDir: number; // rad
  quality: 'high' | 'low';
  showHelp: boolean;
  resetId: number;
  t: Telemetry;
  set: (p: Partial<Store>) => void;
  cycleCam: () => void;
  toggleMode: () => void;
  reset: () => void;
}

const cams: CamMode[] = ['chase', 'fpv', 'orbit'];

export const useStore = create<Store>((set, get) => ({
  started: false,
  mode: 'angle',
  cam: 'chase',
  wind: 3,
  windDir: 0.6,
  quality: 'high',
  showHelp: false,
  resetId: 0,
  t: {
    alt: 0, agl: 0, speed: 0, vspeed: 0, heading: 0, pitch: 0, roll: 0,
    battery: 1, motors: [0, 0, 0, 0], thrustPct: 0, time: 0, dist: 0, wind: 0,
    crashed: false, crashReason: '', armed: false, gate: 0, lap: 0, lastLap: 0, bestLap: 0, gamepad: '',
  },
  set: (p) => set(p),
  cycleCam: () => set({ cam: cams[(cams.indexOf(get().cam) + 1) % cams.length] }),
  toggleMode: () => set({ mode: get().mode === 'angle' ? 'acro' : 'angle' }),
  reset: () => set({ resetId: get().resetId + 1 }),
}));
