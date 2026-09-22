import { Check, Plus, Repeat } from "lucide-react";
import { useI18n } from "../../i18n";

export type ExpenseTemplateRow = {
  id: string;
  name: string | null;
  currency: string | null;
  supplierName: string | null;
  supplierVat: string | null;
  supplierIco: string | null;
  description: string | null;
  amountWithoutVat: number | null;
  vatRate: number | null;
  amountWithVat: number | null;
  items: unknown;
  note: string | null;
  dayOfMonth: number | null;
  autoCreate: number | null;
};

type RecurringPanelProps = {
  templates: readonly ExpenseTemplateRow[];
  /** The months of the period on screen each template is already booked in. */
  coverage: ReadonlyMap<string, ReadonlySet<number>>;
  /** False in the year view: a monthly cost is booked into a month. */
  bookable: boolean;
  periodLabel: string;
  money: (value: number, currency?: string) => string;
  /** The month's own name, for the year view's strip and its tooltips. */
  monthLabel: (month: number) => string;
  onGenerate: (template: ExpenseTemplateRow) => void;
  /** Books one template into a chosen month; the year view's strip. */
  onGenerateMonth: (template: ExpenseTemplateRow, month: number) => void;
  onGenerateMissing: () => void;
  onEdit: (templateId: string) => void;
  onCreate: () => void;
};

const MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const;

/**
 * Costs that repeat unchanged — warehouse rent, hosting, the accountant.
 *
 * A month asks one question — "what have I not booked yet" — and answers it
 * with a tick or a button. A year asks which months the cost is in, so it shows
 * a strip of twelve: booked months ticked, the rest a click away, so a month
 * somebody forgot can be filled in without leaving the year.
 */
export function RecurringPanel({
  templates,
  coverage,
  bookable,
  periodLabel,
  money,
  monthLabel,
  onGenerate,
  onGenerateMonth,
  onGenerateMissing,
  onEdit,
  onCreate,
}: RecurringPanelProps) {
  const { t } = useI18n();
  const missing = bookable
    ? templates.filter((template) => (coverage.get(template.id)?.size ?? 0) === 0)
    : [];

  return (
    <section className="rec">
      <div className="rec-head">
        <h2 className="compose-heading">
          <Repeat />
          {t("expenseTemplates.title")}
        </h2>
        <span className="rec-period">{periodLabel}</span>
        <div className="rec-head-actions">
          {missing.length > 1 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={onGenerateMissing}
            >
              {t("expenseTemplates.generateMissing", {
                count: missing.length,
              })}
            </button>
          ) : null}
          <button type="button" className="btn-ghost" onClick={onCreate}>
            <Plus />
            {t("expenseTemplates.create")}
          </button>
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="rec-empty">{t("expenseTemplates.empty")}</p>
      ) : (
        <ul className="rec-list">
          {templates.map((template) => {
            const months = coverage.get(template.id);
            const done = (months?.size ?? 0) > 0;
            /* Dimmed means handled, which a year cannot say from one booked
               month — there each month states its own state instead. */
            return (
              <li
                key={template.id}
                className="rec-row"
                data-done={bookable && done}
              >
                <button
                  type="button"
                  className="rec-open"
                  onClick={() => onEdit(template.id)}
                >
                  <span className="rec-name">
                    {template.name || template.description}
                  </span>
                  <span className="rec-meta">
                    {[
                      template.supplierName,
                      template.dayOfMonth
                        ? t("expenseTemplates.dayOfMonthShort", {
                            day: template.dayOfMonth,
                          })
                        : null,
                      template.autoCreate
                        ? t("expenseTemplates.autoCreateShort")
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span className="rec-amount num">
                  {money(
                    Number(template.amountWithVat ?? 0),
                    template.currency ?? undefined,
                  )}
                </span>
                {/* A year books into a month, so it offers one cell per
                    month: the booked ones ticked, the rest a click away. */}
                {!bookable ? (
                  <div className="rec-months">
                    {MONTHS.map((month) => {
                      const booked = months?.has(month) ?? false;
                      const label = monthLabel(month);
                      return booked ? (
                        <span
                          key={month}
                          className="rec-month"
                          data-done="true"
                          title={label}
                          aria-label={label}
                        >
                          <Check />
                        </span>
                      ) : (
                        <button
                          key={month}
                          type="button"
                          className="rec-month"
                          title={t("expenseTemplates.generateInto", {
                            period: label,
                          })}
                          aria-label={t("expenseTemplates.generateInto", {
                            period: label,
                          })}
                          onClick={() => onGenerateMonth(template, month)}
                        >
                          {month + 1}
                        </button>
                      );
                    })}
                  </div>
                ) : done ? (
                  <span className="rec-done">
                    <Check />
                    {t("expenseTemplates.booked")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn-secondary rec-generate"
                    onClick={() => onGenerate(template)}
                  >
                    {t("expenseTemplates.generate")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
