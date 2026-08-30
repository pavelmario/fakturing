import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { ExpenseForm } from "./expenses/ExpenseForm";
import type { ExpenseFormValues } from "../lib/expenseForm";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import { formatDate } from "../lib/invoice";
import { DEFAULT_CURRENCY, formatMoney } from "../lib/money";

const ExpenseId = Evolu.id("Expense");

type ExpenseDetailPageProps = {
  expenseId: string;
  onBack: () => void;
  onExpenseDeleted: () => void;
};

const toDateInput = (value: string | null | undefined) => {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
};

export function ExpenseDetailPage({
  expenseId,
  onBack,
  onExpenseDeleted,
}: ExpenseDetailPageProps) {
  const { t, locale } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const expenseIdValue = useMemo(() => {
    const result = ExpenseId.from(expenseId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Expense">("invalid-expense-id");
  }, [expenseId]);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer", "supplierVatPrefill", "discreteMode"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const suppliers = useMemo(
    () => parseSupplierVatPrefill(profile?.supplierVatPrefill),
    [profile?.supplierVatPrefill],
  );

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
  const expense = useQuery(expenseQuery)[0] ?? null;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ExpenseFormValues | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<keyof ExpenseFormValues, string>>
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const money = (value: number) =>
    profile?.discreteMode === Evolu.sqliteTrue
      ? t("common.discreteMask")
      : formatMoney(value, locale, DEFAULT_CURRENCY);

  if (!expense) {
    return (
      <div className="page-shell">
        <div className="page-container-lg">
          <div className="flex items-center justify-between mb-5">
            <h1 className="page-title">{t("expenseForm.detailTitle")}</h1>
            <button onClick={onBack} className="btn-secondary">
              <ArrowLeft />
              {t("common.backToList")}
            </button>
          </div>
          <div className="empty-state">{t("expenseForm.notFound")}</div>
        </div>
      </div>
    );
  }

  const toForm = (): ExpenseFormValues => ({
    description: expense.description ?? "",
    expenseDate: toDateInput(expense.expenseDate),
    expenseNumber: expense.expenseNumber ?? "",
    amountWithoutVat:
      expense.amountWithoutVat != null ? String(expense.amountWithoutVat) : "",
    vatRate: expense.vatRate != null ? String(expense.vatRate) : "",
    amountWithVat:
      expense.amountWithVat != null ? String(expense.amountWithVat) : "",
    supplierVat: expense.supplierVat ?? "",
  });

  const values = draft ?? toForm();
  const gross = Number(expense.amountWithVat ?? 0);
  const base = Number(expense.amountWithoutVat ?? 0);

  const handleSave = () => {
    const found: Partial<Record<keyof ExpenseFormValues, string>> = {};
    if (!values.description.trim()) {
      found.description = t("alerts.expenseTypeRequired");
    }
    if (!values.amountWithVat.trim()) {
      found.amountWithVat = t("alerts.expenseAmountWithVatRequired");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const dateResult = Evolu.dateToDateIso(new Date(values.expenseDate));
    if (!dateResult.ok) {
      setErrors({ expenseDate: t("alerts.expenseDateInvalid") });
      return;
    }
    const nonNegative = (raw: string) => {
      if (!raw.trim()) return null;
      const result = Evolu.NonNegativeNumber.from(Number(raw));
      return result.ok ? result.value : null;
    };

    setIsSaving(true);
    const result = evolu.update("expense", {
      id: expense.id,
      description: values.description.trim(),
      expenseDate: dateResult.value,
      expenseNumber: values.expenseNumber.trim() || null,
      supplierVat: values.supplierVat.trim() || null,
      amountWithoutVat: nonNegative(values.amountWithoutVat),
      vatRate: nonNegative(values.vatRate),
      amountWithVat: nonNegative(values.amountWithVat),
    });
    setIsSaving(false);
    if (!result.ok) {
      notify(t("alerts.expenseSaveValidation"), "error");
      return;
    }
    setDraft(null);
    setIsEditing(false);
  };

  const cancelEditing = async () => {
    if (draft && JSON.stringify(draft) !== JSON.stringify(toForm())) {
      const ok = await confirmDialog({
        title: t("invoiceDetail.discardConfirm"),
        confirmLabel: t("invoiceDetail.cancelEdits"),
        tone: "danger",
      });
      if (!ok) return;
    }
    setDraft(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: t("alerts.invoiceDeleteConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setIsDeleting(true);
    const result = evolu.update("expense", {
      id: expense.id,
      deleted: Evolu.sqliteTrue,
    });
    setIsDeleting(false);
    if (!result.ok) {
      notify(t("alerts.expenseDeleteFailed"), "error");
      return;
    }
    onExpenseDeleted();
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <button onClick={onBack} className="btn-ghost mb-3">
          <ArrowLeft />
          {t("common.backToList")}
        </button>

        <div className="inv-head">
          <div className="inv-ident">
            <div className="client-title">{expense.description}</div>
            <div className="inv-dates">
              {formatDate(expense.expenseDate, locale)}
              {expense.expenseNumber ? ` · ${expense.expenseNumber}` : ""}
              {expense.supplierVat ? ` · ${expense.supplierVat}` : ""}
            </div>
          </div>
          <div className="inv-money">
            <div className="inv-total num">{money(gross)}</div>
            {isVatPayer && base > 0 ? (
              <div className="settings-help-text">
                {t("expensesList.periodBase", { amount: money(base) })}
                {" · "}
                {t("expensesList.colVat")} {money(gross - base)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="inv-actions">
          {!isEditing ? (
            <button
              className="btn-secondary"
              onClick={() => {
                setDraft(toForm());
                setIsEditing(true);
              }}
            >
              <Pencil />
              {t("common.edit")}
            </button>
          ) : null}
          <button
            className="btn-danger ml-auto"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 />
            {isDeleting ? t("invoiceDetail.deleting") : t("common.delete")}
          </button>
        </div>

        {isEditing ? (
          <>
            <div className="editing-bar">
              <span>{t("expenseForm.editingBanner")}</span>
              <div className="editing-bar-actions">
                <button className="btn-ghost" onClick={cancelEditing}>
                  {t("invoiceDetail.cancelEdits")}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
            <ExpenseForm
              values={values}
              errors={errors}
              isVatPayer={isVatPayer}
              suppliers={suppliers}
              onChange={(patch) => {
                setErrors({});
                setDraft((prev) => ({ ...(prev ?? toForm()), ...patch }));
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}
