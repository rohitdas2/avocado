import LogTime from './LogTime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { request } from './api';
import ExerciseProgress, { type Target } from './ExerciseProgress';
import { groupSupersets, resolveTarget, setsSummary } from './workoutLogic';

// The same workout model as mobile Lifts (mobile/src/app/lifts.tsx), on the same /api/workouts
// routes: named workouts that are started and ended, exercises chosen from the app-owned catalog,
// sets logged one at a time, supersets, and progressive-overload targets.
type CatalogExercise = { id: string; slug: string; name: string; category: string };
type ExerciseSet = { id: string; setNumber: number; reps: number; weight: number; unit: 'lb' | 'kg' };
// exerciseId is null only for migrated history whose typed name matched no catalog entry.
type Exercise = { id: string; exerciseId: string | null; exercise: string; createdAt?: string; supersetId: string | null; sets: ExerciseSet[] };
type Workout = { id: string; name: string; date: string; createdAt: string; isCurrent: boolean; exercises: Exercise[] };
type WorkoutSummary = Omit<Workout, 'exercises'>;

function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return ref;
}

export default function Lifts({ date, onDateChange }: { date: string; onDateChange: (date: string) => void }) {
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  // The in-progress workout on any date. While one exists only "End workout" is offered; the
  // server also refuses a second start with 409.
  const [inProgress, setInProgress] = useState<WorkoutSummary | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<CatalogExercise | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [reps, setReps] = useState('10');
  // activeId is the exercise the next set goes to (click an exercise to switch, which is how
  // supersets alternate). supersetNew makes a newly chosen exercise join the active one's superset.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [supersetNew, setSupersetNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const requestVersion = useRef(0);
  const lifecycle = useRef<AbortController | null>(null);
  const pickerRef = useDialog(picking);
  const current = workouts?.find(workout => workout.isCurrent);
  const selected = workouts?.find(workout => workout.id === selectedId && !workout.isCurrent);
  const summaryRef = useDialog(!!selected);
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (catalog || []).filter(item => !text || item.name.toLowerCase().includes(text) || item.category.includes(text));
  }, [catalog, query]);

  useEffect(() => {
    const controller = new AbortController();
    lifecycle.current = controller;
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const version = ++requestVersion.current;
    request<{ workouts: Workout[]; current: WorkoutSummary | null }>(`/workouts?date=${date}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted && version === requestVersion.current) { setWorkouts(data.workouts); setInProgress(data.current); setLoadError(''); } })
      .catch(failure => { if (!controller.signal.aborted && version === requestVersion.current) setLoadError((failure as Error).message); });
    return () => controller.abort();
  }, [date, revision]);

  // Load the catalog once; a failed load retries on the next refresh.
  useEffect(() => {
    if (catalog) return;
    const controller = new AbortController();
    request<{ exercises: CatalogExercise[] }>('/exercises', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setCatalog(data.exercises); })
      .catch(failure => { if (!controller.signal.aborted) setLoadError((failure as Error).message); });
    return () => controller.abort();
  }, [catalog, revision]);

  useEffect(() => {
    // Match the food diary's focus/resume and foreground polling behavior.
    const reload = () => { if (document.visibilityState === 'visible' && !lock.current) setRevision(value => value + 1); };
    const interval = window.setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    document.addEventListener('visibilitychange', reload);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', reload); document.removeEventListener('visibilitychange', reload); };
  }, []);

  const mutate = useCallback(async (change: (signal?: AbortSignal) => Promise<void>) => {
    if (lock.current) return;
    lock.current = true; requestVersion.current += 1; setBusy(true); setError('');
    try { await change(lifecycle.current?.signal); }
    catch (failure) { if (!lifecycle.current?.signal.aborted) setError((failure as Error).message); }
    finally { lock.current = false; if (!lifecycle.current?.signal.aborted) { setBusy(false); setRevision(value => value + 1); } }
  }, []);

  function startWorkout(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Enter a workout name.'); return; }
    void mutate(async signal => {
      const workout = await request<Workout>('/workouts', { method: 'POST', signal, body: JSON.stringify({ name, date }) });
      setWorkouts(old => [...(old || []), workout]);
      setInProgress(workout);
      setName(''); setSelectedId(null); setChoice(null); setActiveId(null);
    });
  }

  function endWorkout() {
    if (!inProgress) return;
    const id = inProgress.id;
    void mutate(async signal => {
      await request(`/workouts/${id}/end`, { method: 'POST', signal });
      // The ended workout stays in the day's list as read-only history.
      setWorkouts(old => old?.map(item => item.id === id ? { ...item, isCurrent: false } : item) || []);
      setInProgress(null); setChoice(null); setActiveId(null);
    });
  }

  const active = current?.exercises.find(entry => entry.id === activeId);
  const target = resolveTarget(current?.exercises || [], activeId, choice?.id || null);
  const nextSetNumber = (target?.sets.length || 0) + 1;
  const replaceEntry = (entry: Exercise) => setWorkouts(old => old?.map(item => item.id === current?.id ? { ...item, exercises: item.exercises.some(e => e.id === entry.id) ? item.exercises.map(e => e.id === entry.id ? entry : e) : [...item.exercises, entry] } : item) || []);

  function logSet(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !current) return;
    if (!choice) { setError('Choose an exercise.'); return; }
    if (!weight.trim() || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 10000 || !/^\d+$/.test(reps) || Number(reps) < 1 || Number(reps) > 1000) {
      setError('Enter weight (0–10,000) and reps (1–1,000).'); return;
    }
    const set = { reps: Number(reps), weight: Number(weight), unit };
    void mutate(async signal => {
      // Existing entry: append one set. New entry: create it with this first set, optionally joining
      // the active exercise's superset. Weight and reps stay filled for the next set.
      const entry = target
        ? await request<Exercise>(`/workouts/${current.id}/exercises/${target.id}/sets`, { method: 'POST', signal, body: JSON.stringify(set) })
        : await request<Exercise>(`/workouts/${current.id}/exercises`, { method: 'POST', signal, body: JSON.stringify({ exerciseId: choice.id, sets: [set], supersetWith: supersetNew && active ? active.id : null }) });
      replaceEntry(entry);
      setActiveId(entry.id); setSupersetNew(false);
    });
  }

  function removeSet(entry: Exercise, setId: string) {
    if (!current) return;
    void mutate(async signal => {
      // Removing the last set also removes the exercise (the server keeps every exercise non-empty).
      const result = await request<{ exercise: Exercise | null }>(`/workouts/${current.id}/exercises/${entry.id}/sets/${setId}`, { method: 'DELETE', signal });
      if (result.exercise) replaceEntry(result.exercise);
      else {
        setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.filter(e => e.id !== entry.id) } : item) || []);
        if (activeId === entry.id) setActiveId(null);
      }
    });
  }

  function leaveSuperset(entry: Exercise) {
    if (!current) return;
    void mutate(async signal => {
      const result = await request<{ supersets: Record<string, string | null> }>(`/workouts/${current.id}/exercises/${entry.id}/superset`, { method: 'PUT', signal, body: JSON.stringify({ with: null }) });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.map(e => ({ ...e, supersetId: result.supersets[e.id] ?? null })) } : item) || []);
    });
  }

  function remove(id: string) {
    if (!current) return;
    void mutate(async signal => {
      await request(`/workouts/${current.id}/exercises/${id}`, { method: 'DELETE', signal });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.filter(entry => entry.id !== id) } : item) || []);
      if (activeId === id) setActiveId(null);
    });
  }

  // Clicking an exercise in the workout makes it the target for the next set, prefilled from its last set.
  function activate(entry: Exercise) {
    const item = catalog?.find(c => c.id === entry.exerciseId);
    if (!item) { setError('This older exercise isn’t in the exercise list, so new sets can’t be added to it.'); return; }
    const last = entry.sets[entry.sets.length - 1];
    setChoice(item); setActiveId(entry.id); setSupersetNew(false); setError('');
    if (last) { setWeight(String(last.weight)); setUnit(last.unit); setReps(String(last.reps)); }
  }

  function choose(item: CatalogExercise) {
    setChoice(item); setPicking(false); setError('');
    const existing = [...(current?.exercises || [])].reverse().find(entry => entry.exerciseId === item.id);
    if (existing) setActiveId(existing.id);
  }

  function applyTarget(next: Target) {
    setWeight(String(next.weight)); setUnit(next.unit); setReps(String(next.reps)); setError('');
  }

  const groups = groupSupersets(current?.exercises || []);
  const message = error || loadError;

  return <>
    {message && <div className="error" role="alert">{message}{!workouts && <button className="quiet" disabled={busy} onClick={() => setRevision(n => n + 1)}>Retry</button>}</div>}
    <div className="food-layout lift-layout">
      <div className="entry-tools">
        {/* Start is offered only when nothing is in progress. A workout on another date shows here
            with a shortcut to its day, since sets are added on the workout's own date. */}
        {inProgress && !current && <section className="card">
          <p className="field-label">Workout in progress</p>
          <h2 className="tight">{inProgress.name}</h2>
          <p className="caption">{inProgress.date}</p>
          <div className="stack">
            <button className="primary" disabled={busy} onClick={() => onDateChange(inProgress.date)}>Go to workout</button>
            <button className="quiet danger-text" disabled={busy} onClick={endWorkout}>End workout</button>
          </div>
        </section>}

        {!inProgress && <section className="card"><h2>New workout</h2><form onSubmit={startWorkout}>
          <label htmlFor="workout-name">Workout name</label>
          <input id="workout-name" value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Push day" maxLength={120} required />
          <button className="primary" disabled={busy || !workouts || !name.trim()}><Icon name="plus" />Start workout</button>
        </form></section>}

        {current && <section className="card lift-form"><h2>Log a set</h2><form onSubmit={logSet}>
          <label htmlFor="exercise-choice">Exercise</label>
          <button type="button" id="exercise-choice" className="picker" disabled={busy || !catalog} onClick={() => { setQuery(''); setPicking(true); }} aria-label={choice ? `Exercise: ${choice.name}. Change exercise` : 'Choose exercise'}>
            <span className={choice ? '' : 'muted'}>{choice ? choice.name : catalog ? 'Choose exercise' : 'Loading exercises…'}</span><span aria-hidden="true">›</span>
          </button>
          {/* Offered only when starting a different exercise while another is active in this workout. */}
          {choice && !target && active && <label className="checkbox"><input type="checkbox" checked={supersetNew} disabled={busy} onChange={event => setSupersetNew(event.target.checked)} />Superset with {active.exercise}</label>}
          {choice && <ExerciseProgress key={choice.id} exerciseId={choice.id} compact refreshKey={revision} onApply={applyTarget} onLoaded={suggestion => { if (suggestion && !weight.trim()) applyTarget(suggestion.same); }} />}
          <div className="set-fields">
            <label htmlFor="set-weight">Weight<input id="set-weight" type="number" min="0" max="10000" step="any" inputMode="decimal" required disabled={busy} value={weight} onChange={event => setWeight(event.target.value)} placeholder="0 for bodyweight" /></label>
            <label htmlFor="set-unit">Unit<select id="set-unit" disabled={busy} value={unit} onChange={event => setUnit(event.target.value as 'lb' | 'kg')}><option>lb</option><option>kg</option></select></label>
            <label htmlFor="set-reps">Reps<input id="set-reps" type="number" min="1" max="1000" step="1" required disabled={busy} value={reps} onChange={event => setReps(event.target.value)} /></label>
          </div>
          <button className="primary" disabled={busy || !choice}><Icon name="plus" />{busy ? 'Saving…' : choice ? `Log set ${nextSetNumber}${target ? '' : ` · ${choice.name}`}` : 'Choose an exercise'}</button>
        </form></section>}
      </div>

      <div className="lift-column">
        {current && <section className="card current-workout" aria-labelledby="current-workout-title">
          <div className="section-heading"><div><p className="field-label">Current workout</p><h2 id="current-workout-title">{current.name}</h2></div>
            <button className="quiet danger-text" disabled={busy} onClick={endWorkout} aria-label={`End workout ${current.name}`}>End workout</button></div>
          {current.exercises.length === 0 && <p className="caption">Choose an exercise and log your first set.</p>}
          {groups.map(group => <div key={group[0].id} className={group.length > 1 ? 'superset' : undefined}>
            {group.length > 1 && <p className="field-label">Superset · alternate sets</p>}
            {group.map(entry => <div key={entry.id} className={`workout-exercise${entry.id === activeId ? ' active' : ''}`}>
              <div className="exercise-heading">
                <button type="button" className="exercise-name" disabled={busy} aria-pressed={entry.id === activeId} aria-label={`${entry.exercise}. Log the next set here`} onClick={() => activate(entry)}>{entry.exercise}</button>
                <button className="delete icon-button" disabled={busy} aria-label={`Delete ${entry.exercise}`} onClick={() => remove(entry.id)}><Icon name="trash" /></button>
              </div>
              <ol className="set-list">{entry.sets.map((set, index) => <li key={set.id}>
                <span className="set-number">{index + 1}</span><span>{set.reps} × {set.weight} {set.unit}</span>
                <button className="delete icon-button small" disabled={busy} aria-label={`Delete set ${index + 1} of ${entry.exercise}`} onClick={() => removeSet(entry, set.id)}><Icon name="close" /></button>
              </li>)}</ol>
              {group.length > 1 && <button className="quiet small-link" disabled={busy} onClick={() => leaveSuperset(entry)}>Remove from superset</button>}
            </div>)}
          </div>)}
        </section>}

        <section className="card diary"><div className="section-heading"><h2>Workouts</h2>{workouts && <span className="count">{workouts.length}</span>}</div>
          {!workouts && <p className="empty-message" role="status">{loadError ? 'Workouts unavailable' : 'Loading…'}</p>}
          {workouts?.length === 0 && <div className="empty"><div className="empty-icon"><Icon name="lifts" /></div><h3>No workouts yet</h3><p>Start a workout to log sets.</p></div>}
          <ul className="entry-list timeline">{workouts?.map(workout => <li key={workout.id}>
            <LogTime value={workout.createdAt} />
            <button type="button" className="workout-row" disabled={busy || workout.isCurrent} onClick={() => setSelectedId(workout.id)} aria-label={`${workout.name}, ${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}${workout.isCurrent ? ', current workout' : ', view summary'}`}>
              <span className="food-name">{workout.name}<span className="caption block">{workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}{workout.isCurrent ? ' · Current' : ''}</span></span>
              {!workout.isCurrent && <span aria-hidden="true" className="chevron">›</span>}
            </button>
          </li>)}</ul>
        </section>
      </div>
    </div>

    <dialog ref={pickerRef} className="sheet" onClose={() => setPicking(false)} aria-labelledby="picker-title">
      <div className="section-heading"><h2 id="picker-title">Choose exercise</h2><button className="quiet" onClick={() => setPicking(false)}>Cancel</button></div>
      <input aria-label="Search exercises" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" autoFocus />
      <div className="results picker-results">
        {matches.length === 0 && <p className="caption">No matching exercises.</p>}
        {matches.map(item => <button key={item.id} className={`result${choice?.id === item.id ? ' chosen' : ''}`} aria-pressed={choice?.id === item.id} onClick={() => choose(item)}><span>{item.name}</span><small>{item.category}</small></button>)}
      </div>
    </dialog>

    <dialog ref={summaryRef} className="sheet" onClose={() => setSelectedId(null)} aria-labelledby="summary-title">
      {selected && <>
        <div className="section-heading"><h2 id="summary-title">{selected.name}</h2><button className="quiet" onClick={() => setSelectedId(null)}>Close</button></div>
        <p className="caption">{selected.date} · {new Date(selected.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</p>
        {selected.exercises.length === 0 && <p className="caption">No exercises logged.</p>}
        <ul className="entry-list">{selected.exercises.map(entry => <li key={entry.id}><div className="food-name">{entry.exercise}<p className="caption">{setsSummary(entry.sets)}</p></div></li>)}</ul>
      </>}
    </dialog>
  </>;
}
