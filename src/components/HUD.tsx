import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { virtualSticks } from '../sim/input';
import { gates } from '../sim/worldData';

const fmtTime = (s: number) => {
  if (!s) return '--:--.-';
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
const COMPASS = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];

function Horizon({ pitch, roll }: { pitch: number; roll: number }) {
  const off = Math.max(-60, Math.min(60, pitch * 1.6));
  return (
    <div className="horizon">
      <div className="horizon-inner" style={{ transform: `rotate(${roll}deg) translateY(${off}px)` }}>
        <div className="sky" />
        <div className="ground" />
        {[-20, -10, 10, 20].map((p) => (
          <div key={p} className="ladder" style={{ top: `calc(50% - ${p * 1.6}px)`, width: p % 20 ? 24 : 40 }}>
            <span>{Math.abs(p)}</span>
          </div>
        ))}
      </div>
      <div className="horizon-wings" />
    </div>
  );
}

function Stick({ side }: { side: 'left' | 'right' }) {
  const knob = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = base.current!;
    let id: number | null = null;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const r = el.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1;
      let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      x = Math.max(-1, Math.min(1, x)); y = Math.max(-1, Math.min(1, y));
      virtualSticks.active = true;
      if (side === 'left') { virtualSticks.yaw = x; virtualSticks.throttle = y; }
      else { virtualSticks.roll = x; virtualSticks.pitch = y; }
      knob.current!.style.transform = `translate(${x * 40}px, ${-y * 40}px)`;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (side === 'left') { virtualSticks.yaw = 0; virtualSticks.throttle = 0; }
      else { virtualSticks.roll = 0; virtualSticks.pitch = 0; }
      knob.current!.style.transform = '';
    };
    const down = (e: PointerEvent) => { id = e.pointerId; el.setPointerCapture(id); move(e); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [side]);
  return (
    <div ref={base} className={`stick stick-${side}`}>
      <div ref={knob} className="knob" />
      <span className="stick-label">{side === 'left' ? 'Gaz / Yön' : 'Eğim / Yatış'}</span>
    </div>
  );
}

