import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectFieldProps = {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
};

/**
 * A dropdown the design controls.
 *
 * The native `<select>` renders its own list with the OS's typeface, metrics
 * and highlight colour, so on this palette it was the one control that looked
 * like it belonged to a different application.
 */
export function SelectField({
  id,
  value,
  options,
  onChange,
  placeholder = "",
  disabled = false,
  invalid = false,
  ariaLabel,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectable = options.filter((option) => !option.disabled);
  const current = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    const index = selectable.findIndex((option) => option.value === value);
    setActive(index < 0 ? 0 : index);
    setOpen(true);
  };

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, selectable.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = selectable[active];
      if (option) commit(option.value);
    }
  };

  return (
    <div className="selectfield" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="selectfield-trigger"
        disabled={disabled}
        aria-invalid={invalid}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={current ? undefined : "selectfield-empty"}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown />
      </button>

      {open ? (
        <div className="selectfield-pop" role="listbox" ref={listRef}>
          {options.length === 0 ? (
            <div className="selectfield-empty-state">{placeholder}</div>
          ) : (
            options.map((option) => {
              const index = selectable.indexOf(option);
              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  className="selectfield-option"
                  data-active={index >= 0 && index === active}
                  disabled={option.disabled}
                  onMouseEnter={() => index >= 0 && setActive(index)}
                  onClick={() => commit(option.value)}
                >
                  <span>{option.label}</span>
                  {option.value === value ? <Check /> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
