import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { World } from './components/World';
import { SimLoop } from './components/SimLoop';
import { HUD } from './components/HUD';
import { useStore } from './store';

function StartScreen() {
  const set = useStore((s) => s.set);
  return (
    <div className="overlay start">
      <div className="start-card">
        <div className="logo">SKYFORGE</div>
        <p className="tag">Gerçek zamanlı 6-DOF quadcopter uçuş simülatörü</p>
        <ul className="features">
          <li>240 Hz fizik, motor mikseri ve PID uçuş kontrolcüsü</li>
          <li>Rüzgâr, hamle, yer etkisi ve batarya voltaj düşüşü</li>
          <li>ANGLE (stabilize) ve ACRO (manuel) uçuş modları</li>
          <li>Takip, FPV ve serbest kamera · gamepad ve RC kumanda desteği</li>
        </ul>
        <div className="keys">
          <span><kbd>W</kbd><kbd>S</kbd> gaz</span>
          <span><kbd>A</kbd><kbd>D</kbd> yön</span>
          <span><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd> eğim</span>
          <span><kbd>M</kbd> mod · <kbd>C</kbd> kamera · <kbd>R</kbd> sıfırla</span>
        </div>
        <button className="primary big" onClick={() => set({ started: true })}>Uçuşa başla</button>
        <p className="muted small">İpucu: Turuncu kapılardan geçerek tur zamanı kaydet.</p>
      </div>
    </div>
  );
}

export default function App() {
  const started = useStore((s) => s.started);
  const quality = useStore((s) => s.quality);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      if (e.repeat) return;
      if (e.code === 'KeyR') s.reset();
      if (e.code === 'KeyC') s.cycleCam();
      if (e.code === 'KeyM') s.toggleMode();
      if (e.code === 'KeyH') s.set({ showHelp: !s.showHelp });
      if (e.code === 'Enter' && !s.started) s.set({ started: true });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <Canvas
        shadows
        dpr={quality === 'high' ? [1, 2] : [0.6, 1]}
        camera={{ position: [0, 1.2, 3], fov: 65, near: 0.05, far: 2500 }}
        gl={{ antialias: quality === 'high', toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <Suspense fallback={null}>
          <World />
          <SimLoop />
        </Suspense>
      </Canvas>
      {started ? <HUD /> : <StartScreen />}
    </>
  );
}
