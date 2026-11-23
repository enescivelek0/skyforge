import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { heightAt, TERRAIN_SIZE, WATER_LEVEL } from '../sim/terrain';
import { boxes, gates, trees } from '../sim/worldData';
import { state } from '../sim/physics';
import { useStore } from '../store';

const SUN = new THREE.Vector3(120, 160, 80).normalize();

function Terrain() {
  const quality = useStore((s) => s.quality);
  const geo = useMemo(() => {
    const seg = quality === 'high' ? 320 : 160;
    const g = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, seg, seg);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color('#5b7d3a'), dry = new THREE.Color('#8f8a55'), rock = new THREE.Color('#7a7470');
    const snow = new THREE.Color('#eef2f5'), sand = new THREE.Color('#c8b68a'), field = new THREE.Color('#6d8a44');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = heightAt(x, z);
      pos.setY(i, h);
      const slope = Math.abs(heightAt(x + 2, z) - h) + Math.abs(heightAt(x, z + 2) - h);
      if (h < WATER_LEVEL + 1.2) c.copy(sand);
      else if (h > 95) c.copy(snow);
      else if (slope > 2.2 || h > 70) c.copy(rock);
      else c.copy(grass).lerp(dry, Math.min(1, Math.max(0, h / 60)));
      if (Math.hypot(x, z) < 70) c.copy(field);
      const n = (Math.sin(x * 0.37) * Math.cos(z * 0.41)) * 0.04;
      colors[i * 3] = c.r + n; colors[i * 3 + 1] = c.g + n; colors[i * 3 + 2] = c.b + n;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [quality]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial vertexColors roughness={0.95} metalness={0} />
    </mesh>
  );
}

function Water() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={WATER_LEVEL}>
      <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE]} />
      <meshStandardMaterial color="#2f6b86" roughness={0.15} metalness={0.3} transparent opacity={0.85} />
    </mesh>
  );
}

function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null!);
  const crowns = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const col = new THREE.Color();
    trees.forEach((t, i) => {
      s.set(t.s, t.s, t.s);
      m.compose(p.set(t.x, t.y + 1.1 * t.s, t.z), q, s);
      trunks.current.setMatrixAt(i, m);
      m.compose(p.set(t.x, t.y + 5.6 * t.s, t.z), q, s);
      crowns.current.setMatrixAt(i, m);
      col.setHSL(0.27 + ((i * 37) % 10) / 200, 0.45, 0.22 + ((i * 13) % 10) / 100);
      crowns.current.setColorAt(i, col);
    });
    trunks.current.instanceMatrix.needsUpdate = true;
    crowns.current.instanceMatrix.needsUpdate = true;
    if (crowns.current.instanceColor) crowns.current.instanceColor.needsUpdate = true;
  }, []);
  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.2, 6]} />
        <meshStandardMaterial color="#5a3e2b" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[2.6, 6.8, 7]} />
        <meshStandardMaterial roughness={0.9} />
      </instancedMesh>
    </>
  );
}

function Buildings() {
  return (
    <>
      {boxes.map((b, i) => (
        <mesh key={i} position={[b.x, b.base + b.h / 2, b.z]} castShadow receiveShadow>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <meshStandardMaterial color={b.color} roughness={0.8} metalness={0.1} />
        </mesh>
      ))}
      {/* landing pad marking */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.205, 0]}>
        <ringGeometry args={[1.1, 1.3, 40]} />
        <meshBasicMaterial color="#f2c94c" />
      </mesh>
      <group position={[0, 0.206, 0]} rotation-x={-Math.PI / 2}>
        <mesh position={[-0.35, 0, 0]}><planeGeometry args={[0.14, 0.9]} /><meshBasicMaterial color="#fff" /></mesh>
        <mesh position={[0.35, 0, 0]}><planeGeometry args={[0.14, 0.9]} /><meshBasicMaterial color="#fff" /></mesh>
        <mesh><planeGeometry args={[0.7, 0.14]} /><meshBasicMaterial color="#fff" /></mesh>
      </group>
      {/* runway dashes */}
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position={[0, 0.06, -42 - i * 3]}>
          <planeGeometry args={[0.3, 1.6]} />
          <meshBasicMaterial color="#e8e8e8" />
        </mesh>
      ))}
      {/* windsock pole */}
      <mesh position={[8, 2.5, 6]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 5, 6]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>
      <Windsock />
    </>
  );
}

function Windsock() {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    const w = state.wind;
    const sp = Math.hypot(w.x, w.z);
    ref.current.rotation.y = Math.atan2(-w.z, w.x);
    ref.current.rotation.z = -Math.PI / 2 + Math.min(1, sp / 8) * (Math.PI / 2) * 0.95;
  });
  return (
    <group ref={ref} position={[8, 4.9, 6]}>
      <mesh position={[0, -0.6, 0]}>
        <coneGeometry args={[0.22, 1.2, 10, 1, true]} />
        <meshStandardMaterial color="#ff6b2b" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Gates() {
  const refs = useRef<THREE.MeshStandardMaterial[]>([]);
  useFrame(({ clock }) => {
    refs.current.forEach((m, i) => {
      const next = i === state.gateIndex;
      m.color.set(next ? '#00e5ff' : '#ff8a00');
      m.emissive.set(next ? '#00b8d4' : '#ff6d00');
      m.emissiveIntensity = next ? 1.2 + Math.sin(clock.elapsedTime * 6) * 0.6 : 0.35;
    });
  });
  return (
    <>
      {gates.map((g, i) => (
        <group key={i} position={[g.x, g.y, g.z]} rotation-y={g.yaw}>
          <mesh>
            <torusGeometry args={[g.r, 0.18, 10, 40]} />
            <meshStandardMaterial ref={(m) => { if (m) refs.current[i] = m; }} toneMapped={false} />
          </mesh>
          <mesh position={[0, -(g.y - Math.max(heightAt(g.x, g.z), WATER_LEVEL)) / 2 - g.r / 2, 0]}>
            <cylinderGeometry args={[0.1, 0.1, Math.max(0.1, g.y - Math.max(heightAt(g.x, g.z), WATER_LEVEL) - g.r), 6]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        </group>
      ))}
    </>
  );
}

export function World() {
  const light = useRef<THREE.DirectionalLight>(null!);
  const quality = useStore((s) => s.quality);
  useFrame(() => {
    // shadow camera follows the drone so the shadow map stays sharp
    const l = light.current;
    l.position.copy(state.pos).addScaledVector(SUN, 120);
    l.target.position.copy(state.pos);
    l.target.updateMatrixWorld();
  });
  return (
    <>
      <Sky sunPosition={SUN.clone().multiplyScalar(100)} turbidity={6} rayleigh={1.2} mieCoefficient={0.005} />
      <fog attach="fog" args={['#bcd3e6', 150, 900]} />
      <hemisphereLight args={['#cfe6ff', '#4b5a33', 0.55]} />
      <directionalLight
        ref={light}
        intensity={2.2}
        castShadow={quality === 'high'}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
      />
      <Terrain />
      <Water />
      <Trees />
      <Buildings />
      <Gates />
    </>
  );
}
