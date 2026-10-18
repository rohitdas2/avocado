export type Macro = 'protein' | 'carbs' | 'fat';
export type MacroValues = Record<Macro, string>;
export const emptyMacros: MacroValues = { protein: '', carbs: '', fat: '' };

// An empty field is unknown, rather than a measured zero.
export function macroPayload(values: MacroValues) {
  return Object.fromEntries((['protein', 'carbs', 'fat'] as const).map(key => [key, values[key] === '' ? null : Number(values[key])]));
}

export function MacroInputs({ values, onChange, disabled, prefix }: { values: MacroValues; onChange: (macro: Macro, value: string) => void; disabled?: boolean; prefix: string }) {
  return <div className="macro-fields">{(['protein', 'carbs', 'fat'] as const).map(macro => <label key={macro} htmlFor={`${prefix}-${macro}`}>{macro[0].toUpperCase() + macro.slice(1)} <span className="muted">(g)</span><input id={`${prefix}-${macro}`} type="number" min="0" max="100000" step="0.1" placeholder="—" value={values[macro]} disabled={disabled} onChange={event => onChange(macro, event.target.value)} /></label>)}</div>;
}
