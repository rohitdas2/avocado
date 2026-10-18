import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import useScopedApi from './useScopedApi';
import useForegroundRefresh from './useForegroundRefresh';
import { type Colors, useTheme } from './theme';

// Shared progress view for one catalog exercise. Lifts shows it (compact, with overload
// suggestions) while logging; Profile shows it in full. Both read the same endpoint,
// GET /api/exercises/{id}/progress, so the two screens can never disagree.
export type Unit = 'lb' | 'kg';
export type SetValue = { reps: number; weight: number; unit: Unit };
export type Target = { weight: number; unit: Unit; reps: number; sets: number };
type Session = { id: string; name: string; date: string; isCurrent: boolean; sets: SetValue[]; topSet: SetValue; volumeKg: number; e1rmKg: number; maxReps: number };
type Progress = { sessions: Session[]; lastSession: Session | null; suggestion: { same: Target; options: (Target & { kind: 'weight' | 'reps' })[] } | null; bestE1rmKg: number | null };

const KG_PER_LB = 0.45359237;
export const fromKg = (kg: number, unit: Unit) => unit === 'kg' ? kg : kg / KG_PER_LB;
export const formatNumber = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);

// "3 × 8 · 135 lb" when every set matches; otherwise each set, so pyramids and drop sets stay visible.
export function setsSummary(sets: SetValue[]) {
  if (!sets.length) return 'No sets';
  const [first] = sets;
  if (sets.every(set => set.reps === first.reps && set.weight === first.weight && set.unit === first.unit)) return `${sets.length} × ${first.reps} · ${formatNumber(first.weight)} ${first.unit}`;
  return sets.map(set => `${set.reps} @ ${formatNumber(set.weight)} ${set.unit}`).join(', ');
}
const targetSummary = (target: Target) => `${target.sets} × ${target.reps} · ${formatNumber(target.weight)} ${target.unit}`;

type Props = {
  exerciseId: string;
  compact?: boolean; // Lifts form: last session, suggestions, short chart. Profile: full history list too.
  refreshKey?: number; // Bump after logging so the chart includes the new sets.
  onApply?: (target: Target) => void; // Fill the logging form; omitted on Profile.
  onLoaded?: (suggestion: Progress['suggestion']) => void; // Lets Lifts prefill an empty form once.
};

