import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession } from './session';
import { useTheme } from './theme';

export default function ScreenHeader({ title }: { title: string }) {
  const { guest } = useSession();
  const { common } = useTheme();
  return <View style={[common.listHeader, { gap: 12 }]}>
    <Text style={[common.title, { flex: 1 }]}>{title}</Text>
    {guest && <View style={[common.row, { gap: 8 }]}>
      <Pressable accessibilityRole="button" style={common.textButton} onPress={() => router.push('/auth?mode=login')}><Text style={common.link}>Log in</Text></Pressable>
      <Pressable accessibilityRole="button" style={common.textButton} onPress={() => router.push('/auth?mode=register')}><Text style={common.link}>Sign up</Text></Pressable>
    </View>}
  </View>;
}
