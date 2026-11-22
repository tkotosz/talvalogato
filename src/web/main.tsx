import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { watchInstallPrompt } from './install-prompt.ts';
import './styles.css';

watchInstallPrompt();
createRoot(document.getElementById('root')!).render(<App />);
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('/sw.js').catch((error: Error) => {
      console.info('Service worker registration unavailable', error.message);
    }),
  );
}
