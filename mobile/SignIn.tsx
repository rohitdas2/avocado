import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from './session';
import { useTheme } from './theme';

export default function SignIn({ initialMode = 'login', onCancel }: { initialMode?: 'login' | 'register'; onCancel?: () => void }) {
  const { colors, common, dark } = useTheme();
  const { authenticate, restoreError, restore } = useSession();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (!email.trim() || !password || (mode === 'register' && (!name.trim() || password.length < 12))) { setError(mode === 'register' ? 'Enter your name, email, and a password of at least 12 characters.' : 'Enter your email and password.'); return; }
    lock.current = true; setBusy(true); setError('');
    try { await authenticate(mode, { name: name.trim(), email: email.trim(), password }); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  }
  return <SafeAreaView style={common.screen}><KeyboardAvoidingView style={common.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={[common.content, { flexGrow: 1, justifyContent: 'center' }]} keyboardShouldPersistTaps="handled">
    <Text style={common.title}>Avocado</Text>
    {onCancel && <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={common.textButton}><Text style={common.link}>Cancel</Text></Pressable>}
    <View style={common.card}>
      <Text style={common.heading}>{mode === 'register' ? 'Sign up' : 'Log in'}</Text>
      {mode === 'register' && <View style={common.field}><Text style={common.label}>Name</Text><TextInput accessibilityLabel="Name" value={name} onChangeText={setName} style={common.input} maxLength={80} autoComplete="name" textContentType="name" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>}
      <View style={common.field}><Text style={common.label}>Email</Text><TextInput accessibilityLabel="Email" value={email} onChangeText={setEmail} style={common.input} maxLength={254} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      <View style={common.field}><Text style={common.label}>Password</Text><TextInput key={mode} accessibilityLabel="Password" value={password} onChangeText={setPassword} style={common.input} maxLength={128} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} textContentType={mode === 'register' ? 'newPassword' : 'password'} editable={!busy} keyboardAppearance={dark ? 'dark' : 'light'} /></View>
      {mode === 'register' && <Text style={common.secondary}>At least 12 characters.</Text>}
      <Text style={common.secondary}>{mode === 'register' ? 'Your guest entries move into your new account.' : 'Your guest entries move into your account. Existing account entries take priority.'}</Text>
      {!!error && <Text accessibilityRole="alert" style={common.error}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy} style={[common.button, busy && common.disabled]} onPress={submit}><Text style={common.buttonText}>{busy ? 'Please wait…' : mode === 'register' ? 'Sign up' : 'Log in'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={busy} style={[common.textButton, { alignItems: 'center' }]} onPress={() => { setMode(mode === 'login' ? 'register' : 'login'); setPassword(''); setError(''); }}><Text style={common.link}>{mode === 'login' ? 'Sign up' : 'Log in instead'}</Text></Pressable>
    </View>
    {!!restoreError && <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={common.secondary}>{restoreError}</Text><Pressable accessibilityRole="button" disabled={busy} onPress={() => void restore()} style={common.textButton}><Text style={{ color: colors.accent }}>Retry session</Text></Pressable></View>}
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
