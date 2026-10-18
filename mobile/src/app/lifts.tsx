import LogTime from '../../LogTime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dateKey } from '../../api';
import useScopedApi from '../../useScopedApi';
import DateNavigation from '../../DateNavigation';
import { type Colors, useTheme } from '../../theme';
import useForegroundRefresh from '../../useForegroundRefresh';
import ScreenHeader from '../../ScreenHeader';

type Exercise = { createdAt?: string; id: string; exercise: string; weight: number; unit: string; sets: number; reps: number };
type Workout = { id: string; name: string; date: string; createdAt: string; isCurrent: boolean; exercises: Exercise[] };

export default function Lifts() {
  const api = useScopedApi();
  const { colors, common, dark } = useTheme();
  const s = styles(colors);
  const [date, setDate] = useState(new Date());
  const [workouts, setWorkouts] = useState<Workout[] | null>(null);
  const [name, setName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exercise, setExercise] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState('lb');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('10');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const requestVersion = useRef(0);
  const exerciseInput = useRef<TextInputInstance>(null);
  const key = dateKey(date);
  const current = workouts?.find(workout => workout.isCurrent);
  // Only an explicit tap on a historical workout can open the summary.
  const selected = workouts?.find(workout => workout.id === selectedId && !workout.isCurrent);
  const refresh = useCallback(() => {
    if (lock.current) return;
    const version = ++requestVersion.current;
    api<{ workouts: Workout[] }>(`/workouts?date=${key}`).then(data => { if (version === requestVersion.current && !lock.current) { setWorkouts(data.workouts); setLoadError(''); } }).catch(e => { if (version === requestVersion.current && !lock.current) setLoadError(e.message); });
  }, [api, key]);
  useEffect(() => { refresh(); return () => { requestVersion.current += 1; }; }, [refresh, revision]);
  useForegroundRefresh(refresh);
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
      setWorkouts(old => [...(old || []).map(item => ({ ...item, isCurrent: false })), workout]);
      setName(''); setSelectedId(null); setExercise('');
    });
  }
  async function save() {
    if (lock.current || !current) return;
    if (!exercise.trim() || !weight.trim() || !Number.isFinite(Number(weight)) || Number(weight) < 0 || Number(weight) > 10000 || !/^\d+$/.test(sets) || !/^\d+$/.test(reps) || Number(sets) < 1 || Number(sets) > 100 || Number(reps) < 1 || Number(reps) > 1000) {
      setError('Enter an exercise, weight (0–10,000), sets (1–100), and reps (1–1,000).'); return;
    }
    await mutate(async () => {
      const entry = await api<Exercise>(`/workouts/${current.id}/exercises`, { method: 'POST', body: JSON.stringify({ exercise, weight: Number(weight), unit, sets: Number(sets), reps: Number(reps) }) });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: [...item.exercises, entry] } : item) || []);
      setExercise('');
    });
  }
  async function remove(id: string) {
    if (!current) return;
    await mutate(async () => {
      await api(`/workouts/${current.id}/exercises/${id}`, { method: 'DELETE' });
      setWorkouts(old => old?.map(item => item.id === current.id ? { ...item, exercises: item.exercises.filter(entry => entry.id !== id) } : item) || []);
    });
  }
  return <SafeAreaView style={common.screen}><KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
    <ScreenHeader title="Lifts" />
    <DateNavigation date={date} disabled={busy} onChange={next => { if (!lock.current && dateKey(next) !== key) { requestVersion.current += 1; setWorkouts(null); setSelectedId(null); setError(''); setLoadError(''); setDate(next); } }} />
    {!!(error || loadError) && <Text accessibilityRole="alert" style={common.error}>{error || loadError}</Text>}
    <View style={common.card}>
      <View style={common.listHeader}><Text style={common.heading}>Workouts</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => setRevision(value => value + 1)} style={common.textButton}><Text style={common.link}>Refresh</Text></Pressable></View>
      {!workouts && !loadError && <Text style={common.secondary}>Loading…</Text>}
      {workouts?.length === 0 && <Text style={common.empty}>No workouts logged.</Text>}
      {workouts?.map(workout => <Pressable key={workout.id} accessibilityRole="button" accessibilityLabel={`${workout.name}, ${workout.exercises.length} ${workout.exercises.length === 1 ? 'exercise' : 'exercises'}${workout.isCurrent ? ', current workout' : ', view summary'}`} disabled={busy} style={common.listRow} onPress={() => workout.isCurrent ? exerciseInput.current?.focus() : setSelectedId(workout.id)}>
        <LogTime value={workout.createdAt} /><View style={common.item}><Text style={common.text}>{workout.name}</Text><Text style={common.secondary}>{workout.exercises.length} {workout.exercises.length === 1 ? 'exercise' : 'exercises'}{workout.isCurrent ? ' · Current' : ''}</Text></View><Text style={common.link}>{workout.isCurrent ? '↓' : '›'}</Text>
      </Pressable>)}
    </View>
    <View style={common.card}>
      <Text style={common.heading}>New workout</Text>
      <TextInput accessibilityLabel="Workout name" style={common.input} value={name} onChangeText={setName} placeholder="Push day" placeholderTextColor={colors.placeholder} maxLength={120} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} />
      <Pressable accessibilityRole="button" disabled={busy || !workouts} style={[common.button, (busy || !workouts) && common.disabled]} onPress={startWorkout}><Text style={common.buttonText}>Start workout</Text></Pressable>
    </View>
    {current && <View style={common.card}>
      <View><Text style={common.label}>Current workout</Text><Text style={common.heading}>{current.name}</Text></View>
      {current.exercises.map(entry => <View key={entry.id} style={common.listRow}><View style={common.item}><Text style={common.text}>{entry.exercise}</Text><Text style={common.secondary}>{entry.sets} × {entry.reps} · {entry.weight} {entry.unit}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`Delete ${entry.exercise}`} disabled={busy} onPress={() => remove(entry.id)} style={common.textButton}><Text style={common.deleteText}>Delete</Text></Pressable></View>)}
      <View style={common.field}><Text style={common.label}>Exercise</Text><TextInput ref={exerciseInput} accessibilityLabel="Exercise" style={common.input} value={exercise} onChangeText={setExercise} placeholder="Squat" placeholderTextColor={colors.placeholder} maxLength={120} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <View style={common.field}>
        <View style={common.listHeader}><Text style={common.label}>Weight</Text><View style={s.units}>{['lb', 'kg'].map(value => <Pressable accessibilityRole="button" accessibilityLabel={`Weight in ${value === 'lb' ? 'pounds' : 'kilograms'}`} accessibilityState={{ selected: unit === value }} disabled={busy} style={[s.unit, unit === value && s.selected]} key={value} onPress={() => setUnit(value)}><Text style={[s.unitText, unit === value && s.selectedText]}>{value}</Text></Pressable>)}</View></View>
        <TextInput accessibilityLabel={`Weight in ${unit}`} style={common.input} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="0 for bodyweight" placeholderTextColor={colors.placeholder} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} />
      </View>
      <View style={common.row}>
        <View style={[common.field, s.numberField]}><Text style={common.label}>Sets</Text><TextInput accessibilityLabel="Sets" style={common.input} value={sets} onChangeText={setSets} keyboardType="number-pad" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
        <View style={[common.field, s.numberField]}><Text style={common.label}>Reps per set</Text><TextInput accessibilityLabel="Reps" style={common.input} value={reps} onChangeText={setReps} keyboardType="number-pad" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      </View>
      <Pressable accessibilityRole="button" disabled={busy} style={[common.button, busy && common.disabled]} onPress={save}><Text style={common.buttonText}>{busy ? 'Saving…' : 'Add exercise'}</Text></Pressable>
    </View>}
    <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelectedId(null)}>
      <View style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close workout summary" onPress={() => setSelectedId(null)} />
        <View style={[common.card, s.modal]} accessibilityViewIsModal>
          <View style={common.listHeader}><Text accessibilityRole="header" style={[common.heading, common.item]}>{selected?.name}</Text><Pressable accessibilityRole="button" style={common.textButton} onPress={() => setSelectedId(null)}><Text style={common.link}>Close</Text></Pressable></View>
          <Text style={common.secondary}>{selected?.date} · {selected?.createdAt ? new Date(selected.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}</Text>
          <ScrollView contentContainerStyle={s.summary}>
            {selected?.exercises.length === 0 && <Text style={common.empty}>No exercises logged.</Text>}
            {selected?.exercises.map(entry => <View key={entry.id} style={common.listRow}><View style={common.item}><Text style={common.text}>{entry.exercise}</Text><Text style={common.secondary}>{entry.sets} × {entry.reps} · {entry.weight} {entry.unit}</Text></View></View>)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const styles = (colors: Colors) => StyleSheet.create({
  numberField: { flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: 24 },
  modal: { maxHeight: '80%' },
  summary: { gap: 14 },
  units: { flexDirection: 'row', backgroundColor: colors.background === '#000000' ? '#2c2c2e' : colors.background, borderRadius: 9, padding: 3 },
  unit: { paddingHorizontal: 13, minHeight: 38, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: colors.accentSurface },
  unitText: { color: colors.secondary, fontSize: 14 },
  selectedText: { color: colors.accent, fontWeight: '600' },
});
