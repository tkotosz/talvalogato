import { useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { installState, isAppleMobile, promptInstall, runsInstalled, subscribeInstallState } from '../install-prompt.ts';

/**
 * Installs the app where the browser allows it from a page, and explains how where it doesn't.
 * - Chromium browsers: shown once Chrome has offered installing (after a tap and about 30 seconds on the site, never once
 *   installed); a tap opens Chrome's own install dialog.
 * - iPhone and iPad: always shown in the browser; a tap shows how to add the app to the Home Screen.
 * - Other browsers install from their own menus, so the button stays hidden.
 */
export function InstallButton({ onAppleHelp }: { onAppleHelp(): void }) {
  const { prompt } = useSyncExternalStore(subscribeInstallState, installState);
  const appleHelp = !prompt && isAppleMobile() && !runsInstalled();
  if (!prompt && !appleHelp) return null;
  return (
    <button
      type="button"
      className="quiet-button"
      aria-label="Telepítés"
      onClick={() => (prompt ? void promptInstall() : onAppleHelp())}
    >
      <Download size={17} /> <span>Telepítés</span>
    </button>
  );
}
