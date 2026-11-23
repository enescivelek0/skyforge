import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Drone } from './Drone';
import { P, resetSim, state, step } from '../sim/physics';
import { readInputs, inputInfo } from '../sim/input';
import { useStore } from '../store';

const FIXED = 1 / 240;
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _off = new THREE.Vector3();
const _look = new THREE.Vector3();
const _q = new THREE.Quaternion();
const FPV_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(18));
const lastPos = new THREE.Vector3();

export function SimLoop() {
  const drone = useRef<THREE.Group>(null!);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbit = useRef<any>(null);
  const { camera } = useThree();
  const cam = useStore((s) => s.cam);
  const resetId = useStore((s) => s.resetId);
  const acc = useRef(0);
  const hudT = useRef(0);
  const chaseYaw = useRef(0);

  useEffect(() => {
    if (resetId > 0) resetSim();
    chaseYaw.current = 0;
  }, [resetId]);

  useEffect(() => {
    const c = camera as THREE.PerspectiveCamera;
    c.fov = cam === 'fpv' ? 100 : 65;
    c.near = cam === 'fpv' ? 0.02 : 0.05;
    c.updateProjectionMatrix();
    if (cam === 'orbit') {
      camera.position.copy(state.pos).add(new THREE.Vector3(3, 2, 4));
      lastPos.copy(state.pos);
    }
  }, [cam, camera]);

  useFrame((_, frameDt) => {
    const st = useStore.getState();
    const dt = Math.min(frameDt, 0.05);
    if (st.started) {
      acc.current += dt;
      while (acc.current >= FIXED) {
        const inp = readInputs(FIXED, st.mode);
        step(FIXED, inp, st.mode, st.wind, st.windDir);
        acc.current -= FIXED;
      }
    }

    const g = drone.current;
    g.position.copy(state.pos);
    g.quaternion.copy(state.q);
    g.visible = cam !== 'fpv';

    _e.setFromQuaternion(state.q, 'YXZ');
    if (cam === 'chase') {
      // smoothed yaw-follow chase camera with a little speed-based pullback
      let dy = _e.y - chaseYaw.current;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      chaseYaw.current += dy * Math.min(1, dt * 3.5);
      const sp = state.vel.length();
      const back = 1.6 + Math.min(2.5, sp * 0.08);
      _off.set(0, 0.55 + Math.min(1, sp * 0.03), back).applyAxisAngle(THREE.Object3D.DEFAULT_UP, chaseYaw.current);
      const target = _look.copy(state.pos).add(_off);
      camera.position.lerp(target, Math.min(1, dt * 8));
      _look.set(0, 0, -2).applyAxisAngle(THREE.Object3D.DEFAULT_UP, chaseYaw.current).add(state.pos);
      _look.y += 0.15;
      camera.lookAt(_look);
    } else if (cam === 'fpv') {
      camera.position.copy(_off.set(0, 0.03, -0.1).applyQuaternion(state.q).add(state.pos));
      camera.quaternion.copy(_q.copy(state.q).multiply(FPV_TILT));
    } else if (orbit.current) {
      camera.position.add(_off.copy(state.pos).sub(lastPos));
      orbit.current.target.copy(state.pos);
      orbit.current.update();
      lastPos.copy(state.pos);
    }

    // throttle HUD updates to ~15 Hz
    hudT.current += frameDt;
    if (hudT.current > 1 / 15) {
      hudT.current = 0;
      const ms = state.motors;
      st.set({
        t: {
          alt: state.pos.y, agl: Math.max(0, state.agl), speed: state.vel.length(), vspeed: state.vel.y,
          heading: ((-_e.y * 180) / Math.PI + 360) % 360,
          pitch: (_e.x * 180) / Math.PI, roll: (_e.z * 180) / Math.PI,
          battery: state.battery, motors: ms.map((m) => m / P.motorMax),
          thrustPct: (ms[0] + ms[1] + ms[2] + ms[3]) / (4 * P.motorMax),
          time: state.flightTime, dist: Math.hypot(state.pos.x, state.pos.z), wind: state.wind.length(),
          crashed: state.crashed, crashReason: state.crashReason, armed: state.armed,
          gate: state.gateIndex, lap: state.lap, lastLap: state.lastLap, bestLap: state.bestLap,
          gamepad: inputInfo.gamepad,
        },
      });
    }
  });

  return (
    <>
      <Drone ref={drone} />
      {cam === 'orbit' && <OrbitControls ref={orbit} enablePan={false} minDistance={0.6} maxDistance={40} />}
    </>
  );
}
