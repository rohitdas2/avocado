import { useEffect, useState } from 'react';
import { request } from './api';
import ExerciseProgress from './ExerciseProgress';
import { formatNumber, fromKg, type Unit } from './workoutLogic';

// Profile → Progress, as on mobile (mobile/ProgressSheet.tsx): every exercise the user has logged
// (GET /api/progress), then one exercise's max-weight graph and workout list (ExerciseProgress,
// the component Lifts also uses).
type Summary = { id: string; name: string; sessions: number; lastDate: string; unit: Unit;
  bestWeightKg: number; firstWeightKg: number; latestWeightKg: number; latestReps: number };

export default function Progress() {
  const [items, setItems] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Summary | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<{ exercises: Summary[] }>('/progress', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setItems(data.exercises); setError(''); } })
      .catch(failure => { if (!controller.signal.aborted) setError((failure as Error).message); });
    return () => controller.abort();
  }, [revision]);

  return <section className="card progress-card" aria-labelledby="progress-title">
    <div className="section-heading">
      {open ? <button className="quiet back" onClick={() => { setOpen(null); setRevision(n => n + 1); }} aria-label="Back to all exercises">‹ Progress</button> : <h2 id="progress-title">Progress</h2>}
      {!open && <span className="caption">Every exercise you’ve logged</span>}
    </div>
    {open ? <>
      <h3 id="progress-title" className="progress-exercise">{open.name}</h3>
      <ExerciseProgress key={open.id} exerciseId={open.id} />
    </> : <>
      {!items && !error && <p className="caption" role="status">Loading…</p>}
      {error && <p className="error" role="alert">{error} <button className="quiet" onClick={() => setRevision(n => n + 1)}>Retry</button></p>}
      {items?.length === 0 && <p className="caption">Log a set in Lifts to start tracking progress.</p>}
      {!!items?.length && <ul className="entry-list progress-list">{items.map(item => {
        const bodyweight = item.bestWeightKg === 0;
        const change = fromKg(item.latestWeightKg - item.firstWeightKg, item.unit);
        const latest = bodyweight ? `${item.latestReps} reps` : `${formatNumber(fromKg(item.latestWeightKg, item.unit))} ${item.unit} × ${item.latestReps}`;
        return <li key={item.id}><button type="button" className="workout-row" aria-label={`${item.name}, latest ${latest}. View progress`} onClick={() => setOpen(item)}>
          <span className="food-name">{item.name}<span className="caption block">{item.sessions} {item.sessions === 1 ? 'workout' : 'workouts'} · last {item.lastDate}</span></span>
          <span className="max-set"><strong>{latest}</strong>{!bodyweight && item.sessions > 1 && <span className={`caption${change > 0 ? ' gain' : ''}`}>{change > 0 ? '+' : ''}{formatNumber(change)} {item.unit}</span>}</span>
          <span aria-hidden="true" className="chevron">›</span>
        </button></li>;
      })}</ul>}
    </>}
  </section>;
}
