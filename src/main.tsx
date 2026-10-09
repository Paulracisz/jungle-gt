import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

// No <StrictMode>: the game owns a WebGL context and an AudioContext, and
// StrictMode's dev-only double mount would create and tear down both twice.
createRoot(document.getElementById('root')!).render(<App />);
