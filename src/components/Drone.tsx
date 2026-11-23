import { forwardRef, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { P, state } from '../sim/physics';

const a = P.arm * Math.SQRT1_2;
const motorPos: [number, number, number][] = [
  [a, 0.03, -a], [-a, 0.03, -a], [a, 0.03, a], [-a, 0.03, a],
];
const dirs = [1, -1, -1, 1];

export const Drone = forwardRef<THREE.Group>(function Drone(_, ref) {
  const props = useRef<THREE.Group[]>([]);
  const blurs = useRef<THREE.MeshBasicMaterial[]>([]);
  const blades = useRef<THREE.MeshStandardMaterial[]>([]);
  const ledF = useRef<THREE.MeshBasicMaterial>(null!);

  useFrame(({ clock }, dt) => {
    for (let i = 0; i < 4; i++) {
      const f = state.motors[i] / P.motorMax;
      const p = props.current[i];
      if (p) p.rotation.y += dirs[i] * (f * 220 + (state.armed ? 15 : 0)) * Math.min(dt, 0.05);
      if (blurs.current[i]) blurs.current[i].opacity = Math.min(0.35, f * 0.6);
      if (blades.current[i]) blades.current[i].opacity = 1 - Math.min(0.85, f * 1.4);
    }
    const blink = Math.sin(clock.elapsedTime * 8) > 0;
    ledF.current.color.set(state.crashed ? (blink ? '#ff0000' : '#220000') : state.armed ? '#ffffff' : '#3355ff');
  });

  return (
    <group ref={ref}>
      {/* central body */}
      <mesh castShadow position={[0, 0.02, 0]}>
        <boxGeometry args={[0.09, 0.045, 0.2]} />
        <meshStandardMaterial color="#1b1e24" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh castShadow position={[0, 0.055, 0.01]}>
        <boxGeometry args={[0.07, 0.03, 0.12]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>
      {/* camera */}
      <mesh position={[0, 0.02, -0.11]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.014, 0.014, 0.03, 12]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0.02, -0.105]}>
        <sphereGeometry args={[0.006, 8, 8]} />
        <meshBasicMaterial ref={ledF} color="#fff" />
      </mesh>
      {/* tail LED */}
      <mesh position={[0, 0.03, 0.105]}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color="#ff2a2a" />
      </mesh>
      {/* arms */}
      {[Math.PI / 4, -Math.PI / 4].map((r, i) => (
        <mesh key={i} rotation-y={r} castShadow>
          <boxGeometry args={[0.014, 0.012, P.arm * 2]} />
          <meshStandardMaterial color="#2a2d33" roughness={0.4} metalness={0.3} />
        </mesh>
      ))}
      {/* skids */}
      {[-0.035, 0.035].map((x) => (
        <mesh key={x} position={[x, -0.05, 0]} castShadow>
          <boxGeometry args={[0.008, 0.008, 0.16]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      ))}
      {[-0.035, 0.035].map((x) =>
        [-0.05, 0.05].map((z) => (
          <mesh key={`${x}${z}`} position={[x, -0.025, z]}>
            <boxGeometry args={[0.006, 0.05, 0.006]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        ))
      )}
      {/* motors + props */}
      {motorPos.map((p, i) => (
        <group key={i} position={p}>
          <mesh castShadow>
            <cylinderGeometry args={[0.016, 0.016, 0.025, 14]} />
            <meshStandardMaterial color={i < 2 ? '#d35400' : '#7f8c8d'} metalness={0.7} roughness={0.3} />
          </mesh>
          <group ref={(g) => { if (g) props.current[i] = g; }} position={[0, 0.018, 0]}>
            <mesh>
              <boxGeometry args={[0.24, 0.002, 0.018]} />
              <meshStandardMaterial ref={(m) => { if (m) blades.current[i] = m; }} color={i < 2 ? '#e67e22' : '#222'} transparent />
            </mesh>
          </group>
          <mesh position={[0, 0.019, 0]} rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.12, 24]} />
            <meshBasicMaterial ref={(m) => { if (m) blurs.current[i] = m; }} color="#cccccc" transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
