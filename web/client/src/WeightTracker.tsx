import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { request } from './api';
import './WeightTracker.css';
import { dayWindow, lastDays, linePoints } from './workoutLogic';

type Unit = 'lb' | 'kg';
type WeightEntry = { date: string; weight: number; unit: Unit; weightKg?: number };
const poundsPerKg = 1 / 0.45359237;
const CHART_WIDTH = 600, CHART_HEIGHT = 150, CHART_INSET = 12;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function displayWeight(entry: WeightEntry, unit: Unit) {
  const kg = entry.weightKg ?? (entry.unit === 'kg' ? entry.weight : entry.weight * 0.45359237);
  return unit === 'kg' ? kg : kg * poundsPerKg;
}

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function WeightTracker() {
  const headingId = useId();
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<Unit>('lb');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [revision, setRevision] = useState(0);
  const mutation = useRef(false);
  const mounted = useRef(true);
  const lifecycle = useRef<AbortController | null>(null);
  const version = useRef(0);
  const hasLoaded = useRef(false);
  const draft = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => { mounted.current = false; controller.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadVersion = ++version.current;
    setLoading(!hasLoaded.current);
    request<{ entries: WeightEntry[] }>('/weights', { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted || loadVersion !== version.current) return;
        setEntries(result.entries);
        // Background reads update the chart without replacing an unfinished input.
        if (!hasLoaded.current && !draft.current) {
          const selected = result.entries.find(entry => entry.date === date);
          setWeight(selected ? displayWeight(selected, unit).toFixed(1) : '');
        }
        hasLoaded.current = true;
        setError('');
      })
      .catch(failure => { if (!controller.signal.aborted && loadVersion === version.current) setError(failure instanceof Error ? failure.message : 'Could not load weight logs.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // Date/unit changes edit the loaded records locally; retry reloads from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    const refresh = () => { if (!mutation.current && document.visibilityState === 'visible') setRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);

  // Same chart as mobile (mobile/WeightTracker.tsx): x is the day's place in the last 30 days, with
  // the axis starting at the first log (at least a week shown) so a short history spreads across the
  // card; logged days are joined in order; y is scaled to the logged range (labeled below) because
  // day-to-day changes are small next to body weight and a zero baseline made the line look flat.
  const days = lastDays(30);
  const byDate = new Map(entries.map(entry => [entry.date, entry]));
  const logged = days.map((day, index) => ({ day, index, entry: byDate.get(day) })).flatMap(item => item.entry ? [{ ...item, entry: item.entry }] : []);
  const values = logged.map(item => displayWeight(item.entry, unit));
  const axis = dayWindow(logged.map(item => item.index), days.length);
  const line = linePoints(values, logged.map(item => axis.position(item.index)), CHART_WIDTH, CHART_HEIGHT, unit === 'kg' ? 0.5 : 1, CHART_INSET);
  const points = line.points.map((point, position) => ({ ...point, day: logged[position].day }));
  const focus = points.find(point => point.day === date) || points[points.length - 1];
  const todayX = CHART_INSET + axis.position(days.length - 1) * (CHART_WIDTH - CHART_INSET * 2);
  const selected = entries.find(entry => entry.date === date);

  function selectDate(next: string) {
    draft.current = true;
    setDate(next); setSaved('');
    const entry = entries.find(item => item.date === next);
    setWeight(entry ? displayWeight(entry, unit).toFixed(1) : '');
  }

  function selectUnit(next: Unit) {
    if (next === unit) return;
    draft.current = true;
    if (weight && Number.isFinite(Number(weight))) {
      const converted = Number(weight) * (next === 'kg' ? 0.45359237 : poundsPerKg);
      setWeight(String(Math.round(converted * 10) / 10));
    }
    setUnit(next); setSaved('');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.current) return;
    if (!Number.isFinite(Number(weight)) || Number(weight) <= 0) {
      setError('Enter a weight greater than zero.');
      return;
    }
    mutation.current = true; version.current += 1; setBusy('save'); setError(''); setSaved('');
    try {
      const entry = await request<WeightEntry>('/weights', { method: 'POST', signal: lifecycle.current?.signal, body: JSON.stringify({ date, weight: Number(weight), unit }) });
      if (!mounted.current) return;
      setEntries(previous => [...previous.filter(item => item.date !== entry.date), entry].sort((a, b) => a.date.localeCompare(b.date)).slice(-30));
      setSaved('Weight saved.');
      setRevision(value => value + 1);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not save weight.');
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  async function remove() {
    if (mutation.current || !selected) return;
    mutation.current = true; version.current += 1; setBusy('delete'); setError(''); setSaved('');
    try {
      await request<void>(`/weights/${date}`, { method: 'DELETE', signal: lifecycle.current?.signal });
      if (!mounted.current) return;
      setEntries(previous => previous.filter(item => item.date !== date));
      setWeight(''); setSaved('Weight removed.');
      setRevision(value => value + 1);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Could not remove weight.');
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(null);
    }
  }

  return <section className="card weight-tracker" aria-labelledby={headingId}>
    <h2 id={headingId} className="section-heading">Weight</h2>
    <form className="weight-form" onSubmit={save} aria-busy={busy !== null}>
      <div><label htmlFor={`${headingId}-date`}>Date</label><input id={`${headingId}-date`} type="date" value={date} min="0001-01-01" max={dateKey(new Date())} required disabled={loading || busy !== null} onChange={event => { if (event.target.value) selectDate(event.target.value); }} /></div>
      <div><label htmlFor={`${headingId}-value`}>Weight</label><input id={`${headingId}-value`} type="number" inputMode="decimal" min="0" max={unit === 'kg' ? 1500 : 3307} step="any" value={weight} required disabled={loading || busy !== null} onChange={event => { draft.current = true; setWeight(event.target.value); setSaved(''); }} /></div>
      <div><label htmlFor={`${headingId}-unit`}>Unit</label><select id={`${headingId}-unit`} value={unit} disabled={loading || busy !== null} onChange={event => selectUnit(event.target.value as Unit)}><option value="lb">lb</option><option value="kg">kg</option></select></div>
      <button className="primary" disabled={loading || busy !== null}>{busy === 'save' ? 'Saving…' : selected ? 'Update weight' : 'Log weight'}</button>
    </form>
    {error && <p className="error" role="alert">{error}{!busy && <button className="quiet" onClick={() => setRevision(value => value + 1)}>Reload</button>}</p>}
    {saved && <p className="caption" role="status">{saved}</p>}
    {selected && <button className="quiet weight-remove" disabled={loading || busy !== null} onClick={() => void remove()}>{busy === 'delete' ? 'Removing…' : 'Remove this log'}</button>}
    {loading ? <p className="caption" role="status">Loading weight logs…</p> : entries.length === 0 ? (!error && <p className="empty-message">No weight logged.</p>) : !points.length ? <p className="empty-message">No weight logged in the last 30 days.</p> : <figure className="weight-chart">
      <figcaption>Daily weight <span className="muted">· up to 30 days · {unit}</span></figcaption>
      <div className="weight-series" style={{ height: CHART_HEIGHT }}>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={CHART_WIDTH} y1="10" y2="10" className="grid" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={CHART_WIDTH} y1={CHART_HEIGHT - 10} y2={CHART_HEIGHT - 10} className="grid" vectorEffect="non-scaling-stroke" />
          {/* Today's position, so recent entries are easy to find. */}
          <line x1={todayX} x2={todayX} y1="0" y2={CHART_HEIGHT} className="grid" vectorEffect="non-scaling-stroke" />
          <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* Clicking a point selects that day for editing. */}
        <div className="chart-points">{points.map(point => <button type="button" key={point.day} className={`chart-point${point.day === focus?.day ? ' focused' : ''}`} style={{ left: `${point.x / CHART_WIDTH * 100}%`, top: point.y }} disabled={busy !== null} aria-label={`${shortDate(point.day)}: ${point.value.toFixed(1)} ${unit}. Edit entry.`} aria-pressed={point.day === focus?.day} onClick={() => selectDate(point.day)}><span /></button>)}</div>
      </div>
      <div className="chart-legend"><span>{shortDate(days[axis.start])}</span><span>{line.min.toFixed(1)}–{line.max.toFixed(1)} {unit}</span><span>Today</span></div>
      {focus && <p className="caption">{shortDate(focus.day)}: {focus.value.toFixed(1)} {unit}{points.length > 1 ? ` · ${points[points.length - 1].value - points[0].value >= 0 ? '+' : ''}${(points[points.length - 1].value - points[0].value).toFixed(1)} ${unit} since ${shortDate(points[0].day)}` : ''}</p>}
    </figure>}
  </section>;
}
