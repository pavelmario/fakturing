import { ChevronDown, ChevronUp } from "lucide-react";

type NumberFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  invalid?: boolean;
  ariaLabel?: string;
};

/**
 * A number input with steppers the design owns, replacing the browser's own
 * spinner arrows.
 */
export function NumberField({
  id,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  invalid = false,
  ariaLabel,
}: NumberFieldProps) {
  const nudge = (direction: 1 | -1) => {
    const current = Number(value);
    const base = Number.isFinite(current) ? current : 0;
    let next = base + direction * step;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    onChange(String(next));
  };

  return (
    <div className="stepper">
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input"
        aria-invalid={invalid}
        aria-label={ariaLabel}
      />
      <span className="stepper-btns">
        <button
          type="button"
          className="stepper-btn"
          onClick={() => nudge(1)}
          tabIndex={-1}
          aria-hidden="true"
        >
          <ChevronUp />
        </button>
        <button
          type="button"
          className="stepper-btn"
          onClick={() => nudge(-1)}
          tabIndex={-1}
          aria-hidden="true"
        >
          <ChevronDown />
        </button>
      </span>
    </div>
  );
}
