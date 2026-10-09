import { useState } from 'react';
import { clearEntries, loadEntries } from '../leaderboard';
import { fmtTime, ordinal } from '../format';

export function Leaderboard({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState(loadEntries);

  return (
    <div className="overlay left">
      <div className="panel wide">
        <h2>Leaderboard</h2>
        {entries.length === 0 ? (
          <p className="empty">No races saved yet. Finish a race and save your time to get on the board.</p>
        ) : (
          <table className="board">
            <thead>
              <tr><th>#</th><th>Driver</th><th>Race time</th><th>Best lap</th><th>Finished</th></tr>
            </thead>
            <tbody>
              {entries.slice(0, 10).map((e, i) => (
                <tr key={`${e.date}-${i}`}>
                  <td>{i + 1}</td>
                  <td>{e.name}</td>
                  <td>{fmtTime(e.time)}</td>
                  <td>{fmtTime(e.best)}</td>
                  <td>{ordinal(e.place)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="hint">Scores are stored in this browser only.</p>
        <div className="row">
          <button className="btn" autoFocus onClick={onBack}>Back</button>
          {entries.length > 0 && (
            <button
              className="btn ghost"
              onClick={() => {
                if (window.confirm('Delete every saved time on this browser?')) {
                  clearEntries();
                  setEntries([]);
                }
              }}
            >
              Clear times
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
