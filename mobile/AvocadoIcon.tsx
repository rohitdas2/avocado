import { View } from 'react-native';
import { useTheme } from './theme';

// A half avocado drawn with Views (no SVG dependency): pear-shaped skin from two overlapping
// circles, lighter flesh inset the same way, and a brown pit. Used as the Profile tab icon.
// Inactive tabs dim it rather than recolor it, so it always reads as an avocado.
export default function AvocadoIcon({ size = 26, active = true }: { size?: number; active?: boolean }) {
  const { dark } = useTheme();
  const skin = dark ? '#5e8a2a' : '#3b5a17';
  const flesh = '#c9db7a';
  const pit = '#7a4b26';
  const width = size * 0.78;
  const circle = (diameter: number, top: number, color: string) => ({ position: 'absolute' as const, width: diameter, height: diameter, borderRadius: diameter / 2, top, left: (width - diameter) / 2, backgroundColor: color });
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width, height: size, opacity: active ? 1 : 0.55, transform: [{ rotate: '-18deg' }] }}>
    <View style={circle(width * 0.62, 0, skin)} />
    <View style={circle(width, size - width, skin)} />
    <View style={circle(width * 0.44, width * 0.1, flesh)} />
    <View style={circle(width * 0.8, size - width + width * 0.1, flesh)} />
    <View style={circle(width * 0.4, size - width * 0.66, pit)} />
  </View>;
}
