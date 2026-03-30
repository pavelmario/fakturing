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
  expenseNumber: string | null;
  supplierVat: string | null;
  amountWithoutVat: number | null;
  vatRate: number | null;
  amountWithVat: number | null;
  description: string | null;
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
  const { t } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const expenseIdValue = useMemo(() => {
    const result = ExpenseId.from(expenseId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Expense">("invalid-expense-id");
  }, [expenseId]);

  const [amountWithoutVat, setAmountWithoutVat] = useState("");
  const [vatRate, setVatRate] = useState("");
  const [amountWithVat, setAmountWithVat] = useState("");
  const [description, setDescription] = useState("");
  const [expenseNumber, setExpenseNumber] = useState("");
  const [supplierVat, setSupplierVat] = useState("");
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
    setExpenseNumber(source?.expenseNumber ?? "");
    setSupplierVat(source?.supplierVat ?? "");
    setAmountWithoutVat(
      source?.amountWithoutVat != null ? String(source.amountWithoutVat) : "",
    );
    setVatRate(source?.vatRate != null ? String(source.vatRate) : "");
    setAmountWithVat(
      source?.amountWithVat != null ? String(source.amountWithVat) : "",
    );
    setDescription(source?.description ?? "");
    setExpenseDate(toDateInputValue(source?.expenseDate ?? ""));
  };

  useEffect(() => {
    hydrateForm(expense);
    setIsEditing(false);
  }, [expense]);

  useEffect(() => {
    setSaveMessage(null);
  }, [expenseId]);

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

  const handleSave = async () => {
    if (!expense?.id) return;

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
    setSaveMessage(null);
    try {
      const result = evolu.update("expense", {
        id: expense.id,
        expenseNumber: toNullable(expenseNumber),
        supplierVat: toNullable(supplierVat),
        amountWithoutVat: amountWithoutVatResult?.ok
          ? amountWithoutVatResult.value
          : null,
        vatRate: vatRateResult?.ok ? vatRateResult.value : null,
        amountWithVat: amountWithVatResult?.ok
          ? amountWithVatResult.value
          : null,
        description: description.trim(),
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

            <div>
              <label htmlFor="expenseType" className="form-label">
                {t("expenseDetail.expenseTypeLabel")}
              </label>
              <input
                id="expenseType"
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseAmount" className="form-label">
                {t("expenseDetail.amountLabel")}
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
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseVatRate" className="form-label">
                {t("expenseDetail.vatRateLabel")}
              </label>
              <input
                id="expenseVatRate"
                type="number"
                min={0}
                step="0.01"
                value={vatRate}
                onChange={(event) => handleVatRateChange(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseAmountWithVat" className="form-label">
                {t("expenseDetail.amountWithVatLabel")}
              </label>
              <input
                id="expenseAmountWithVat"
                type="number"
                min={0}
                step="0.01"
                value={amountWithVat}
                onChange={(event) => setAmountWithVat(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseNumber" className="form-label">
                {t("expenseDetail.expenseNumberLabel")}
              </label>
              <input
                id="expenseNumber"
                type="text"
                value={expenseNumber}
                onChange={(event) => setExpenseNumber(event.target.value)}
                disabled={!isEditing}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="expenseSupplierVat" className="form-label">
                {t("expenseDetail.supplierVatLabel")}
              </label>
              <input
                id="expenseSupplierVat"
                type="text"
                value={supplierVat}
                onChange={(event) => setSupplierVat(event.target.value)}
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
