import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// No StrictMode: its double-mounting would join and leave the network room twice.
createRoot(document.getElementById('root')!).render(<App />);
