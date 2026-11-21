import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

// Chromium's install prompt event, which the DOM types do not include.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

const runsInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function InstallButton({ onHelp }: { onHelp(): void }) {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(runsInstalled);
  useEffect(() => {
    const remember = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstall = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', remember);
    window.addEventListener('appinstalled', onInstall);
    return () => {
      window.removeEventListener('beforeinstallprompt', remember);
      window.removeEventListener('appinstalled', onInstall);
    };
  }, []);
  if (installed) return null;
  return (
    <button
      type="button"
      className="quiet-button"
      aria-label="Telepítés"
      onClick={async () => {
        if (!prompt) return onHelp();
        setPrompt(null);
        await prompt.prompt();
      }}
    >
      <Download size={17} /> <span>Telepítés</span>
    </button>
  );
}
