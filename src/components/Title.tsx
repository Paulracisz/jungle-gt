interface Props {
  nowPlaying: string;
  onStart: () => void;
  onControls: () => void;
  onBoard: () => void;
}

export function Title({ nowPlaying, onStart, onControls, onBoard }: Props) {
  return (
    <div className="overlay left">
      <div className="title">
        <h1 className="logo">
          Jungle
          <br />
          GT
        </h1>
        <p className="tag">Six cars, three laps, one oval under the floodlights.</p>
        <div className="menu">
          <button className="btn" autoFocus onClick={onStart}>Start race</button>
          <button className="btn" onClick={onBoard}>Leaderboard</button>
          <button className="btn" onClick={onControls}>Controls</button>
        </div>
        <p className="hint">
          {nowPlaying ? `Now playing: ${nowPlaying}` : 'Music starts when you press Start. Press Enter to go.'}
        </p>
        <p className="kbd-note">This game needs a keyboard.</p>
      </div>
    </div>
  );
}