export default function ExerciseProgress({ exerciseId, compact = false, refreshKey = 0, onApply, onLoaded }: Props) {
  const api = useScopedApi();
  const { colors, common } = useTheme();
  const s = styles(colors);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const loadedOnce = useRef(false);
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);
  const refresh = useCallback(() => {
    let active = true;
    api<Progress>(`/exercises/${exerciseId}/progress`).then(data => {
      if (!active) return;
      setProgress(data); setError('');
      if (!loadedOnce.current) { loadedOnce.current = true; onLoadedRef.current?.(data.suggestion); }
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [api, exerciseId]);
  useEffect(() => refresh(), [refresh, refreshKey]);
  useForegroundRefresh(refresh);

  if (error && !progress) return <Text style={common.error}>{error}</Text>;
  if (!progress) return <Text style={common.secondary}>Loading history…</Text>;
  if (!progress.sessions.length) return <Text style={common.secondary}>First time logging this exercise. Its progress starts with today’s sets.</Text>;

  const unit: Unit = progress.lastSession?.topSet.unit || progress.sessions[progress.sessions.length - 1].topSet.unit;
  // Bodyweight movements (all sets at 0) progress by reps, so chart max reps instead of 1RM.
  const byReps = progress.sessions.every(session => session.e1rmKg === 0);
  const metric = (session: Session) => byReps ? session.maxReps : fromKg(session.e1rmKg, unit);
  const metricUnit = byReps ? 'reps' : unit;
  const shown = progress.sessions.slice(compact ? -8 : -20);
  const values = shown.map(metric);
  const best = Math.max(...values);
  const change = values[values.length - 1] - values[0];
  const low = Math.min(...values), high = Math.max(...values);
  // Non-zero baseline: overload steps are small next to the lift itself; the range is labeled.
  const padding = Math.max((high - low) * 0.15, byReps ? 1 : 2.5);
  const min = Math.max(0, low - padding), max = high + padding;
  const chartHeight = compact ? 90 : 140, inset = 14;
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : inset + index * (width - inset * 2) / (values.length - 1),
    y: 8 + (1 - (value - min) / (max - min)) * (chartHeight - 16),
    value,
  }));
  const focus = selected ?? values.length - 1;
  const focused = shown[focus];

  return <View style={s.wrap}>
    {progress.lastSession && <Text style={common.secondary}>Last time · {progress.lastSession.date}: {setsSummary(progress.lastSession.sets)}</Text>}
    {onApply && progress.suggestion && <View style={s.field}>
      <Text style={common.label}>Next set target</Text>
      <View style={s.chips}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Repeat last time: ${targetSummary(progress.suggestion.same)}`} style={s.chip} onPress={() => onApply(progress.suggestion!.same)}>
          <Text style={s.chipLabel}>Repeat</Text><Text style={s.chipValue}>{targetSummary(progress.suggestion.same)}</Text>
        </Pressable>
        {progress.suggestion.options.map(option => <Pressable key={option.kind} accessibilityRole="button" accessibilityLabel={`${option.kind === 'weight' ? 'Add weight' : 'Add a rep'}: ${targetSummary(option)}`} style={[s.chip, s.chipAccent]} onPress={() => onApply(option)}>
          <Text style={[s.chipLabel, { color: colors.accent }]}>{option.kind === 'weight' ? `+${formatNumber(option.weight - progress.suggestion!.same.weight)} ${option.unit}` : '+1 rep'}</Text><Text style={s.chipValue}>{targetSummary(option)}</Text>
        </Pressable>)}
      </View>
    </View>}
    <View style={s.field}>
      <View style={common.listHeader}>
        <Text style={common.label}>{byReps ? 'Most reps in a set' : 'Estimated 1-rep max'} · {metricUnit}</Text>
        {values.length > 1 && <Text style={[common.label, { color: change > 0 ? colors.accent : colors.secondary }]}>{change > 0 ? '+' : ''}{formatNumber(change)} {metricUnit} over {values.length} sessions</Text>}
      </View>
      <View style={{ height: chartHeight }} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)} accessibilityLabel={`${byReps ? 'Most reps' : 'Estimated one-rep max'} per session, ${formatNumber(values[0])} to ${formatNumber(values[values.length - 1])} ${metricUnit}`}>
        {width > 0 && <>
          <View pointerEvents="none" style={[s.gridLine, { top: 8 }]} />
          <View pointerEvents="none" style={[s.gridLine, { top: chartHeight - 8 }]} />
          {points.map((point, index) => {
            const previous = points[index - 1];
            if (!previous) return null;
            const dx = point.x - previous.x, dy = point.y - previous.y, length = Math.hypot(dx, dy);
            return <View key={`segment-${index}`} pointerEvents="none" style={[s.segment, { left: (previous.x + point.x - length) / 2, top: (previous.y + point.y) / 2 - 1, width: length, transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }] }]} />;
          })}
          {/* Hit targets are wider than the 8 px markers; tapping selects a session for the caption. */}
          {points.map((point, index) => <Pressable key={shown[index].id} accessibilityRole="button" accessibilityLabel={`${shown[index].date}: ${formatNumber(point.value)} ${metricUnit}`} accessibilityState={{ selected: index === focus }} onPress={() => setSelected(index)} style={[s.hit, { left: point.x - 18, top: point.y - 18 }]}>
            <View style={[s.point, index === focus && s.pointFocused, point.value === best && s.pointBest]} />
          </Pressable>)}
        </>}
      </View>
      <View style={common.listHeader}><Text style={common.label}>{formatNumber(min)}–{formatNumber(max)} {metricUnit}</Text><Text style={common.label}>Best {formatNumber(best)} {metricUnit}</Text></View>
      {focused && <Text style={common.secondary}>{focused.date}{focused.isCurrent ? ' (in progress)' : ''}: {formatNumber(values[focus])} {metricUnit} · {setsSummary(focused.sets)}</Text>}
    </View>
    {!compact && <View style={s.field}>
      <Text style={common.heading}>History</Text>
      {[...progress.sessions].reverse().map(session => <View key={session.id} style={common.listRow}><View style={common.item}><Text style={common.text}>{session.date} · {session.name}</Text><Text style={common.secondary}>{setsSummary(session.sets)}</Text></View></View>)}
    </View>}
  </View>;
}

const styles = (colors: Colors) => StyleSheet.create({
  wrap: { gap: 12 },
  field: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.separator, minHeight: 44, gap: 2 },
  chipAccent: { backgroundColor: colors.accentSurface, borderColor: colors.accentSurface },
  chipLabel: { color: colors.secondary, fontSize: 12, fontWeight: '600' },
  chipValue: { color: colors.text, fontSize: 14 },
  gridLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.separator },
  segment: { position: 'absolute', height: 2, backgroundColor: colors.accent },
  hit: { position: 'absolute', width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface },
  pointFocused: { width: 12, height: 12, borderRadius: 6 },
  pointBest: { backgroundColor: colors.text },
});
