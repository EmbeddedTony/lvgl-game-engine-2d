export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          if (Number.isFinite(e.target.valueAsNumber))
            onChange(Math.max(min, Math.min(max, Math.round(e.target.valueAsNumber))));
        }}
      />
    </label>
  );
}
