import { useEffect, useRef, useState } from 'react';
import { request } from './api';
import { formatNumber, fromKg, linePoints, setsSummary, toKg, type SetValue, type Unit } from './workoutLogic';

// Shared progress view for one catalog exercise, as on mobile: Lifts shows it compact (last time,
// overload suggestions, short chart) while logging; Profile → Progress shows it in full. Both read
// GET /api/exercises/{id}/progress, so the two views can never disagree.
export type Target = { weight: number; unit: Unit; reps: number; sets: number };
type Session = { id: string; name: string; date: string; isCurrent: boolean; sets: SetValue[]; topSet: SetValue; volumeKg: number; e1rmKg: number; maxReps: number };
type Suggestion = { same: Target; options: (Target & { kind: 'weight' | 'reps' })[] };
type Progress = { sessions: Session[]; lastSession: Session | null; suggestion: Suggestion | null; bestE1rmKg: number | null };

const targetSummary = (target: Target) => `${target.sets} × ${target.reps} · ${formatNumber(target.weight)} ${target.unit}`;
const WIDTH = 600;

type Props = {
  exerciseId: string;
  compact?: boolean;
  refreshKey?: number; // Bump after logging so the chart includes the new sets.
  onApply?: (target: Target) => void; // Fill the logging form; omitted in Progress.
  onLoaded?: (suggestion: Suggestion | null) => void; // Lets Lifts prefill an empty form once.
};

export default function ExerciseProgress({ exerciseId, compact = false, refreshKey = 0, onApply, onLoaded }: Props) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const loadedOnce = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  useEffect(() => {
    const controller = new AbortController();
    request<Progress>(`/exercises/${exerciseId}/progress`, { signal: controller.signal }).then(data => {
      if (controller.signal.aborted) return;
      setProgress(data); setError('');
      if (!loadedOnce.current) { loadedOnce.current = true; onLoadedRef.current?.(data.suggestion); }
    }).catch(failure => { if (!controller.signal.aborted) setError((failure as Error).message); });
    return () => controller.abort();
  }, [exerciseId, refreshKey]);

  if (error && !progress) return <p className="error" role="alert">{error}</p>;
  if (!progress) return <p className="caption" role="status">Loading history…</p>;
  if (!progress.sessions.length) return <p className="caption">First time logging this exercise. Its progress starts with today’s sets.</p>;

  const unit: Unit = progress.lastSession?.topSet.unit || progress.sessions[progress.sessions.length - 1].topSet.unit;
  // Each workout's max weight (its top set); bodyweight movements (every set at 0) chart most reps.
  const byReps = progress.sessions.every(session => session.topSet.weight === 0);
  const metric = (session: Session) => byReps ? session.maxReps : fromKg(toKg(session.topSet.weight, session.topSet.unit), unit);
  const metricUnit = byReps ? 'reps' : unit;
  const shown = progress.sessions.slice(compact ? -8 : -20);
  const values = shown.map(metric);
  const best = Math.max(...values);
  const change = values[values.length - 1] - values[0];
  // Non-zero baseline: overload steps are small next to the lift itself; the range is labeled.
  const height = compact ? 90 : 140;
  const { points, min, max } = linePoints(values, values.map((_, index) => values.length === 1 ? 0.5 : index / (values.length - 1)), WIDTH, height, byReps ? 1 : 2.5, 14, 8);
  const focus = selected ?? values.length - 1;
  const focused = shown[focus];
  const suggestion = progress.suggestion;

  return <div className="exercise-progress">
    {progress.lastSession && <p className="caption">Last time · {progress.lastSession.date}: {setsSummary(progress.lastSession.sets)}</p>}
    {onApply && suggestion && <div>
      <p className="field-label">Next set target</p>
      <div className="chips">
        <button type="button" className="chip" aria-label={`Repeat last time: ${targetSummary(suggestion.same)}`} onClick={() => onApply(suggestion.same)}>
          <span>Repeat</span>{targetSummary(suggestion.same)}
        </button>
        {suggestion.options.map(option => <button type="button" key={option.kind} className="chip accent" aria-label={`${option.kind === 'weight' ? 'Add weight' : 'Add a rep'}: ${targetSummary(option)}`} onClick={() => onApply(option)}>
          <span>{option.kind === 'weight' ? `+${formatNumber(option.weight - suggestion.same.weight)} ${option.unit}` : '+1 rep'}</span>{targetSummary(option)}
        </button>)}
      </div>
    </div>}
    <figure className="progress-chart">
      <figcaption>
        <span>{byReps ? 'Most reps in a set' : 'Max weight per workout'} · {metricUnit}</span>
        {values.length > 1 && <span className={change > 0 ? 'gain' : ''}>{change > 0 ? '+' : ''}{formatNumber(change)} {metricUnit} over {values.length} sessions</span>}
      </figcaption>
      <div className="chart-area" style={{ height }}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" x2={WIDTH} y1="8" y2="8" className="grid" vectorEffect="non-scaling-stroke" />
        <line x1="0" x2={WIDTH} y1={height - 8} y2={height - 8} className="grid" vectorEffect="non-scaling-stroke" />
        <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Markers are HTML buttons over the stretched SVG, so they stay round and clickable. */}
      <div className="chart-points">
        {points.map((point, index) => <button type="button" key={shown[index].id} className={`chart-point${index === focus ? ' focused' : ''}${point.value === best ? ' best' : ''}`} style={{ left: `${point.x / WIDTH * 100}%`, top: point.y }} aria-label={`${shown[index].date}: ${formatNumber(point.value)} ${metricUnit}`} aria-pressed={index === focus} onClick={() => setSelected(index)}><span /></button>)}
      </div>
      </div>
      <div className="chart-legend"><span>{formatNumber(min)}–{formatNumber(max)} {metricUnit}</span><span>Best {formatNumber(best)} {metricUnit}</span></div>
    </figure>
    {focused && <p className="caption">{focused.date}{focused.isCurrent ? ' (in progress)' : ''}: max {formatNumber(focused.topSet.weight)} {focused.topSet.unit} × {focused.topSet.reps} · {setsSummary(focused.sets)}</p>}
    {!compact && <div>
      <h3 className="progress-subheading">Workouts</h3>
      <ul className="entry-list">{[...progress.sessions].reverse().map(session => <li key={session.id}>
        <div className="food-name">{session.date} · {session.name}{session.isCurrent ? ' (in progress)' : ''}<p className="caption">{setsSummary(session.sets)}</p></div>
        <div className="max-set"><strong>{formatNumber(session.topSet.weight)} {session.topSet.unit}</strong><span className="caption">× {session.topSet.reps} reps</span></div>
      </li>)}</ul>
    </div>}
  </div>;
}
