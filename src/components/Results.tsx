import { useState } from 'react';
import { fmtTime, hex, ordinal } from '../format';
import type { HudCar, RaceResult } from '../game/Game';
import { addEntry, loadName, saveName } from '../leaderboard';

const HEADLINE = ['', 'Winner!', 'Second place', 'Third place'];

interface Props {
  result: RaceResult;
  cars: HudCar[];
  onAgain: () => void;
  onTitle: () => void;
  onBoard: () => void;
}

export function Results({ result, cars, onAgain, onTitle, onBoard }: Props) {
  const [name, setName] = useState(loadName);
  const [rank, setRank] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const n = name.trim() || 'PLAYER';
    saveName(n);
    setRank(addEntry({ name: n, time: result.total, best: result.best, place: result.place, date: Date.now() }));
    setSaved(true);
  };

  const rows: [string, string][] = [
    ['Race time', fmtTime(result.total)],
    ...result.laps.map((t, i): [string, string] => [`Lap ${i + 1}`, fmtTime(t)]),
    ['Best lap', fmtTime(result.best)],
    ['Top speed', `${Math.round(result.topSpeed)} km/h`],
    ['Average speed', `${Math.round(result.avgSpeed)} km/h`],
    ['Contacts', String(result.contacts)],
  ];

  return (
    <div className="overlay">
      <div className="panel results">
        <div className="place">
          <span className={`ord p${Math.min(result.place, 4)}`}>{ordinal(result.place)}</span>
          <span className="headline">{HEADLINE[result.place] ?? 'Race finished'}</span>
        </div>

        <div className="cols">
          <dl className="stats">
            {rows.map(([k, v], i) => (
              <div key={k} className="read" style={{ animationDelay: `${0.35 + i * 0.28}s` }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          <ol className="final">
            {cars.map((c, i) => (
              <li key={c.id} className={c.isPlayer ? 'me' : ''}>
                <b>{i + 1}</b>
                <i style={{ background: hex(c.color) }} />
                <span>{c.name}</span>
                <em>{c.finished ? fmtTime(c.time) : 'Racing'}</em>
              </li>
            ))}
          </ol>
        </div>

        <div className="save">
          {saved ? (
            <p className="saved">
              {rank ? `Saved. You are number ${rank} on this browser's leaderboard.` : 'Saved, but it was not fast enough for the top 20.'}
            </p>
          ) : (
            <>
              <label htmlFor="drv">Driver name</label>
              <input
                id="drv"
                value={name}
                maxLength={10}
                onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9 _-]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                }}
              />
              <button className="btn small" onClick={save}>Save time</button>
            </>
          )}
        </div>

        <div className="row">
          <button className="btn" autoFocus onClick={onAgain}>Race again</button>
          <button className="btn" onClick={onBoard}>Leaderboard</button>
          <button className="btn" onClick={onTitle}>Title</button>
        </div>
      </div>
    </div>
  );
}
