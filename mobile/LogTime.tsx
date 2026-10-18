import { Text, View } from 'react-native';
import { useTheme } from './theme';
export default function LogTime({ value }: { value?: string }) {
  const { colors, common } = useTheme();
  const date = value ? new Date(value) : null;
  return <View style={{ width: 54, alignSelf: 'stretch', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.separator, paddingRight: 10 }}><Text style={common.label} accessibilityLabel={date ? `Logged ${date.toLocaleString()}` : 'Time unavailable'}>{date ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) : '—'}</Text><View style={{ position: 'absolute', top: '50%', marginTop: -3, right: -4, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent }} /></View>;
}