export function HUD() {
  const t = useStore((s) => s.t);
  const mode = useStore((s) => s.mode);
  const cam = useStore((s) => s.cam);
  const wind = useStore((s) => s.wind);
  const quality = useStore((s) => s.quality);
  const showHelp = useStore((s) => s.showHelp);
  const { set, cycleCam, toggleMode, reset } = useStore.getState();
  const touch = typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  const batPct = Math.round(t.battery * 100);
  const batClass = batPct < 15 ? 'crit' : batPct < 30 ? 'warn' : '';
  const volts = (3.3 + 0.9 * Math.pow(t.battery, 0.7)) * 4 - t.thrustPct * 0.6;
  const heading = Math.round(t.heading);

  return (
    <div className="hud">
      <div className="panel top-left">
        <div className="brand">SKYFORGE</div>
        <div className="row"><span>MOD</span><b className={mode === 'acro' ? 'acro' : ''}>{mode === 'angle' ? 'ANGLE · stabilize' : 'ACRO · manuel'}</b></div>
        <div className="row"><span>KAMERA</span><b>{cam === 'chase' ? 'Takip' : cam === 'fpv' ? 'FPV' : 'Serbest'}</b></div>
        <div className="row"><span>UÇUŞ</span><b>{fmtTime(t.time)}</b></div>
        <div className="row"><span>DURUM</span><b className={t.armed ? 'ok' : 'muted'}>{t.armed ? 'ARMED' : 'DISARMED'}</b></div>
        {t.gamepad && <div className="row small"><span>🎮</span><b>{t.gamepad.slice(0, 26)}</b></div>}
      </div>

      <div className="panel top-right">
        <div className="row"><span>KAPI</span><b>{t.gate + 1} / {gates.length}</b></div>
        <div className="row"><span>TUR</span><b>{Math.max(0, t.lap - 1)}</b></div>
        <div className="row"><span>SON TUR</span><b>{fmtTime(t.lastLap)}</b></div>
        <div className="row"><span>EN İYİ</span><b className="ok">{fmtTime(t.bestLap)}</b></div>
      </div>

      <div className="compass">
        <div className="compass-strip" style={{ transform: `translateX(${-heading * 3}px)` }}>
          {Array.from({ length: 3 * 36 }).map((_, i) => {
            const d = (i * 10) % 360;
            return <span key={i} style={{ left: i * 30 - 360 * 3 }}>{d % 45 === 0 ? COMPASS[d / 45] : d % 30 === 0 ? d : '·'}</span>;
          })}
        </div>
        <div className="compass-mark">{String(heading).padStart(3, '0')}°</div>
      </div>

      {cam === 'fpv' && <div className="crosshair" />}

      <div className="tape left-tape">
        <div className="big">{(t.speed * 3.6).toFixed(0)}</div><div className="unit">km/s</div>
        <div className="sub">{t.speed.toFixed(1)} m/s</div>
      </div>
      <div className="tape right-tape">
        <div className="big">{t.agl.toFixed(1)}</div><div className="unit">m AGL</div>
        <div className={`sub ${t.vspeed > 0.2 ? 'ok' : t.vspeed < -0.2 ? 'warn' : ''}`}>
          {t.vspeed >= 0 ? '▲' : '▼'} {Math.abs(t.vspeed).toFixed(1)} m/s
        </div>
        <div className="sub muted">MSL {t.alt.toFixed(0)} m</div>
      </div>

      <div className="panel bottom-left">
        <div className={`battery ${batClass}`}>
          <div className="battery-fill" style={{ width: `${batPct}%` }} />
          <span>{batPct}% · {volts.toFixed(1)}V</span>
        </div>
        <div className="motors">
          {t.motors.map((m, i) => (
            <div key={i} className="motor">
              <div className="motor-bar"><div style={{ height: `${Math.min(100, m * 100)}%` }} /></div>
              <span>M{i + 1}</span>
            </div>
          ))}
          <div className="motor-info">
            <div>İtki <b>{Math.round(t.thrustPct * 100)}%</b></div>
            <div>Mesafe <b>{t.dist.toFixed(0)} m</b></div>
            <div>Rüzgâr <b>{t.wind.toFixed(1)} m/s</b></div>
          </div>
        </div>
      </div>

      <div className="bottom-center"><Horizon pitch={t.pitch} roll={t.roll} /></div>

      <div className="panel bottom-right controls">
        <button onClick={toggleMode} title="M">Mod: {mode.toUpperCase()}</button>
        <button onClick={cycleCam} title="C">Kamera</button>
        <button onClick={reset} title="R">Sıfırla</button>
        <button onClick={() => set({ quality: quality === 'high' ? 'low' : 'high' })}>Grafik: {quality === 'high' ? 'Yüksek' : 'Düşük'}</button>
        <label className="slider">
          Rüzgâr {wind.toFixed(0)} m/s
          <input type="range" min={0} max={14} step={1} value={wind} onChange={(e) => set({ wind: Number(e.target.value) })} />
        </label>
        <button onClick={() => set({ showHelp: !showHelp })} title="H">Kontroller</button>
      </div>

      {batPct < 15 && !t.crashed && <div className="warning">⚠ DÜŞÜK BATARYA · İNİŞ YAP</div>}

      {t.crashed && (
        <div className="overlay crash">
          <h2>KAZA</h2>
          <p>{t.crashReason}</p>
          <button className="primary" onClick={reset}>Tekrar kalk (R)</button>
        </div>
      )}

      {showHelp && (
        <div className="overlay help" onClick={() => set({ showHelp: false })}>
          <h2>Kontroller</h2>
          <table>
            <tbody>
              <tr><td>W / S</td><td>Gaz: ANGLE modunda tırmanma/alçalma hızı, ACRO modunda gaz seviyesi</td></tr>
              <tr><td>A / D</td><td>Yön (yaw)</td></tr>
              <tr><td>↑ ↓ / I K</td><td>İleri / geri eğim (pitch)</td></tr>
              <tr><td>← → / J L</td><td>Sola / sağa yatış (roll)</td></tr>
              <tr><td>M</td><td>ANGLE ↔ ACRO uçuş modu</td></tr>
              <tr><td>C</td><td>Kamera: Takip → FPV → Serbest</td></tr>
              <tr><td>R</td><td>Sıfırla</td></tr>
              <tr><td>🎮</td><td>Gamepad veya USB RC kumanda (Mode 2) otomatik algılanır</td></tr>
            </tbody>
          </table>
          <p className="muted">Kapatmak için tıkla</p>
        </div>
      )}

      {touch && (<><Stick side="left" /><Stick side="right" /></>)}
    </div>
  );
}
