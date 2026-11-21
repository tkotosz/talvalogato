import type { Step } from '../../core/planner.ts';

/** Stands in for the meal picker or the overview while data loads, fails, or when no day can be planned. */
export function StatusScreen({ step, week, error, loading, noDaysSelected, onRetry }: {
  step: Step;
  week: string;
  error: string;
  loading: boolean;
  noDaysSelected: boolean;
  onRetry(): void;
}) {
  const loadingText = week ? 'Étlap betöltése…' : 'Hetek betöltése…';
  return <main className={step === 'overview' ? 'review' : 'picker'}>
    <div className="placeholder-card" role={error ? 'alert' : 'status'}>
      {loading && <span className="spinner" aria-hidden="true" />}
      <h2>{error || (loading ? loadingText : noDaysSelected
        ? 'Válassz rendelési napokat a Hét lépésben.' : 'Erre a hétre már nem rendelhetsz.')}</h2>
      {error && <button type="button" className="button secondary" onClick={onRetry}>Újra</button>}
    </div>
  </main>;
}
