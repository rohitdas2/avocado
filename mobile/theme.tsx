import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from './session';

const lightColors = {
  background: '#f5f5f7',
  surface: '#ffffff',
  text: '#1d1d1f',
  secondary: '#6e6e73',
  placeholder: '#8e8e93',
  separator: '#e5e5ea',
  accent: '#237a36',
  buttonText: '#ffffff',
  accentSurface: '#e9f4ec',
  danger: '#c9342d',
  dangerSurface: '#fff0ee',
};

export type Colors = typeof lightColors;
const darkColors: Colors = {
  background: '#000000',
  surface: '#1c1c1e',
  text: '#f5f5f7',
  secondary: '#a1a1a6',
  placeholder: '#8e8e93',
  separator: '#38383a',
  accent: '#5bd478',
  buttonText: '#102816',
  accentSurface: '#173d22',
  danger: '#ff6961',
  dangerSurface: '#3b1c1c',
};

export type AppearancePreference = 'system' | 'light' | 'dark';
type Preferences = { appearance: AppearancePreference };
const defaults: Preferences = { appearance: 'system' };
const storageKey = 'avocado.preferences.v1';

function createCommon(colors: Colors) { return StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, gap: 18, paddingBottom: 32 },
  title: { color: colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -1, marginBottom: 2 },
  heading: { color: colors.text, fontSize: 17, fontWeight: '600' },
  text: { color: colors.text, fontSize: 16 },
  secondary: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  label: { color: colors.secondary, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderColor: colors.separator, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 18, gap: 14 },
  input: { backgroundColor: colors.background === '#000000' ? '#2c2c2e' : colors.background, borderRadius: 10, color: colors.text, padding: 13, fontSize: 16, minHeight: 46 },
  field: { gap: 7 },
  button: { backgroundColor: colors.accent, padding: 14, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.buttonText, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  link: { color: colors.accent, fontSize: 15 },
  textButton: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, paddingTop: 14 },
  item: { flex: 1, gap: 4 },
  deleteText: { color: colors.danger, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  empty: { color: colors.secondary, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingVertical: 14 },
}); }

type Theme = {
  colors: Colors;
  common: ReturnType<typeof createCommon>;
  dark: boolean;
  preferences: Preferences;
  loaded: boolean;
  loadError: string;
  savePreferences: (patch: Partial<Preferences>) => Promise<void>;
};
const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const systemScheme = useColorScheme();
  const [preferences, setPreferences] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(storageKey).then(value => {
      if (!value || !current) return;
      const saved: unknown = JSON.parse(value);
      if (typeof saved === 'object' && saved !== null) {
        const data = saved as Record<string, unknown>;
        setPreferences({
          appearance: data.appearance === 'light' || data.appearance === 'dark' ? data.appearance : 'system',
        });
      }
    }).catch(() => { if (current) setLoadError('Couldn’t load saved settings.'); }).finally(() => { if (current) setLoaded(true); });
    return () => { current = false; };
  }, []);
  const appearance = user ? preferences.appearance : 'system';
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? 'auto' : appearance); }, [appearance]);
  const dark = (appearance === 'system' ? systemScheme : appearance) === 'dark';
  const colors = dark ? darkColors : lightColors;
  const common = useMemo(() => createCommon(colors), [colors]);
  async function savePreferences(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    await AsyncStorage.setItem(storageKey, JSON.stringify(next));
    setPreferences(next);
    setLoadError('');
  }
  return <ThemeContext.Provider value={{ colors, common, dark, preferences, loaded, loadError, savePreferences }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('ThemeProvider is required.');
  return theme;
}
