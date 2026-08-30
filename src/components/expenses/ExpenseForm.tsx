import { useI18n } from "../../i18n";
import { DateField } from "../invoices/DateField";
import { SelectField } from "../invoices/SelectField";
import type { ExpenseFormValues } from "../../lib/expenseForm";
import type { SupplierVatPrefillOption } from "../../supplierVatPrefill";

type ExpenseFormProps = {
  values: ExpenseFormValues;
  onChange: (patch: Partial<ExpenseFormValues>) => void;
  errors: Partial<Record<keyof ExpenseFormValues, string>>;
  isVatPayer: boolean;
  suppliers: readonly SupplierVatPrefillOption[];
};

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * One expense form, shared by create and edit.
 *
 * Amounts are linked in both directions. The gross total is the number printed
 * largest on a supplier's invoice and the one you actually read off it, but the
 * old form only computed forwards from the base — so entering a real receipt
 * meant doing the division yourself.
 */
export function ExpenseForm({
  values,
  onChange,
  errors,
  isVatPayer,
  suppliers,
}: ExpenseFormProps) {
  const { t } = useI18n();

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
        ? String(
            round2(num(values.amountWithoutVat) * (1 + num(rate) / 100)),
          )
        : values.amountWithVat,
    });

  const setGross = (gross: string) =>
    onChange({
      amountWithVat: gross,
      amountWithoutVat: gross.trim()
        ? String(round2(num(gross) / (1 + num(values.vatRate) / 100)))
        : "",
    });

  return (
    <div className="client-form">
      <section className="compose-block">
        <h2 className="compose-heading">{t("expenseForm.aboutTitle")}</h2>

        <label htmlFor="expenseDescription" className="form-label">
          {t("expenseForm.descriptionLabel")}
        </label>
        <input
          id="expenseDescription"
          type="text"
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="form-input"
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description ? (
          <p className="field-error">{errors.description}</p>
        ) : null}

        <div className="doc-pair-even mt-3">
          <div>
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
          </div>
          <div>
            <label htmlFor="expenseNumber" className="form-label">
              {t("expenseForm.numberLabel")}
            </label>
            <input
              id="expenseNumber"
              type="text"
              value={values.expenseNumber}
              onChange={(e) => onChange({ expenseNumber: e.target.value })}
              className="form-input mono"
            />
          </div>
        </div>
        {errors.expenseDate ? (
          <p className="field-error">{errors.expenseDate}</p>
        ) : null}
      </section>

      <section className="compose-block">
        <h2 className="compose-heading">{t("expenseForm.amountTitle")}</h2>

        {isVatPayer ? (
          <div className="doc-pair-even">
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

        <label htmlFor="expenseGross" className={isVatPayer ? "form-label mt-3" : "form-label"}>
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

        {isVatPayer ? (
          <>
            <label htmlFor="expenseSupplierVat" className="form-label mt-3">
              {t("expenseForm.supplierVatLabel")}
            </label>
            {suppliers.length > 0 ? (
              <SelectField
                id="expenseSupplierVat"
                value={values.supplierVat}
                placeholder={t("expenseForm.supplierVatPlaceholder")}
                ariaLabel={t("expenseForm.supplierVatLabel")}
                options={suppliers.map((supplier) => ({
                  value: supplier.vat,
                  label: `${supplier.vat} · ${supplier.name}`,
                }))}
                onChange={(next) => onChange({ supplierVat: next })}
              />
            ) : (
              <input
                id="expenseSupplierVat"
                type="text"
                value={values.supplierVat}
                onChange={(e) => onChange({ supplierVat: e.target.value })}
                className="form-input mono"
              />
            )}
            <p className="field-hint">{t("expenseForm.supplierVatHint")}</p>
          </>
        ) : null}
      </section>
    </div>
  );
}
