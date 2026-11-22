// How the app gets installed depends on the browser:
// - Chrome and other Chromium browsers announce once per page load that the app can be installed (`beforeinstallprompt`),
//   after some use of the site. It can come before React has rendered the install button, so the announcement is
//   caught here, at startup, and kept for it.
// - Safari on iPhone and iPad never announces it; people install with Share → Add to Home Screen.

/** Chromium's install prompt event, which the DOM types do not include. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

interface InstallState {
  /** The kept announcement; null until Chrome sends one, again once used, and always once the app is installed. */
  prompt: InstallPromptEvent | null;
}

let state: InstallState = { prompt: null };
const listeners = new Set<() => void>();

function update(change: Partial<InstallState>) {
  state = { ...state, ...change };
  for (const listener of listeners) listener();
}

/** Starts listening; call once, before the app renders. */
export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', event => {
    // Keeps Chrome's own install banner away; the app offers installing through its button.
    event.preventDefault();
    update({ prompt: event as InstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => update({ prompt: null }));
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const installState = (): InstallState => state;

/** iPhone, iPod or iPad. iPadOS reports itself as a Mac, so a Mac with a touch screen counts as an iPad. */
export function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/** Whether the page runs as an installed app rather than in a browser tab. */
export function runsInstalled(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Shows Chrome's install dialog; returns false when Chrome has not offered installing on this page load. */
export async function promptInstall(): Promise<boolean> {
  const { prompt } = state;
  if (!prompt) return false;
  update({ prompt: null });
  await prompt.prompt();
  return true;
}
