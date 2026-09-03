import { Check, Plus, Repeat } from "lucide-react";
import { useI18n } from "../../i18n";

export type ExpenseTemplateRow = {
  id: string;
  name: string | null;
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
};

type RecurringPanelProps = {
  templates: readonly ExpenseTemplateRow[];
  /** Templates already booked into the period on screen. */
  booked: ReadonlySet<string>;
  periodLabel: string;
  money: (value: number) => string;
  onGenerate: (template: ExpenseTemplateRow) => void;
  onGenerateMissing: () => void;
  onEdit: (templateId: string) => void;
  onCreate: () => void;
};

/**
 * Costs that repeat unchanged — warehouse rent, hosting, the accountant.
 *
 * Deliberately a checklist against the chosen period rather than a schedule
 * that writes by itself: the question you actually have at the end of a month
 * is "what have I not booked yet", and answering it is one click per line.
 * Nothing is ever entered on your behalf, so a month you did not pay for
 * simply stays empty.
 */
export function RecurringPanel({
  templates,
  booked,
  periodLabel,
  money,
  onGenerate,
  onGenerateMissing,
  onEdit,
  onCreate,
}: RecurringPanelProps) {
  const { t } = useI18n();
  const missing = templates.filter((template) => !booked.has(template.id));

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
            const done = booked.has(template.id);
            return (
              <li key={template.id} className="rec-row" data-done={done}>
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
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span className="rec-amount num">
                  {money(Number(template.amountWithVat ?? 0))}
                </span>
                {done ? (
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
