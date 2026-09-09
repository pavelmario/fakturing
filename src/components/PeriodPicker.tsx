import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export type PeriodOption = {
  /** Identity of the option, `2024` or `2024-11`. */
  key: string;
  label: string;
  /** How many documents that period holds. */
  count: number;
  year: number;
  /** `null` in the year view. */
  month: number | null;
};

type PeriodPickerProps = {
  label: string;
  value: string;
  options: readonly PeriodOption[];
  countLabel: (count: number) => string;
  onPick: (option: PeriodOption) => void;
  ariaLabel: string;
  /** How the label is set — each ledger keeps the type it already had. */
  labelClassName?: string;
};

/**
 * The period on screen, and every period there is something to see in.
 *
 * The arrows step one period at a time, which is fine for last month and
 * hopeless for December two years ago. The label was already the thing you
 * look at to know where you are, so it is also the thing you click to go
 * somewhere else — the list carries only periods that actually hold
 * documents, plus the one on screen so it can say where that is.
 *
 * It stays a label to look at: no chevron, no box. What says it can be
 * clicked is the cursor and the tint it takes under one.
 *
 * Deliberately a disclosure over plain buttons rather than a listbox: a
 * listbox is a single tab stop driven by the arrow keys, and announcing one
 * without implementing them leaves a control a screen reader offers and
 * nobody can work. Tab reaches each period, Enter picks it, Escape closes.
 */
export function PeriodPicker({
  label,
  value,
  options,
  countLabel,
  onPick,
  ariaLabel,
  labelClassName = "period-label",
}: PeriodPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  /* Three years of costs is thirty-six months, and the list opens at the
     top — where the period you are in need not be. */
  useEffect(() => {
    if (open) currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  return (
    <div className="period-pick" ref={rootRef}>
      <button
        type="button"
        className={`period-trigger ${labelClassName}`}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((on) => !on)}
      >
        {label}
      </button>

      {open ? (
        <div className="selectfield-pop period-pop">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              ref={option.key === value ? currentRef : undefined}
              aria-current={option.key === value}
              className="selectfield-option period-option"
              onClick={() => {
                onPick(option);
                setOpen(false);
              }}
            >
              <span className="period-option-label">{option.label}</span>
              <span className="period-option-count">
                {option.count > 0 ? (
                  <>
                    <span className="num">{option.count}</span>{" "}
                    {countLabel(option.count)}
                  </>
                ) : null}
                {option.key === value ? <Check /> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
