import LogTime from '../../LogTime';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dateKey } from '../../api';
import useScopedApi from '../../useScopedApi';
import DateNavigation from '../../DateNavigation';
import { type Colors, useTheme } from '../../theme';
import useForegroundRefresh from '../../useForegroundRefresh';
import ScreenHeader from '../../ScreenHeader';
import ExerciseProgress, { setsSummary, type Target } from '../../ExerciseProgress';
import { groupSupersets, resolveTarget } from '../../workoutLogic';

// The catalog is app-owned: users choose a definition and record their own sets against it.
type CatalogExercise = { id: string; slug: string; name: string; category: string };
type ExerciseSet = { id: string; setNumber: number; reps: number; weight: number; unit: 'lb' | 'kg' };
// exerciseId is null only for migrated history whose typed name matched no catalog entry.
type Exercise = { id: string; exerciseId: string | null; exercise: string; createdAt?: string; supersetId: string | null; sets: ExerciseSet[] };
type Workout = { id: string; name: string; date: string; createdAt: string; isCurrent: boolean; exercises: Exercise[] };

export default function Lifts() {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [date, setDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  // The in-progress workout on any date (server-reported). While one exists, the screen offers only
  // "End workout", never "Start workout"; the server also refuses a second start with 409.
  const [inProgress, setInProgress] = useState<Omit<Workout, 'exercises'> | null>(null);
  const [catalog, setCatalog] = useState<CatalogExercise[] | null>(null);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<CatalogExercise | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<'lb' | 'kg'>('lb');
  const [reps, setReps] = useState('10');
  // Sets are logged one at a time. activeId is the exercise in the current workout that the next
  // set goes to (tap an exercise to switch, which is how supersets alternate). supersetNew makes a
  // newly chosen exercise join the active one's superset.
  const [activeId, setActiveId] = useState<string | null>(null);
  const [supersetNew, setSupersetNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const requestVersion = useRef(0);
  const key = dateKey(date);
  const current = workouts?.find(workout => workout.isCurrent);
  // Only an explicit tap on a historical workout can open the summary.
  const selected = workouts?.find(workout => workout.id === selectedId && !workout.isCurrent);
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (catalog || []).filter(item => !text || item.name.toLowerCase().includes(text) || item.category.includes(text));
  }, [catalog, query]);
  const refresh = useCallback(() => {
    if (lock.current) return;
    const version = ++requestVersion.current;
    api<{ workouts: Workout[]; current: Omit<Workout, 'exercises'> | null }>(`/workouts?date=${key}`).then(data => { if (version === requestVersion.current && !lock.current) { setWorkouts(data.workouts); setInProgress(data.current); setLoadError(''); } }).catch(e => { if (version === requestVersion.current && !lock.current) setLoadError(e.message); });
  }, [api, key]);
  useEffect(() => { refresh(); return () => { requestVersion.current += 1; }; }, [refresh, revision]);
  useForegroundRefresh(refresh);
  // Load the catalog once; a failed load retries on the next Refresh tap.
  useEffect(() => {
    if (catalog) return;
    let active = true;
    api<{ exercises: CatalogExercise[] }>('/exercises').then(data => { if (active) setCatalog(data.exercises); }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [api, catalog, revision]);
  async function mutate(change: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; requestVersion.current += 1; setBusy(true); setError('');
    try { await change(); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); setRevision(value => value + 1); }
  }
  async function startWorkout() {
    if (!name.trim()) { setError('Enter a workout name.'); return; }
    await mutate(async () => {
      const workout = await api<Workout>('/workouts', { method: 'POST', body: JSON.stringify({ name, date: key }) });
      setWorkouts(old => [...(old || []), workout]);
      setInProgress(workout);
      setName(''); setSelectedId(null); setChoice(null);
    });
  }
  async function endWorkout() {
    if (!inProgress) return;
    const id = inProgress.id;
    await mutate(async () => {
      await api(`/workouts/${id}/end`, { method: 'POST' });
      // The ended workout stays in the day's list as read-only history.
      setWorkouts(old => old?.map(item => item.id === id ? { ...item, isCurrent: false } : item) || []);
      setInProgress(null); setChoice(null);
    });
  }
  function goToWorkout() {
    if (!inProgress || lock.current) return;
    const [year, month, day] = inProgress.date.split('-').map(Number);
    requestVersion.current += 1; setWorkouts(null); setSelectedId(null); setError(''); setLoadError('');
    setDate(new Date(year, month - 1, day));
  }
  // The exercise entry the next set belongs to: the active one if it is the chosen exercise,
  // otherwise the latest entry of that exercise in this workout; none means a new entry.
  const active = current?.exercises.find(entry => entry.id === activeId);
  const target = resolveTarget(current?.exercises || [], activeId, choice?.id || null);
  const nextSetNumber = (target?.sets.length || 0) + 1;
  const replaceEntry = (entry: Exercise) => setWorkouts(old => old?.map(item => item.id === current?.id ? { ...item, exercises: item.exercises.some(e => e.id === entry.id) ? item.exercises.map(e => e.id === entry.id ? entry : e) : [...item.exercises, entry] } : item) || []);
  async function logSet() {
    if (lock.current || !current) return;
    if (!choice) { setError('Choose an exercise.'); return; }
    if (!weight.trim() || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 10000 || !/^\d+$/.test(reps) || Number(reps) < 1 || Number(reps) > 1000) {
      setError('Enter weight (0–10,000) and reps (1–1,000).'); return;
    }
    const set = { reps: Number(reps), weight: Number(weight), unit };
    await mutate(async () => {
      // Existing entry: append one set. New entry: create it with this first set, optionally
      // joining the active exercise's superset. Weight and reps stay filled for the next set.
      const entry = target
        ? await api<Exercise>(`/workouts/${current.id}/exercises/${target.id}/sets`, { method: 'POST', body: JSON.stringify(set) })
        : await api<Exercise>(`/workouts/${current.id}/exercises`, { method: 'POST', body: JSON.stringify({ exerciseId: choice.id, sets: [set], supersetWith: supersetNew && active ? active.id : null }) });
      replaceEntry(entry);
      setActiveId(entry.id); setSupersetNew(false);
    });
  }
  async function removeSet(entry: Exercise, setId: string) {
    if (!current) return;
    await mutate(async () => {
      // The last set's removal also removes the exercise (the server keeps every exercise non-empty).
      const result = await api<{ exercise: Exercise | null }>(`/workouts/${current.id}/exercises/${entry.id}/sets/${setId}`, { method: 'DELETE' });
      if (result.exercise) replaceEntry(result.exercise);
      else setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.filter(e => e.id !== entry.id) } : item) || []);
    });
  }
  async function leaveSuperset(entry: Exercise) {
    if (!current) return;
    await mutate(async () => {
      const result = await api<{ supersets: Record<string, string | null> }>(`/workouts/${current.id}/exercises/${entry.id}/superset`, { method: 'PUT', body: JSON.stringify({ with: null }) });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.map(e => ({ ...e, supersetId: result.supersets[e.id] ?? null })) } : item) || []);
    });
  }
  async function remove(id: string) {
    if (!current) return;
    await mutate(async () => {
      await api(`/workouts/${current.id}/exercises/${id}`, { method: 'DELETE' });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.filter(entry => entry.id !== id) } : item) || []);
      if (activeId === id) setActiveId(null);
    });
  }
  // Tapping an exercise in the workout makes it the target for the next set, prefilled from its last set.
  function activate(entry: Exercise) {
    const item = catalog?.find(c => c.id === entry.exerciseId);
    if (!item) { setError('This older exercise isn’t in the exercise list, so new sets can’t be added to it.'); return; }
    const last = entry.sets[entry.sets.length - 1];
    setChoice(item); setActiveId(entry.id); setSupersetNew(false); setError('');
    if (last) { setWeight(String(last.weight)); setUnit(last.unit); setReps(String(last.reps)); }
  }
  // Show superset members together, in the order their group first appears.
  const groups = groupSupersets(current?.exercises || []);
  function applyTarget(target: Target) {
    setWeight(String(target.weight)); setUnit(target.unit); setReps(String(target.reps)); setError('');
  }
  function openPicker() { setQuery(''); setPicking(true); }
  return <SafeAreaView style={common.screen}><KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader title="Lifts" />
    <DateNavigation date={date} disabled={busy} onChange={next => { if (!lock.current && dateKey(next) !== key) { requestVersion.current += 1; setWorkouts(null); setSelectedId(null); setError(''); setLoadError(''); setDate(next); } }} />
    {!!(error || loadError) && <Text accessibilityRole="alert" style={common.error}>{error || loadError}</Text>}
    <View style={common.card}>
      <View style={common.listHeader}><Text style={common.heading}>Workouts</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => setRevision(value => value + 1)} style={common.textButton}><Text style={common.link}>Refresh</Text></Pressable></View>
      {!workouts && !loadError && <Text style={common.secondary}>Loading…</Text>}
      {workouts?.length === 0 && <Text style={common.empty}>No workouts logged.</Text>}
      {workouts?.map(workout => <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`${workout.name}, ${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}${workout.isCurrent ? ', current workout' : ', view summary'}`} disabled={busy} style={common.listRow} onPress={() => workout.isCurrent ? openPicker() : setSelectedId(workout.id)}>
        <LogTime value={workout.createdAt} /><View style={common.item}><Text style={common.text}>{workout.name}</Text><Text style={common.secondary}>{workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}{workout.isCurrent ? ' · Current' : ''}</Text></View><Text style={common.link}>{workout.isCurrent ? '↓' : '›'}</Text>
      </Pressable>)}
    </View>
    {/* Start is offered only when nothing is in progress. A workout from another date shows here
        with a shortcut to its day, since exercises are added inline on the workout's own date. */}
    {inProgress && !current && <View style={common.card}>
      <View><Text style={common.label}>Workout in progress</Text><Text style={common.heading}>{inProgress.name}</Text><Text style={common.secondary}>{inProgress.date}</Text></View>
      <Pressable accessibilityRole="button" disabled={busy} style={[common.button, busy && common.disabled]} onPress={goToWorkout}><Text style={common.buttonText}>Go to workout</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={common.textButton} onPress={endWorkout}><Text style={common.deleteText}>End workout</Text></Pressable>
    </View>}
    {!inProgress && <View style={common.card}>
      <Text style={common.heading}>New workout</Text>
      <TextInput accessibilityLabel="Workout name" style={common.input} value={name} onChangeText={setName} placeholder="Push day" placeholderTextColor={colors.placeholder} maxLength={120} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} />
      <Pressable accessibilityRole="button" disabled={busy || !workouts} style={[common.button, (busy || !workouts) && common.disabled]} onPress={startWorkout}><Text style={common.buttonText}>Start workout</Text></Pressable>
    </View>}
    {current && <View style={common.card}>
      <View><Text style={common.label}>Current workout</Text><Text style={common.heading}>{current.name}</Text></View>
      {groups.map(group => <View key={group[0].id} style={group.length > 1 ? s.superset : undefined}>
        {group.length > 1 && <Text style={[common.label, s.supersetLabel]}>Superset · alternate sets</Text>}
        {group.map(entry => <View key={entry.id} style={[common.listRow, s.entry, entry.id === activeId && s.activeEntry]}>
          <View style={common.item}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${entry.exercise}. Log the next set here`} accessibilityState={{ selected: entry.id === activeId }} disabled={busy} onPress={() => activate(entry)}>
              <Text style={[common.text, entry.id === activeId && { color: colors.accent, fontWeight: '600' }]}>{entry.exercise}</Text>
            </Pressable>
            {entry.sets.map((set, index) => <View key={set.id} style={s.setRow}>
              <Text style={[common.secondary, s.setNumber]}>{index + 1}</Text>
              <Text style={[common.secondary, common.item]}>{set.reps} × {set.weight} {set.unit}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete set ${index + 1} of ${entry.exercise}`} disabled={busy} onPress={() => removeSet(entry, set.id)} style={s.setDelete}><Text style={common.deleteText}>✕</Text></Pressable>
            </View>)}
            {group.length > 1 && <Pressable accessibilityRole="button" disabled={busy} onPress={() => leaveSuperset(entry)}><Text style={common.label}>Remove from superset</Text></Pressable>}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.exercise}`} disabled={busy} onPress={() => remove(entry.id)} style={common.textButton}><Text style={common.deleteText}>Delete</Text></Pressable>
        </View>)}
      </View>)}
      <View style={common.field}><Text style={common.label}>Exercise</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={choice ? `Exercise: ${choice.name}. Change exercise` : 'Choose exercise'} disabled={busy || !catalog} style={[common.input, s.picker, (busy || !catalog) && common.disabled]} onPress={openPicker}>
          <Text style={choice ? common.text : s.placeholder}>{choice ? choice.name : catalog ? 'Choose exercise' : 'Loading exercises…'}</Text><Text style={common.link}>›</Text>
        </Pressable>
      </View>
      {/* Offered only when starting a different exercise while another is active in this workout. */}
      {choice && !target && active && <Pressable accessibilityRole="switch" accessibilityState={{ checked: supersetNew }} disabled={busy} style={s.toggle} onPress={() => setSupersetNew(value => !value)}>
        <View style={[s.box, supersetNew && s.boxOn]}>{supersetNew && <Text style={s.check}>✓</Text>}</View>
        <Text style={common.text}>Superset with {active.exercise}</Text>
      </Pressable>}
      {/* Progressive overload: last session, Repeat / +weight / +1 rep targets, and the trend, from
          the same shared component and endpoint the Profile tab uses. A chip only fills the form. */}
      {choice && <ExerciseProgress key={choice.id} exerciseId={choice.id} compact refreshKey={revision} onApply={applyTarget} onLoaded={suggestion => { if (suggestion && !weight.trim()) applyTarget(suggestion.same); }} />}
      <View style={common.field}>
        <View style={common.listHeader}><Text style={common.label}>Weight</Text><View style={s.units}>{(['lb', 'kg'] as const).map(value => <Pressable accessibilityRole="button" accessibilityLabel={`Weight in ${value === 'lb' ? 'pounds' : 'kilograms'}`} accessibilityState={{ selected: unit === value }} disabled={busy} style={[s.unit, unit === value && s.selected]} key={value} onPress={() => setUnit(value)}><Text style={[s.unitText, unit === value && s.selectedText]}>{value}</Text></Pressable>)}</View></View>
        <TextInput accessibilityLabel={`Weight in ${unit}`} style={common.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0 for bodyweight" placeholderTextColor={colors.placeholder} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} />
      </View>
      <View style={common.field}><Text style={common.label}>Reps</Text><TextInput accessibilityLabel="Reps" style={common.input} value={reps} onChangeText={setReps} keyboardType="number-pad" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <Pressable accessibilityRole="button" disabled={busy || !choice} style={[common.button, (busy || !choice) && common.disabled]} onPress={logSet}><Text style={common.buttonText}>{busy ? 'Saving…' : choice ? `Log set ${nextSetNumber}${target ? '' : ` · ${choice.name}`}` : 'Choose an exercise'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`End workout ${current.name}`} disabled={busy} style={[common.textButton, s.end]} onPress={endWorkout}><Text style={common.deleteText}>End workout</Text></Pressable>
    </View>}
    <Modal visible={picking} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicking(false)}>
      <SafeAreaView style={common.screen}>
        <View style={[common.content, s.sheet]}>
          <View style={common.listHeader}><Text accessibilityRole="header" style={[common.heading, common.item]}>Choose exercise</Text><Pressable accessibilityRole="button" style={common.textButton} onPress={() => setPicking(false)}><Text style={common.link}>Cancel</Text></Pressable></View>
          <TextInput accessibilityLabel="Search exercises" style={common.input} value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.placeholder} autoCorrect={false} keyboardAppearance={dark ? 'dark' : 'light'} />
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.summary}>
            {matches.length === 0 && <Text style={common.empty}>No matching exercises.</Text>}
            {matches.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: choice?.id === item.id }} style={common.listRow} onPress={() => { setChoice(item); setPicking(false); setError(''); const existing = [...(current?.exercises || [])].reverse().find(entry => entry.exerciseId === item.id); if (existing) setActiveId(existing.id); }}>
              <View style={common.item}><Text style={common.text}>{item.name}</Text><Text style={common.secondary}>{item.category}</Text></View>{choice?.id === item.id && <Text style={common.link}>✓</Text>}
            </Pressable>)}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close workout summary" onPress={() => setSelectedId(null)} />
        <View style={[common.card, s.modal]} accessibilityViewIsModal>
          <View style={common.listHeader}><Text accessibilityRole="header" style={[common.heading, common.item]}>{selected?.name}</Text><Pressable accessibilityRole="button" style={common.textButton} onPress={() => setSelectedId(null)}><Text style={common.link}>Close</Text></Pressable></View>
          <Text style={common.secondary}>{selected?.date} · {selected?.createdAt ? new Date(selected.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</Text>
          <ScrollView contentContainerStyle={s.summary}>
            {selected?.exercises.length === 0 && <Text style={common.empty}>No exercises logged.</Text>}
            {selected?.exercises.map(entry => <View key={entry.id} style={common.listRow}><View style={common.item}><Text style={common.text}>{entry.exercise}</Text><Text style={common.secondary}>{setsSummary(entry.sets)}</Text></View></View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = (colors: Colors) => StyleSheet.create({
  superset: { borderLeftWidth: 3, borderColor: colors.accent, paddingLeft: 10, marginTop: 4 },
  supersetLabel: { paddingTop: 8 },
  entry: { alignItems: 'flex-start' },
  activeEntry: { backgroundColor: colors.accentSurface, borderRadius: 10, paddingHorizontal: 8, paddingBottom: 8 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  setNumber: { width: 18, textAlign: 'right' },
  setDelete: { minWidth: 32, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.secondary, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  check: { color: colors.buttonText, fontSize: 14, fontWeight: '700' },
  end: { alignSelf: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modal: { maxHeight: '80%' },
  summary: { gap: 14 },
  sheet: { flex: 1 },
  picker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeholder: { color: colors.placeholder, fontSize: 17 },
  units: { flexDirection: 'row', backgroundColor: colors.background === '#000000' ? '#2c2c2e' : colors.background, borderRadius: 9, padding: 3 },
  unit: { paddingHorizontal: 13, minHeight: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accentSurface },
  unitText: { color: colors.secondary, fontSize: 14 },
  selectedText: { color: colors.accent, fontWeight: '600' },
});
