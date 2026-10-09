import { useCallback, useEffect, useRef, useState } from 'react';
import { Controls } from './components/Controls';
import { Hud } from './components/Hud';
import { Leaderboard } from './components/Leaderboard';
import { Results } from './components/Results';
import { Title } from './components/Title';
import { Game, HudState, RaceResult } from './game/Game';

type Screen = 'title' | 'controls' | 'board' | 'race' | 'results';

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [hud, setHud] = useState<HudState | null>(null);
  const [result, setResult] = useState<RaceResult | null>(null);
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;

  useEffect(() => {
    const g = new Game(host.current!, {
      onFinish: (r) => {
        setResult(r);
        setScreen('results');
      },
    });
    game.current = g;
    setHud(g.hud());
    const id = window.setInterval(() => setHud(g.hud()), 80);
    return () => {
      window.clearInterval(id);
      g.dispose();
      game.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    const g = game.current;
    if (!g) return;
    await g.unlockAudio().catch(() => undefined);
    g.startRace();
    setResult(null);
    setScreen('race');
  }, []);

  const toTitle = useCallback(() => {
    game.current?.toTitle();
    setScreen('title');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT') return;
      const s = screenRef.current;
      if (e.code === 'Enter' && s === 'title' && tag !== 'BUTTON') {
        e.preventDefault();
        void start();
      } else if (e.code === 'KeyR' && (s === 'race' || s === 'results')) {
        void start();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [start]);

  return (
    <div className="app">
      <div className="stage" ref={host} />
      <div className="scan" aria-hidden="true" />

      {hud && screen === 'race' && <Hud h={hud} />}
      {hud && screen === 'race' && hud.paused && (
        <div className="overlay">
          <div className="panel pause">
            <h2>Paused</h2>
            <button className="btn" autoFocus onClick={() => game.current?.togglePause()}>Resume</button>
            <button className="btn" onClick={() => void start()}>Restart race</button>
            <button className="btn" onClick={toTitle}>Quit to title</button>
          </div>
        </div>
      )}

      {screen === 'title' && <Title nowPlaying={hud?.nowPlaying ?? ''} onStart={() => void start()} onControls={() => setScreen('controls')} onBoard={() => setScreen('board')} />}
      {screen === 'controls' && <Controls onBack={() => setScreen('title')} />}
      {screen === 'board' && <Leaderboard onBack={() => setScreen(result ? 'results' : 'title')} />}
      {screen === 'results' && result && hud && (
        <Results result={result} cars={hud.cars} onAgain={() => void start()} onTitle={toTitle} onBoard={() => setScreen('board')} />
      )}
    </div>
  );
}
