import { use, useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

type ExpenseDetailPageProps = {
  expenseId: string;
  onBack: () => void;
  onExpenseDeleted: () => void;
};

type ExpenseRow = {
  id: string;
  amount: number | null;
  expenseType: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
  expenseDate: string | null;
};

const ExpenseId = Evolu.id("Expense");

const toDateInputValue = (value?: string | null) => {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
};

export function ExpenseDetailPage({
  expenseId,
  onBack,
  onExpenseDeleted,
}: ExpenseDetailPageProps) {
  const { t, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const expenseIdValue = useMemo(() => {
    const result = ExpenseId.from(expenseId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Expense">("invalid-expense-id");
  }, [expenseId]);

  const [amount, setAmount] = useState("");
  const [expenseType, setExpenseType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [expenseDate, setExpenseDate] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const expenseQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .selectAll()
          .where("id", "=", expenseIdValue)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1),
      ),
    [evolu, expenseIdValue, owner.id],
  );

  const expenseRows = useQuery(expenseQuery) as readonly ExpenseRow[];
  const expense = expenseRows[0] ?? null;

  const hydrateForm = (source: ExpenseRow | null) => {
    setAmount(source?.amount != null ? String(source.amount) : "");
    setExpenseType(source?.expenseType ?? "");
    setPaymentMethod(source?.paymentMethod ?? "cash");
    setReceiptNumber(source?.receiptNumber ?? "");
    setExpenseDate(toDateInputValue(source?.expenseDate ?? ""));
  };

  useEffect(() => {
    hydrateForm(expense);
    setIsEditing(false);
    setSaveMessage(null);
  }, [expense]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const formatAmount = (value: number | null) => {
    if (value == null || !Number.isFinite(value))
      return t("common.placeholderDash");
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const handleSave = async () => {
    if (!expense?.id) return;

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
    setSaveMessage(null);
    try {
      const result = evolu.update("expense", {
        id: expense.id,
        amount: amountResult.value,
        expenseType: expenseType.trim(),
        paymentMethod,
        receiptNumber: toNullable(receiptNumber),
        expenseDate: dateResult.value,
      });

      if (!result.ok) {
        console.error("Validation error:", result.error);
        alert(t("alerts.expenseSaveValidation"));
        return;
      }

      setSaveMessage(t("alerts.expenseUpdated"));
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating expense:", error);
      alert(t("alerts.expenseSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    hydrateForm(expense);
    setIsEditing(false);
    setSaveMessage(null);
  };

  const handleDelete = async () => {
    if (!expense?.id) return;
    const confirmed = confirm(t("expenseDetail.deleteConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);
    setSaveMessage(null);
    try {
      const result = evolu.update("expense", {
        id: expense.id,
        deleted: Evolu.sqliteTrue,
      });

      if (!result.ok) {
        console.error("Delete error:", result.error);
        alert(t("alerts.expenseDeleteFailed"));
        return;
      }

      onExpenseDeleted();
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert(t("alerts.expenseDeleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  if (!expense) {
    return (
      <div className="page-shell">
        <div className="page-container">
          <div className="page-card">
            <div className="flex items-center justify-between mb-6">
              <h1 className="page-title">{t("expenseDetail.title")}</h1>
              <button onClick={onBack} className="btn-secondary">
                {t("common.backToList")}
              </button>
            </div>
            <div className="empty-state">{t("expenseDetail.notFound")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="flex items-center justify-between mb-6">
            <h1 className="page-title">{t("expenseDetail.title")}</h1>
            <button onClick={onBack} className="btn-secondary">
              {t("common.backToList")}
            </button>
          </div>

          {saveMessage ? (
            <div className="mb-6 alert-success">{saveMessage}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="expenseAmount" className="form-label">
                {t("expenseDetail.amountLabel")}
              </label>
              <input
                id="expenseAmount"
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseType" className="form-label">
                {t("expenseDetail.expenseTypeLabel")}
              </label>
              <input
                id="expenseType"
                type="text"
                value={expenseType}
                onChange={(event) => setExpenseType(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expensePaymentMethod" className="form-label">
                {t("expenseDetail.paymentMethodLabel")}
              </label>
              <select
                id="expensePaymentMethod"
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                disabled={!isEditing}
                className="form-select"
              >
                <option value="cash">{t("expenses.paymentMethodCash")}</option>
                <option value="bank">{t("expenses.paymentMethodBank")}</option>
                <option value="card">{t("expenses.paymentMethodCard")}</option>
              </select>
            </div>

            <div>
              <label htmlFor="expenseReceiptNumber" className="form-label">
                {t("expenseDetail.receiptNumberLabel")}
              </label>
              <input
                id="expenseReceiptNumber"
                type="text"
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseDate" className="form-label">
                {t("expenseDetail.expenseDateLabel")}
              </label>
              <input
                id="expenseDate"
                type="date"
                value={expenseDate}
                onChange={(event) => setExpenseDate(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {!isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-primary w-full sm:w-auto"
                >
                  {t("common.edit")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting
                    ? t("expenseDetail.deleting")
                    : t("common.delete")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                  className="btn-primary w-full sm:w-auto"
                >
                  {isSaving ? t("common.saving") : t("common.save")}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving || isDeleting}
                  className="btn-secondary w-full sm:w-auto"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting
                    ? t("expenseDetail.deleting")
                    : t("common.delete")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
