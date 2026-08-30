import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "../../i18n";

type DateFieldProps = {
  id?: string;
  /** `yyyy-mm-dd`, or "" when unset. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel?: string;
  /** Latest selectable date, `yyyy-mm-dd`. */
  max?: string;
};

const pad = (value: number) => String(value).padStart(2, "0");
const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parse = (value: string): Date | null => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * A calendar that matches the rest of the app.
 *
 * The native `<input type="date">` renders differently in every browser,
 * ignores the type scale, and puts its own control glyph where the design has
 * none — conspicuous on a form where the issue date is one of four fields.
 */
export function DateField({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  ariaLabel,
  max,
}: DateFieldProps) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = parse(value);
  const [view, setView] = useState(() => selected ?? new Date());
  const rootRef = useRef<HTMLDivElement>(null);

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

  /* Czech weeks start on Monday; en-US on Sunday. */
  const startsSunday = locale.startsWith("en-US");

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, startsSunday ? 7 : 1); // a Sunday / a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(base);
      day.setDate(base.getDate() + i);
      return day.toLocaleDateString(locale, { weekday: "narrow" });
    });
  }, [locale, startsSunday]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const offset = startsSunday
      ? first.getDay()
      : (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      return day;
    });
  }, [startsSunday, view]);

  const today = new Date();
  const maxDate = parse(max ?? "");
  const isBlocked = (day: Date) => {
    if (!maxDate) return false;
    const end = new Date(maxDate);
    end.setHours(23, 59, 59, 999);
    return day > end;
  };
  const label = selected
    ? selected.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).replace(/\s/g, "")
    : t("dateField.empty");

  const pick = (day: Date) => {
    if (isBlocked(day)) return;
    onChange(toIso(day));
    setOpen(false);
  };

  return (
    <div className="datefield" ref={rootRef}>
      <button
        id={id}
        type="button"
        className="datefield-trigger"
        disabled={disabled}
        aria-invalid={invalid}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          /* Re-centre on the selected date as it opens — done here rather
             than in an effect so there is no extra render. */
          if (!open && selected) setView(selected);
          setOpen((current) => !current);
        }}
      >
        <span className={selected ? "num" : "datefield-empty"}>{label}</span>
        <CalendarDays />
      </button>

      {open ? (
        <div className="datefield-pop" role="dialog">
          <div className="datefield-head">
            <button
              type="button"
              className="ystrip-arrow"
              onClick={() =>
                setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))
              }
              aria-label={t("dateField.prevMonth")}
            >
              <ChevronLeft />
            </button>
            <span className="datefield-month">
              {view.toLocaleDateString(locale, {
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              type="button"
              className="ystrip-arrow"
              onClick={() =>
                setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))
              }
              aria-label={t("dateField.nextMonth")}
            >
              <ChevronRight />
            </button>
          </div>

          <div className="datefield-grid" role="grid">
            {weekdays.map((day, i) => (
              <span key={`wd-${i}`} className="datefield-wd">
                {day}
              </span>
            ))}
            {cells.map((day) => (
              <button
                key={day.toISOString()}
                type="button"
                className="datefield-day"
                data-outside={day.getMonth() !== view.getMonth()}
                data-today={sameDay(day, today)}
                data-selected={selected ? sameDay(day, selected) : false}
                disabled={isBlocked(day)}
                onClick={() => pick(day)}
              >
                {day.getDate()}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="datefield-today"
            onClick={() => pick(new Date())}
          >
            {t("dateField.today")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
