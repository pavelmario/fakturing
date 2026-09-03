import { useId, type ReactNode } from "react";
import { ChevronRight, ListPlus, X } from "lucide-react";
import { useI18n } from "../../i18n";
import { DateField } from "../invoices/DateField";
import { SelectField } from "../invoices/SelectField";
import { InvoiceItemsTable } from "../invoices/InvoiceItemsTable";
import {
  expenseAmountColumns,
  hasFilledItems,
  seedItemFromAmount,
  type ExpenseFormValues,
} from "../../lib/expenseForm";
import { round2 } from "../../lib/expense";
import { emptyItem, type InvoiceItemForm } from "../../lib/invoiceItemForm";
import { findSupplier, type SupplierOption } from "../../lib/supplierOptions";

type ExpenseFormProps = {
  values: ExpenseFormValues;
  onChange: (patch: Partial<ExpenseFormValues>) => void;
  errors: Partial<Record<keyof ExpenseFormValues, string>>;
  isVatPayer: boolean;
  suppliers: readonly SupplierOption[];
  formatAmount: (value: number) => string;
  /** A template is not a document: it has no date and no document number. */
  variant?: "expense" | "template";
  /** Page-owned fields at the top of the sidebar (e.g. a template's name). */
  documentSlot?: ReactNode;
  /** Page-owned footer under the sidebar (totals, primary action). */
  sidebarFooter?: ReactNode;
  noteOpen: boolean;
  onNoteOpenChange: (open: boolean) => void;
};

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * One expense form, shared by create, edit and the recurring templates.
 *
 * It is the invoice composer with the arrows reversed — from whom, and for
 * what — and it reuses that form's item table so a cost can be broken down
 * the same way an invoice is.
 *
 * The breakdown stays optional. Most costs arrive as a single figure on a
 * receipt, and for those the amounts are still linked both ways: the gross is
 * the number printed largest on a supplier's invoice, so typing it
 * back-computes the base rather than making you divide.
 */
