import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import SignIn from './SignIn';
import { useSession } from './session';
import { useTheme } from './theme';

export default function ScreenHeader({ title }: { title: string }) {
  const { guest } = useSession();
  const { common } = useTheme();
  const [mode, setMode] = useState<'login' | 'register' | null>(null);
  return <><View style={[common.listHeader, { gap: 12 }]}>
    <Text style={[common.title, { flex: 1 }]}>{title}</Text>
    {guest && <View style={[common.row, { gap: 8 }]}>
      <Pressable accessibilityRole="button" style={common.textButton} onPress={() => setMode('login')}><Text style={common.link}>Log in</Text></Pressable>
      <Pressable accessibilityRole="button" style={common.textButton} onPress={() => setMode('register')}><Text style={common.link}>Sign up</Text></Pressable>
    </View>}
  </View>{guest && mode && <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setMode(null)}>
    <SignIn key={mode} initialMode={mode} onCancel={() => setMode(null)} />
  </Modal>}</>;
}
