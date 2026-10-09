const KEYS: [string[], string][] = [
  [['←', '→'], 'Steer'],
  [['Space'], 'Accelerate (Up arrow works too)'],
  [['Z'], 'Brake, hold at a standstill to reverse (Down arrow works too)'],
  [['C'], 'Change camera: chase, far, bumper'],
  [['M'], 'Music on / off'],
  [['N'], 'Next track'],
  [['Esc'], 'Pause'],
  [['R'], 'Restart the race'],
];

export function Controls({ onBack }: { onBack: () => void }) {
  return (
    <div className="overlay left">
      <div className="panel wide">
        <h2>Controls</h2>
        <ul className="keys">
          {KEYS.map(([caps, what]) => (
            <li key={what}>
              <span className="caps">{caps.map((k) => <kbd key={k}>{k}</kbd>)}</span>
              <span>{what}</span>
            </li>
          ))}
        </ul>
        <p className="hint">The car understeers if you carry too much speed into a turn. Lift off or tap Z before the corner, then get back on the throttle.</p>
        <button className="btn" autoFocus onClick={onBack}>Back</button>
      </div>
    </div>
  );
}