export function ExpenseForm({
  values,
  onChange,
  errors,
  isVatPayer,
  suppliers,
  formatAmount,
  variant = "expense",
  documentSlot,
  sidebarFooter,
  noteOpen,
  onNoteOpenChange,
}: ExpenseFormProps) {
  const { t } = useI18n();
  const listId = useId();
  const itemised = hasFilledItems(values.items);

  const setBase = (base: string) =>
    onChange({
      amountWithoutVat: base,
      amountWithVat: base.trim()
        ? String(round2(num(base) * (1 + num(values.vatRate) / 100)))
        : "",
    });

  const setRate = (rate: string) =>
    onChange({
      vatRate: rate,
      amountWithVat: values.amountWithoutVat.trim()
        ? String(round2(num(values.amountWithoutVat) * (1 + num(rate) / 100)))
        : values.amountWithVat,
    });

  const setGross = (gross: string) =>
    onChange({
      amountWithVat: gross,
      amountWithoutVat: gross.trim()
        ? String(round2(num(gross) / (1 + num(values.vatRate) / 100)))
        : "",
    });

  /**
   * Picking a known supplier replaces the two numbers with theirs — including
   * replacing them with nothing when that is what is known about them.
   * Keeping the previous value as a fallback meant switching from a supplier
   * with a DIČ to one without left the first supplier's DIČ on the document,
   * and that number is what the control statement files the purchase under.
   */
  const setSupplierName = (name: string) => {
    const known = findSupplier(suppliers, name);
    onChange({
      supplierName: name,
      ...(known ? { supplierVat: known.vat, supplierIco: known.ico } : {}),
    });
  };

  const freshItem = (): InvoiceItemForm => ({
    ...emptyItem(),
    vat: isVatPayer ? values.vatRate || "21" : "",
  });

  const setItem = (
    index: number,
    field: keyof InvoiceItemForm,
    value: string,
  ) =>
    onChange({
      items: values.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    });

  /* Opening the breakdown carries the amount already typed into its first
     line, and closing it writes the lines back into the fields — the rate and
     the description as well as the two amounts, so what is left on screen is
     the same document and not a base and a total that disagree with the rate
     between them. */
  const openBreakdown = () =>
    onChange({ items: [seedItemFromAmount(values, isVatPayer)] });

  const closeBreakdown = () => {
    const columns = expenseAmountColumns(values, isVatPayer);
    const fromLines = values.items.find((item) => item.description.trim());
    onChange({
      items: [],
      description: values.description.trim() || fromLines?.description || "",
      amountWithoutVat: columns.amountWithoutVat
        ? String(columns.amountWithoutVat)
        : "",
      vatRate: isVatPayer ? String(columns.vatRate) : values.vatRate,
      amountWithVat: columns.amountWithVat
        ? String(columns.amountWithVat)
        : "",
    });
  };

  return (
    <div className="compose">
      <div className="compose-main">
        <section className="compose-block">
          <h2 className="compose-heading">{t("expenseForm.supplierTitle")}</h2>

          <label htmlFor="expenseSupplierName" className="form-label">
            {t("expenseForm.supplierNameLabel")}
          </label>
          <input
            id="expenseSupplierName"
            type="text"
            list={listId}
            autoComplete="off"
            value={values.supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder={t("expenseForm.supplierNamePlaceholder")}
            className="form-input"
            aria-invalid={Boolean(errors.supplierName)}
          />
          <datalist id={listId}>
            {suppliers
              .filter((supplier) => supplier.name)
              .map((supplier) => (
                <option key={supplier.name} value={supplier.name}>
                  {supplier.vat}
                </option>
              ))}
          </datalist>
          {errors.supplierName ? (
            <p className="field-error">{errors.supplierName}</p>
          ) : null}

          <div className="doc-pair-even mt-3">
            <div>
              <label htmlFor="expenseSupplierVat" className="form-label">
                {t("expenseForm.supplierVatLabel")}
              </label>
              <input
                id="expenseSupplierVat"
                type="text"
                value={values.supplierVat}
                onChange={(e) => onChange({ supplierVat: e.target.value })}
                placeholder="CZ12345678"
                className="form-input mono"
              />
            </div>
            <div>
              <label htmlFor="expenseSupplierIco" className="form-label">
                {t("expenseForm.supplierIcoLabel")}
              </label>
              <input
                id="expenseSupplierIco"
                type="text"
                value={values.supplierIco}
                onChange={(e) => onChange({ supplierIco: e.target.value })}
                className="form-input mono"
              />
            </div>
          </div>
          {isVatPayer ? (
            <p className="field-hint">{t("expenseForm.supplierVatHint")}</p>
          ) : null}
        </section>

        <section className="compose-block">
          <div className="compose-block-head">
            <h2 className="compose-heading">{t("expenseForm.aboutTitle")}</h2>
            <button
              type="button"
              className="fchip"
              data-on={itemised}
              aria-pressed={itemised}
              onClick={itemised ? closeBreakdown : openBreakdown}
              title={t("expenseForm.breakdownHint")}
            >
              {itemised ? <X /> : <ListPlus />}
              {itemised
                ? t("expenseForm.breakdownOff")
                : t("expenseForm.breakdownOn")}
            </button>
          </div>

          <label htmlFor="expenseDescription" className="form-label">
            {t("expenseForm.descriptionLabel")}
          </label>
          <input
            id="expenseDescription"
            type="text"
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={
              itemised
                ? values.items.find((item) => item.description.trim())
                    ?.description || t("expenseForm.descriptionPlaceholder")
                : t("expenseForm.descriptionPlaceholder")
            }
            className="form-input"
            aria-invalid={Boolean(errors.description)}
          />
          {errors.description ? (
            <p className="field-error">{errors.description}</p>
          ) : null}
          {itemised ? (
            <p className="field-hint">{t("expenseForm.descriptionFromItems")}</p>
          ) : null}

          {itemised ? (
            <div className="mt-3">
              <InvoiceItemsTable
                items={values.items}
                isVatPayer={isVatPayer}
                showQuantity
                onChange={setItem}
                onAdd={() => onChange({ items: [...values.items, freshItem()] })}
                onRemove={(index) =>
                  onChange({
                    items:
                      values.items.length === 1
                        ? [freshItem()]
                        : values.items.filter((_, i) => i !== index),
                  })
                }
                formatAmount={formatAmount}
              />
              {errors.items ? (
                <p className="field-error">{errors.items}</p>
              ) : null}
            </div>
          ) : (
            <>
              {isVatPayer ? (
                <div className="doc-pair-even mt-3">
                  <div>
                    <label htmlFor="expenseBase" className="form-label">
                      {t("expenseForm.baseLabel")}
                    </label>
                    <input
                      id="expenseBase"
                      type="number"
                      min={0}
                      step="0.01"
                      value={values.amountWithoutVat}
                      onChange={(e) => setBase(e.target.value)}
                      className="form-input mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="expenseVatRate" className="form-label">
                      {t("expenseForm.rateLabel")}
                    </label>
                    <SelectField
                      id="expenseVatRate"
                      value={values.vatRate}
                      ariaLabel={t("expenseForm.rateLabel")}
                      options={[
                        { value: "21", label: "21 %" },
                        { value: "12", label: "12 %" },
                        { value: "0", label: "0 %" },
                      ]}
                      onChange={setRate}
                    />
                  </div>
                </div>
              ) : null}

              <label htmlFor="expenseGross" className="form-label mt-3">
                {isVatPayer
                  ? t("expenseForm.grossLabel")
                  : t("expenseForm.totalLabel")}
              </label>
              <input
                id="expenseGross"
                type="number"
                min={0}
                step="0.01"
                value={values.amountWithVat}
                onChange={(e) => setGross(e.target.value)}
                className="form-input mono"
                aria-invalid={Boolean(errors.amountWithVat)}
              />
              {errors.amountWithVat ? (
                <p className="field-error">{errors.amountWithVat}</p>
              ) : null}
            </>
          )}
        </section>

        <section className="compose-block compose-block-tight">
          <button
            type="button"
            className="disclosure"
            aria-expanded={noteOpen}
            onClick={() => onNoteOpenChange(!noteOpen)}
          >
            <ChevronRight />
            <span className="compose-heading">
              {t("expenseForm.noteLabel")}
            </span>
            {!noteOpen && values.note.trim() ? (
              <span className="disclosure-preview">{values.note}</span>
            ) : null}
          </button>
          {noteOpen ? (
            <textarea
              id="expenseNote"
              value={values.note}
              onChange={(e) => onChange({ note: e.target.value })}
              placeholder={t("expenseForm.notePlaceholder")}
              className="form-textarea mt-2"
              rows={3}
            />
          ) : null}
        </section>
      </div>

      <aside className="compose-side">
        <div className="compose-panel">
          <h2 className="compose-heading">
            {variant === "template"
              ? t("expenseTemplates.panelTitle")
              : t("invoiceCreate.documentTitle")}
          </h2>

          {documentSlot}

          {variant === "expense" ? (
            <>
              <label htmlFor="expenseDate" className="form-label">
                {t("expenseForm.dateLabel")}
              </label>
              <DateField
                id="expenseDate"
                value={values.expenseDate}
                invalid={Boolean(errors.expenseDate)}
                ariaLabel={t("expenseForm.dateLabel")}
                onChange={(next) => onChange({ expenseDate: next })}
              />
              {errors.expenseDate ? (
                <p className="field-error">{errors.expenseDate}</p>
              ) : null}

              <label htmlFor="expenseNumber" className="form-label mt-3">
                {t("expenseForm.numberLabel")}
              </label>
              <input
                id="expenseNumber"
                type="text"
                value={values.expenseNumber}
                onChange={(e) => onChange({ expenseNumber: e.target.value })}
                className="form-input mono"
              />
              {isVatPayer ? (
                <p className="field-hint">{t("expenseForm.numberHint")}</p>
              ) : null}
            </>
          ) : null}
        </div>

        {sidebarFooter}
      </aside>
    </div>
  );
}
