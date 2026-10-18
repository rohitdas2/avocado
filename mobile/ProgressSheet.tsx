import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import useScopedApi from './useScopedApi';
import ExerciseProgress, { formatNumber, fromKg, type Unit } from './ExerciseProgress';
import { useTheme } from './theme';

// Progress, opened from Profile as a native page sheet, the same pattern as the Log in / Sign up
// sheets and the exercise picker. Two views inside one sheet, switched with local state: the list
// of every exercise the user has logged (GET /api/progress), then one exercise's max-weight graph
// and workout list (ExerciseProgress, the component Lifts already uses). No extra routes, so tab
// navigation and the router are unchanged.
type Summary = { id: string; name: string; sessions: number; lastDate: string; unit: Unit;
  bestWeightKg: number; firstWeightKg: number; latestWeightKg: number; latestReps: number };

export default function ProgressSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const api = useScopedApi();
  const { colors, common } = useTheme();
  const [items, setItems] = useState<Summary[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Summary | null>(null);
  // Load each time the sheet opens so newly logged sets appear; a closed sheet makes no requests.
  const load = useCallback(() => {
    let active = true;
    api<{ exercises: Summary[] }>('/progress').then(data => { if (active) { setItems(data.exercises); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => (visible ? load() : undefined), [visible, load]);
  function close() { setOpen(null); onClose(); }
  return <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => (open ? setOpen(null) : close())}>
    <SafeAreaView style={common.screen}>
      <View style={[common.listHeader, { paddingHorizontal: 20, paddingTop: 12 }]}>
        {open
          ? <Pressable accessibilityRole="button" accessibilityLabel="Back to all exercises" style={common.textButton} onPress={() => setOpen(null)}><Text style={common.link}>‹ Progress</Text></Pressable>
          : <Text accessibilityRole="header" style={common.heading}>Progress</Text>}
        <Pressable accessibilityRole="button" style={common.textButton} onPress={close}><Text style={common.link}>Done</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={common.content}>
        {open ? <>
          <Text accessibilityRole="header" style={common.title}>{open.name}</Text>
          <View style={common.card}><ExerciseProgress key={open.id} exerciseId={open.id} /></View>
        </> : <>
          {!items && !error && <Text style={common.secondary}>Loading…</Text>}
          {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
          {items?.length === 0 && <Text style={common.empty}>Log a set in Lifts to start tracking progress.</Text>}
          {!!items?.length && <View style={common.card}>
            {items.map(item => {
              const bodyweight = item.bestWeightKg === 0;
              const change = fromKg(item.latestWeightKg - item.firstWeightKg, item.unit);
              const latest = bodyweight ? `${item.latestReps} reps` : `${formatNumber(fromKg(item.latestWeightKg, item.unit))} ${item.unit} × ${item.latestReps}`;
              return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, latest ${latest}. View progress`} style={common.listRow} onPress={() => setOpen(item)}>
                <View style={common.item}><Text style={common.text}>{item.name}</Text><Text style={common.secondary}>{item.sessions} {item.sessions === 1 ? 'workout' : 'workouts'} · last {item.lastDate}</Text></View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={common.text}>{latest}</Text>
                  {!bodyweight && item.sessions > 1 && <Text style={[common.label, { color: change > 0 ? colors.accent : colors.secondary }]}>{change > 0 ? '+' : ''}{formatNumber(change)} {item.unit}</Text>}
                </View>
                <Text style={common.link}>›</Text>
              </Pressable>;
            })}
          </View>}
        </>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}
