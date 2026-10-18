import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import useScopedApi from '../../useScopedApi';
import WeightTracker from '../../WeightTracker';
import AvocadoIcon from '../../AvocadoIcon';
import ProgressSheet from '../../ProgressSheet';
import { useSession } from '../../session';
import { type AppearancePreference, useTheme } from '../../theme';

// Profile (formerly Settings), for registered users: who you are, Progress (a page sheet listing
// every logged exercise, then each one's max-weight graph), bodyweight, then account controls.

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
  const [progressOpen, setProgressOpen] = useState(false);
  const lock = useRef(false);
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

    <Pressable accessibilityRole="button" accessibilityLabel="Progress. See every exercise you've logged" style={[common.card, common.listHeader]} onPress={() => setProgressOpen(true)}>
      <View style={common.item}><Text style={common.heading}>Progress</Text><Text style={common.secondary}>Every exercise you’ve logged, with a graph of each</Text></View>
      <Text style={common.link}>›</Text>
    </Pressable>

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

    <ProgressSheet visible={progressOpen} onClose={() => setProgressOpen(false)} />
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
