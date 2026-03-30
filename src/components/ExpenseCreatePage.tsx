import { useEffect, useState } from "react";
import * as Evolu from "@evolu/common";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

type ExpenseCreatePageProps = {
  onExpenseCreated: () => void;
};

export function ExpenseCreatePage({
  onExpenseCreated,
}: ExpenseCreatePageProps) {
  const { t } = useI18n();
  const evolu = useEvolu();

  const [amountWithoutVat, setAmountWithoutVat] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [amountWithVat, setAmountWithVat] = useState("");
  const [description, setDescription] = useState("");
  const [expenseNumber, setExpenseNumber] = useState("");
  const [supplierVat, setSupplierVat] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (expenseDate) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    setExpenseDate(todayIso);
  }, [expenseDate]);

  const recalculateAmountWithVat = (
    nextAmountWithoutVat: string,
    nextVatRate: string,
  ) => {
    if (!nextAmountWithoutVat.trim() || !nextVatRate.trim()) {
      setAmountWithVat("");
      return;
    }

    const amountWithoutVatNumber = Number(nextAmountWithoutVat);
    const vatRateNumber = Number(nextVatRate);

    if (
      Number.isNaN(amountWithoutVatNumber) ||
      Number.isNaN(vatRateNumber) ||
      amountWithoutVatNumber < 0 ||
      vatRateNumber < 0
    ) {
      setAmountWithVat("");
      return;
    }

    const computed =
      amountWithoutVatNumber + 0.01 * vatRateNumber * amountWithoutVatNumber;
    setAmountWithVat(computed.toFixed(2));
  };

  const handleAmountWithoutVatChange = (value: string) => {
    setAmountWithoutVat(value);
    recalculateAmountWithVat(value, vatRate);
  };

  const handleVatRateChange = (value: string) => {
    setVatRate(value);
    recalculateAmountWithVat(amountWithoutVat, value);
  };

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const amountWithVatValue = Number(amountWithVat);
  const showExtendedFields =
    Number.isFinite(amountWithVatValue) && amountWithVatValue > 10000;

  const handleSave = async () => {
    if (!description.trim()) {
      alert(t("alerts.expenseTypeRequired"));
      return;
    }

    if (!expenseDate.trim()) {
      alert(t("alerts.expenseDateRequired"));
      return;
    }

    if (!amountWithVat.trim()) {
      alert(t("alerts.expenseAmountWithVatRequired"));
      return;
    }

    const amountWithoutVatNumber = amountWithoutVat.trim()
      ? Number(amountWithoutVat)
      : null;
    if (
      amountWithoutVatNumber != null &&
      (Number.isNaN(amountWithoutVatNumber) || amountWithoutVatNumber < 0)
    ) {
      alert(t("alerts.expenseAmountInvalid"));
      return;
    }

    const vatRateNumber = vatRate.trim() ? Number(vatRate) : null;
    if (
      vatRateNumber != null &&
      (Number.isNaN(vatRateNumber) || vatRateNumber < 0)
    ) {
      alert(t("alerts.expenseVatRateInvalid"));
      return;
    }

    const amountWithVatNumber = amountWithVat.trim()
      ? Number(amountWithVat)
      : null;
    if (
      amountWithVatNumber != null &&
      (Number.isNaN(amountWithVatNumber) || amountWithVatNumber < 0)
    ) {
      alert(t("alerts.expenseAmountWithVatInvalid"));
      return;
    }

    const dateResult = Evolu.dateToDateIso(new Date(expenseDate));
    if (!dateResult.ok) {
      console.error("Expense date error:", dateResult.error);
      alert(t("alerts.expenseDateInvalid"));
      return;
    }

    const amountWithoutVatResult =
      amountWithoutVatNumber == null
        ? null
        : Evolu.NonNegativeNumber.from(amountWithoutVatNumber);
    if (
      amountWithoutVatNumber != null &&
      (!amountWithoutVatResult || !amountWithoutVatResult.ok)
    ) {
      console.error(
        "Expense amount without VAT error:",
        amountWithoutVatResult && amountWithoutVatResult.error,
      );
      alert(t("alerts.expenseAmountInvalid"));
      return;
    }

    const vatRateResult =
      vatRateNumber == null
        ? null
        : Evolu.NonNegativeNumber.from(vatRateNumber);
    if (vatRateNumber != null && (!vatRateResult || !vatRateResult.ok)) {
      console.error(
        "Expense VAT rate error:",
        vatRateResult && vatRateResult.error,
      );
      alert(t("alerts.expenseVatRateInvalid"));
      return;
    }

    const amountWithVatResult =
      amountWithVatNumber == null
        ? null
        : Evolu.NonNegativeNumber.from(amountWithVatNumber);
    if (
      amountWithVatNumber != null &&
      (!amountWithVatResult || !amountWithVatResult.ok)
    ) {
      console.error(
        "Expense amount with VAT error:",
        amountWithVatResult && amountWithVatResult.error,
      );
      alert(t("alerts.expenseAmountWithVatInvalid"));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        expenseNumber: showExtendedFields ? toNullable(expenseNumber) : null,
        supplierVat: showExtendedFields ? toNullable(supplierVat) : null,
        amountWithoutVat: amountWithoutVatResult?.ok
          ? amountWithoutVatResult.value
          : null,
        vatRate: vatRateResult?.ok ? vatRateResult.value : null,
        amountWithVat: amountWithVatResult?.ok
          ? amountWithVatResult.value
          : null,
        description: description.trim(),
        expenseDate: dateResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("expense", payload, {
        onlyValidate: true,
      });
      if (!validation.ok) {
        console.error("Validation error:", validation.error);
        alert(t("alerts.expenseSaveValidation"));
        return;
      }

      const result = evolu.insert("expense", payload);
      if (!result.ok) {
        console.error("Insert error:", result.error);
        alert(t("alerts.expenseSaveValidation"));
        return;
      }

      onExpenseCreated();
    } catch (error) {
      console.error("Error saving expense:", error);
      alert(t("alerts.expenseSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="mb-6">
            <p className="section-title">{t("expenseCreate.sectionTitle")}</p>
            <h1 className="page-title">{t("expenseCreate.title")}</h1>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="expenseDate" className="form-label">
                {t("expenseCreate.expenseDateLabel")}
              </label>
              <input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseType" className="form-label">
                {t("expenseCreate.expenseTypeLabel")}
              </label>
              <input
                id="expenseType"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseAmount" className="form-label">
                {t("expenseCreate.amountLabel")}
              </label>
              <input
                id="expenseAmount"
                type="number"
                min={0}
                step="0.01"
                value={amountWithoutVat}
                onChange={(event) =>
                  handleAmountWithoutVatChange(event.target.value)
                }
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseVatRate" className="form-label">
                {t("expenseCreate.vatRateLabel")}
              </label>
              <input
                id="expenseVatRate"
                type="number"
                min={0}
                step="0.01"
                value={vatRate}
                onChange={(event) => handleVatRateChange(event.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseAmountWithVat" className="form-label">
                {t("expenseCreate.amountWithVatLabel")}
              </label>
              <input
                id="expenseAmountWithVat"
                type="number"
                min={0}
                step="0.01"
                value={amountWithVat}
                onChange={(event) => setAmountWithVat(event.target.value)}
                className="form-input"
              />
            </div>

            {showExtendedFields ? (
              <>
                <div>
                  <label htmlFor="expenseNumber" className="form-label">
                    {t("expenseCreate.expenseNumberLabel")}
                  </label>
                  <input
                    id="expenseNumber"
                    type="text"
                    value={expenseNumber}
                    onChange={(event) => setExpenseNumber(event.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <label htmlFor="expenseSupplierVat" className="form-label">
                    {t("expenseCreate.supplierVatLabel")}
                  </label>
                  <input
                    id="expenseSupplierVat"
                    type="text"
                    value={supplierVat}
                    onChange={(event) => setSupplierVat(event.target.value)}
                    className="form-input"
                  />
                </div>
              </>
            ) : null}
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !description.trim()}
            className="btn-primary mt-6 w-full"
          >
            {isSaving ? t("expenseCreate.saving") : t("expenseCreate.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
