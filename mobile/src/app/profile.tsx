import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import useScopedApi from '../../useScopedApi';
import useForegroundRefresh from '../../useForegroundRefresh';
import WeightTracker from '../../WeightTracker';
import AvocadoIcon from '../../AvocadoIcon';
import ExerciseProgress, { formatNumber, fromKg, type Unit } from '../../ExerciseProgress';
import { useSession } from '../../session';
import { type AppearancePreference, useTheme } from '../../theme';

// Profile (formerly Settings), for registered users: who you are, how your lifts are trending,
// bodyweight, then account controls. Exercise progress uses the same ExerciseProgress component
// and endpoint as the Lifts screen; /api/progress only supplies the per-exercise overview rows.
type Summary = { id: string; name: string; category: string; sessions: number; lastDate: string; bestE1rmKg: number; firstE1rmKg: number; latestE1rmKg: number; maxReps: number; unit: Unit };

function trend(item: Summary) {
  if (item.bestE1rmKg === 0) return { value: `${item.maxReps} reps`, change: '' };
  const change = fromKg(item.latestE1rmKg - item.firstE1rmKg, item.unit);
  return { value: `${formatNumber(fromKg(item.latestE1rmKg, item.unit))} ${item.unit}`, change: item.sessions > 1 ? `${change >= 0 ? '+' : ''}${formatNumber(change)} ${item.unit}` : '' };
}

export default function Profile() {
  const api = useScopedApi();
  const { colors, common, dark, preferences, loaded, loadError, savePreferences } = useTheme();
  const { user, guest, updateName, signOut } = useSession();
  const [name, setName] = useState(user?.name || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<Summary[] | null>(null);
  const [progressError, setProgressError] = useState('');
  const [openExercise, setOpenExercise] = useState<Summary | null>(null);
  const lock = useRef(false);
  const refreshProgress = useCallback(() => {
    let active = true;
    api<{ exercises: Summary[] }>('/progress').then(data => { if (active) { setProgress(data.exercises); setProgressError(''); } }).catch(e => { if (active) setProgressError(e.message); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => refreshProgress(), [refreshProgress]);
  useForegroundRefresh(refreshProgress);
  async function perform(action: () => Promise<void>, message: string) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setStatus('');
    try { await action(); setStatus(message); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  if (guest || !user) return <Redirect href="/" />;
  return <SafeAreaView style={common.screen}><KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={common.content} keyboardShouldPersistTaps="handled">
    <View style={common.row}><AvocadoIcon size={40} /><View style={common.item}><Text style={common.title} numberOfLines={1}>{user.name}</Text><Text style={common.secondary}>{user.email}</Text></View></View>

    <View style={common.card}>
      <View style={common.listHeader}><Text style={common.heading}>Progress</Text><Text style={common.label}>Latest est. 1-rep max</Text></View>
      {!progress && !progressError && <Text style={common.secondary}>Loading…</Text>}
      {!!progressError && <Text accessibilityRole="alert" style={common.error}>{progressError}</Text>}
      {progress?.length === 0 && <Text style={common.empty}>Log a lift to start tracking progress.</Text>}
      {progress?.map(item => { const { value, change } = trend(item); return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}: ${value}${change ? `, ${change} since first session` : ''}. View progress`} style={common.listRow} onPress={() => setOpenExercise(item)}>
        <View style={common.item}><Text style={common.text}>{item.name}</Text><Text style={common.secondary}>{item.sessions} {item.sessions === 1 ? 'session' : 'sessions'} · last {item.lastDate}</Text></View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}><Text style={common.text}>{value}</Text>{!!change && <Text style={[common.label, { color: change.startsWith('+') && change !== `+0 ${item.unit}` ? colors.accent : colors.secondary }]}>{change}</Text>}</View>
        <Text style={common.link}>›</Text>
      </Pressable>; })}
    </View>

    <WeightTracker />

    <View style={common.card}>
      <Text style={common.heading}>Account</Text>
      <View style={common.field}><Text style={common.label}>Name</Text><TextInput accessibilityLabel="Account name" style={common.input} value={name} onChangeText={value => { setName(value); setStatus(''); }} maxLength={80} editable={!busy} autoComplete="name" keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <Pressable accessibilityRole="button" disabled={busy || !name.trim() || name.trim() === user.name} style={[common.button, (busy || !name.trim() || name.trim() === user.name) && common.disabled]} onPress={() => void perform(() => updateName(name.trim()), 'Name saved.')}><Text style={common.buttonText}>Save name</Text></Pressable>
      <View style={common.field}><Text style={common.label}>Current password</Text><TextInput accessibilityLabel="Current password" style={common.input} value={currentPassword} onChangeText={setCurrentPassword} maxLength={128} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <View style={common.field}><Text style={common.label}>New password</Text><TextInput accessibilityLabel="New password" style={common.input} value={newPassword} onChangeText={setNewPassword} maxLength={128} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="new-password" textContentType="newPassword" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <Text style={common.secondary}>At least 12 characters.</Text>
      <Pressable accessibilityRole="button" disabled={busy || !currentPassword || newPassword.length < 12} style={[common.button, (busy || !currentPassword || newPassword.length < 12) && common.disabled]} onPress={() => void perform(async () => { await api('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }); setCurrentPassword(''); setNewPassword(''); }, 'Password changed. Other devices were signed out.')}><Text style={common.buttonText}>Change password</Text></Pressable>
    </View>

    <View style={common.card}>
      <Text style={common.heading}>Appearance</Text>
      {(['system', 'light', 'dark'] as AppearancePreference[]).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: preferences.appearance === value, disabled: busy || !loaded }} disabled={busy || !loaded} style={[common.listRow, { minHeight: 48, paddingTop: 0 }]} onPress={() => void perform(() => savePreferences({ appearance: value }), 'Appearance saved on this device.')}><Text style={[common.text, { flex: 1 }]}>{value[0].toUpperCase() + value.slice(1)}</Text>{preferences.appearance === value && <Text style={{ color: colors.accent, fontSize: 20 }}>✓</Text>}</Pressable>)}
      {!!loadError && <Text accessibilityRole="alert" style={common.error}>{loadError}</Text>}
    </View>
    {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
    {!!status && <Text accessibilityLiveRegion="polite" style={common.secondary}>{status}</Text>}
    {busy && <Text style={common.secondary}>Saving…</Text>}
    <Pressable accessibilityRole="button" disabled={busy} style={[common.textButton, { alignItems: 'center' }]} onPress={() => void perform(signOut, '')}><Text style={common.deleteText}>Log out</Text></Pressable>

    <Modal visible={!!openExercise} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpenExercise(null)}>
      <SafeAreaView style={common.screen}><ScrollView contentContainerStyle={common.content}>
        <View style={common.listHeader}><Text accessibilityRole="header" style={[common.title, common.item]} numberOfLines={2}>{openExercise?.name}</Text><Pressable accessibilityRole="button" style={common.textButton} onPress={() => setOpenExercise(null)}><Text style={common.link}>Done</Text></Pressable></View>
        {openExercise && <View style={common.card}><ExerciseProgress exerciseId={openExercise.id} /></View>}
      </ScrollView></SafeAreaView>
    </Modal>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
