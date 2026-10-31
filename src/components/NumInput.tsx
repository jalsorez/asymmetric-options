import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  /** Multiply for display (e.g. 100 to show a decimal rate as %). */
  scale?: number;
  step?: number;
  min?: number;
  placeholder?: string;
  className?: string;
  allowEmpty?: boolean;
  ariaLabel?: string;
  width?: string;
}

function toText(v: number | null, scale: number) {
  if (v == null || !Number.isFinite(v)) return '';
  const x = v * scale;
  return String(Math.round(x * 1e6) / 1e6);
}

/** Numeric input that accepts "," or "." as decimal separator and commits valid numbers as you type. */
export function NumInput({ value, onChange, scale = 1, step, min, placeholder, className, allowEmpty, ariaLabel, width }: Props) {
  const [text, setText] = useState(toText(value, scale));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(toText(value, scale));
  }, [value, scale]);

  const commit = (t: string) => {
    const s = t.trim().replace(',', '.');
    if (s === '' && allowEmpty) return onChange(null);
    const n = Number(s);
    if (s !== '' && s !== '-' && Number.isFinite(n) && (min == null || n >= min)) onChange(n / scale);
  };

  return (
    <input
      className={`num ${className ?? ''}`}
      inputMode="decimal"
      value={text}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      style={width ? { width } : undefined}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setText(toText(value, scale));
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
