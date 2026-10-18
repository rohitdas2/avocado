import { Text, TextInput, View } from 'react-native';
import { useTheme } from './theme';

export type MacroDraft = { protein: string; carbs: string; fat: string };
export const emptyMacros: MacroDraft = { protein: '', carbs: '', fat: '' };
export function parseMacros(values: MacroDraft) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() ? Number(value) : null])) as { protein: number | null; carbs: number | null; fat: number | null };
}
export function validMacros(values: MacroDraft) {
  return Object.values(parseMacros(values)).every(value => value === null || (Number.isFinite(value) && value >= 0 && value <= 100000));
}

export default function NutritionFields({ values, onChange, disabled }: { values: MacroDraft; onChange: (values: MacroDraft) => void; disabled: boolean }) {
  const { colors, common, dark } = useTheme();
  return <View style={{ gap: 8 }}>
    <Text style={common.label}>Macros · grams, optional</Text>
    <View style={[common.row, { gap: 10 }]}>{(['protein', 'carbs', 'fat'] as const).map(key => <View key={key} style={[common.field, { flex: 1 }]}>
      <Text style={common.label}>{key[0].toUpperCase() + key.slice(1)}</Text>
      <TextInput accessibilityLabel={`${key} in grams, optional`} value={values[key]} onChangeText={value => onChange({ ...values, [key]: value })} style={common.input} keyboardType="decimal-pad" keyboardAppearance={dark ? 'dark' : 'light'} placeholder="—" placeholderTextColor={colors.placeholder} maxLength={12} editable={!disabled} />
    </View>)}</View>
  </View>;
}
