import { fmtTime, hex } from '../format';
import type { HudState } from '../game/Game';
import { TRACK_LENGTH, centerAt } from '../game/track';

// Track outline for the minimap, rotated so the long axis runs left to right.
const MAP_PATH = (() => {
  const pts: string[] = [];
  for (let i = 0; i <= 120; i++) {
    const p = centerAt((i / 120) * TRACK_LENGTH);
    pts.push(`${i ? 'L' : 'M'}${p.z.toFixed(0)} ${(-p.x).toFixed(0)}`);
  }
  return `${pts.join(' ')}Z`;
})();

const SEGMENTS = 24;

export function Hud({ h }: { h: HudState }) {
  const lit = Math.round(h.rpm * SEGMENTS);
  return (
    <div className="hud">
      <ol className="tower">
        {h.cars.map((c, i) => (
          <li key={c.id} className={c.isPlayer ? 'me' : ''}>
            <b>{i + 1}</b>
            <i style={{ background: hex(c.color) }} />
            <span>{c.name}</span>
          </li>
        ))}
      </ol>

      <div className="lapbox">
        <div className="lapno">Lap {h.lap}<small> of {h.laps}</small></div>
        <div className="big">{fmtTime(h.raceTime)}</div>
        <div className="small">This lap {fmtTime(h.lapTime)}</div>
        <div className="small">Best lap {fmtTime(h.bestLap)}</div>
      </div>

      <svg className="minimap" viewBox="-540 -250 1080 500" aria-label="Track map">
        <path d={MAP_PATH} fill="none" stroke="#0a1a52" strokeWidth="64" />
        <path d={MAP_PATH} fill="none" stroke="#8fb5ff" strokeWidth="26" />
        {[...h.cars].reverse().map((c) => (
          <circle
            key={c.id}
            cx={c.z}
            cy={-c.x}
            r={c.isPlayer ? 46 : 34}
            fill={hex(c.color)}
            stroke={c.isPlayer ? '#ffffff' : '#02040f'}
            strokeWidth={c.isPlayer ? 14 : 8}
          />
        ))}
      </svg>

      <div className="speedo">
        <div className="pos">{h.place}<small>/{h.total}</small></div>
        <div className="rev" aria-hidden="true">
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={`${i < lit ? 'on' : ''} ${i > SEGMENTS - 5 ? 'red' : ''}`} />
          ))}
        </div>
        <div className="kmh">
          <span className="num">{Math.round(h.speed)}</span>
          <span className="unit">km/h</span>
          <span className="gear">{h.gear}</span>
        </div>
      </div>

      {h.label && <div className="count" key={h.label}>{h.label}</div>}
      {h.wrongWay && <div className="wrong">Wrong way</div>}
      <div className="foot">
        {h.musicOn && h.nowPlaying ? `Now playing: ${h.nowPlaying}. ` : ''}Esc pauses, C changes camera, M mutes music.
      </div>
    </div>
  );
}
