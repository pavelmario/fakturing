import { useEffect, useState } from "react";
import * as Evolu from "@evolu/common";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

type ExpenseCreatePageProps = {
  onExpenseCreated: () => void;
};

export function ExpenseCreatePage({ onExpenseCreated }: ExpenseCreatePageProps) {
  const { t } = useI18n();
  const evolu = useEvolu();

  const [amount, setAmount] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (expenseDate) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    setExpenseDate(todayIso);
  }, [expenseDate]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const handleSave = async () => {
    if (!expenseType.trim()) {
      alert(t("alerts.expenseTypeRequired"));
      return;
    }

    if (!expenseDate.trim()) {
      alert(t("alerts.expenseDateRequired"));
      return;
    }

    const amountNumber = Number(amount);
    if (Number.isNaN(amountNumber) || amountNumber < 0) {
      alert(t("alerts.expenseAmountInvalid"));
      return;
    }

    const dateResult = Evolu.dateToDateIso(new Date(expenseDate));
    if (!dateResult.ok) {
      console.error("Expense date error:", dateResult.error);
      alert(t("alerts.expenseDateInvalid"));
      return;
    }

    const amountResult = Evolu.NonNegativeNumber.from(amountNumber);
    if (!amountResult.ok) {
      console.error("Expense amount error:", amountResult.error);
      alert(t("alerts.expenseAmountInvalid"));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        amount: amountResult.value,
        expenseType: expenseType.trim(),
        paymentMethod,
        receiptNumber: toNullable(receiptNumber),
        expenseDate: dateResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("expense", payload, { onlyValidate: true });
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
              <label htmlFor="expenseAmount" className="form-label">
                {t("expenseCreate.amountLabel")}
              </label>
              <input
                id="expenseAmount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
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
                value={expenseType}
                onChange={(event) => setExpenseType(event.target.value)}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expensePaymentMethod" className="form-label">
                {t("expenseCreate.paymentMethodLabel")}
              </label>
              <select
                id="expensePaymentMethod"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                className="form-select"
              >
                <option value="cash">{t("expenses.paymentMethodCash")}</option>
                <option value="bank">{t("expenses.paymentMethodBank")}</option>
                <option value="card">{t("expenses.paymentMethodCard")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="expenseReceiptNumber" className="form-label">
                {t("expenseCreate.receiptNumberLabel")}
              </label>
              <input
                id="expenseReceiptNumber"
                type="text"
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value)}
                className="form-input"
              />
            </div>

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
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !expenseType.trim()}
            className="btn-primary mt-6 w-full"
          >
            {isSaving ? t("expenseCreate.saving") : t("expenseCreate.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
