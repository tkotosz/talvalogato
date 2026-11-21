import { useCallback, useEffect, useState } from 'react';

export type Loadable<T> =
  | { phase: 'loading' }
  | { phase: 'ready'; value: T }
  | { phase: 'error'; message: string };

export interface Load<T> {
  state: Loadable<T>;
  /** Loads again, showing the loading state meanwhile. */
  retry(): void;
  /** Replaces the loaded value, for data refreshed elsewhere. */
  replace(value: T): void;
}

/**
 * Loads a value for `key` and loads again whenever the key changes. `load` is read only when loading starts,
 * so everything it depends on must be part of the key. A null key loads nothing.
 */
export function useLoad<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>): Load<T> {
  const [attempt, setAttempt] = useState(0);
  // Each result remembers the request it answers, so an outdated one reads as loading.
  const request = `${attempt}:${key}`;
  const [result, setResult] = useState<{ request: string; state: Loadable<T> } | null>(null);

  useEffect(() => {
    if (key === null) return;
    const aborter = new AbortController();
    const { signal } = aborter;
    load(signal).then(value => {
      if (!signal.aborted) setResult({ request, state: { phase: 'ready', value } });
    }).catch((error: Error) => {
      if (!signal.aborted) setResult({ request, state: { phase: 'error', message: error.message } });
    });
    return () => aborter.abort();
    // The key identifies what `load` loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  const replace = useCallback((value: T) => setResult({ request, state: { phase: 'ready', value } }), [request]);
  return { state: result?.request === request ? result.state : { phase: 'loading' }, retry, replace };
}
