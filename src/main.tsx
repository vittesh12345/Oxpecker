import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './toons.css';

// Lets the hosted app be installed and opened offline. Skipped for files
// opened straight from disk and for sandboxed embeds, where it cannot work.
if (
  import.meta.env.PROD &&
  import.meta.env.VITE_EMBEDDED !== 'true' &&
  'serviceWorker' in navigator &&
  location.protocol.startsWith('http')
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Installing is a convenience. The app works the same without it.
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
