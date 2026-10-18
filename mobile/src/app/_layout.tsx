import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View, type ColorValue } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '../../session';
import { ThemeProvider, useTheme } from '../../theme';

function TabIcon({ name, color }: { name: 'food' | 'lifts' | 'settings'; color: ColorValue }) {
  if (name === 'food') return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[s.foodIcon, { borderColor: color }]}>{[0, 1, 2].map(value => <View key={value} style={[s.foodLine, { backgroundColor: color }]} />)}</View>;
  if (name === 'lifts') return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.liftIcon}><View style={[s.weight, { borderColor: color }]} /><View style={[s.bar, { backgroundColor: color }]} /><View style={[s.weight, { borderColor: color }]} /></View>;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.settingsIcon}>{[0, 1, 2].map(value => <View key={value} style={[s.settingLine, { backgroundColor: color }]}><View style={[s.knob, { backgroundColor: color, left: value === 1 ? 12 : 4 }]} /></View>)}</View>;
}

function Navigation() {
  const { colors, common, dark } = useTheme();
  const { loaded, available, restoreError, restore, user, guest } = useSession();
  return <>
    <StatusBar style={dark ? 'light' : 'dark'} />
    {!loaded || !available ? <SafeAreaView style={common.screen}><View style={[common.content, { flex: 1, justifyContent: 'center', alignItems: 'center' }]}><Text style={common.title}>Avocado</Text><Text accessibilityRole={restoreError ? 'alert' : undefined} style={common.secondary}>{!loaded ? 'Opening your diary…' : restoreError}</Text>{loaded && <Pressable accessibilityRole="button" style={common.button} onPress={() => void restore()}><Text style={common.buttonText}>Try again</Text></Pressable>}</View></SafeAreaView> :
      <Tabs key={user?.id || (guest ? 'guest' : 'account')} screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.separator }, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.secondary, tabBarLabelStyle: { fontSize: 11, fontWeight: '500' } }}>
        <Tabs.Screen name="index" options={{ title: 'Food', tabBarIcon: ({ color }) => <TabIcon name="food" color={color} /> }} />
        <Tabs.Screen name="lifts" options={{ title: 'Lifts', tabBarIcon: ({ color }) => <TabIcon name="lifts" color={color} /> }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings', href: guest ? null : undefined, tabBarIcon: ({ color }) => <TabIcon name="settings" color={color} /> }} />
        <Tabs.Screen name="auth" options={{ href: null, tabBarStyle: { display: 'none' } }} />
      </Tabs>}
  </>;
}

export default function Layout() { return <SessionProvider><ThemeProvider><Navigation /></ThemeProvider></SessionProvider>; }

const s = StyleSheet.create({
  foodIcon: { width: 20, height: 23, borderWidth: 1.8, borderRadius: 4, justifyContent: 'space-evenly', paddingHorizontal: 4, paddingVertical: 3 },
  foodLine: { height: 1.8, width: 9, borderRadius: 1 },
  liftIcon: { width: 26, height: 22, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  weight: { width: 6, height: 18, borderRadius: 2, borderWidth: 1.8 },
  bar: { width: 12, height: 2 },
  settingsIcon: { width: 24, height: 24, justifyContent: 'space-evenly' },
  settingLine: { height: 1.8, width: 23, borderRadius: 1 },
  knob: { position: 'absolute', top: -2, height: 6, width: 5, borderRadius: 2 },
});
