// Mirrors mobile/NutritionFields.tsx: optional per-entry macros in grams. An empty field is
// unknown (null), not a measured zero; Quick add and Custom foods validate with validMacros.
export type MacroDraft = { protein: string; carbs: string; fat: string };
export const emptyMacros: MacroDraft = { protein: '', carbs: '', fat: '' };
export function parseMacros(values: MacroDraft) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim() ? Number(value) : null])) as { protein: number | null; carbs: number | null; fat: number | null };
}
export function validMacros(values: MacroDraft) {
  return Object.values(parseMacros(values)).every(value => value === null || (Number.isFinite(value) && value >= 0 && value <= 100000));
}

export default function NutritionFields({ values, onChange, disabled, prefix }: { values: MacroDraft; onChange: (values: MacroDraft) => void; disabled: boolean; prefix: string }) {
  return <div className="nutrition-fields">
    <p className="field-label">Macros · grams, optional</p>
    <div className="macro-fields">{(['protein', 'carbs', 'fat'] as const).map(key => <label key={key} htmlFor={`${prefix}-${key}`}>
      {key[0].toUpperCase() + key.slice(1)}
      <input id={`${prefix}-${key}`} aria-label={`${key} in grams, optional`} inputMode="decimal" placeholder="—" maxLength={12} value={values[key]} disabled={disabled} onChange={event => onChange({ ...values, [key]: event.target.value })} />
    </label>)}</div>
  </div>;
}
