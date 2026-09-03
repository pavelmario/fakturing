import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ArrowLeft, Pencil, Repeat, Trash2 } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { ExpenseForm } from "./expenses/ExpenseForm";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import {
  expenseFormTotals,
  itemToForm,
  type ExpenseFormValues,
} from "../lib/expenseForm";
import {
  buildExpensePayload,
  buildTemplatePayload,
  validateExpense,
  type ExpenseErrors,
} from "../lib/expenseSave";
import { expenseAmounts, expenseItems, supplierLabel } from "../lib/expense";
import { collectSuppliers } from "../lib/supplierOptions";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import { formatDate, usesQuantity } from "../lib/invoice";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";

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
  const prefill = useMemo(
    () => parseSupplierVatPrefill(profile?.supplierVatPrefill),
    [profile?.supplierVatPrefill],
  );

  const supplierRowsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .select(["supplierName", "supplierVat", "supplierIco"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("expenseDate", "desc"),
      ),
    [evolu, owner.id],
  );
  const supplierRows = useQuery(supplierRowsQuery);
  const suppliers = useMemo(
    () => collectSuppliers(supplierRows, prefill),
    [supplierRows, prefill],
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
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const money = (value: number) =>
    profile?.discreteMode === Evolu.sqliteTrue
      ? t("common.discreteMask")
      : formatMoney(value, locale, DEFAULT_CURRENCY);
  /* The form states amounts you are typing, so it is never masked. */
  const plainMoney = (value: number) =>
    formatMoney(value, locale, DEFAULT_CURRENCY);
  const amount = (value: number) => formatAmount(value, locale);

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

  const storedItems = expenseItems(expense.items);
  const stored = expenseAmounts(expense);
  const showQuantity = usesQuantity(storedItems);

  const toForm = (): ExpenseFormValues => ({
    supplierName: expense.supplierName ?? "",
    supplierVat: expense.supplierVat ?? "",
    supplierIco: expense.supplierIco ?? "",
    description: expense.description ?? "",
    expenseDate: toDateInput(expense.expenseDate),
    expenseNumber: expense.expenseNumber ?? "",
    note: expense.note ?? "",
    amountWithoutVat:
      expense.amountWithoutVat != null ? String(expense.amountWithoutVat) : "",
    /* A blank rate makes every amount handler divide by 1, so correcting the
       total on a document written before the rate column was filled used to
       collapse its VAT to zero. Falling back to the standard rate is what the
       control statement already assumes about such a document. */
    vatRate:
      expense.vatRate != null
        ? String(expense.vatRate)
        : isVatPayer
          ? "21"
          : "0",
    amountWithVat:
      expense.amountWithVat != null ? String(expense.amountWithVat) : "",
    items: storedItems.map(itemToForm),
  });

  const values = draft ?? toForm();
  const totals = expenseFormTotals(values, isVatPayer);

  const handleSave = () => {
    const found = validateExpense(values, isVatPayer, t);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = buildExpensePayload(values, isVatPayer);
    if (!payload) {
      setErrors({ expenseDate: t("alerts.expenseDateInvalid") });
      return;
    }

    setIsSaving(true);
    const result = evolu.update("expense", { id: expense.id, ...payload });
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

  /* The cost you are looking at is usually the one you already know repeats,
     so a template is made from a real document rather than typed twice. */
  const saveAsTemplate = async () => {
    /* Twice would leave the first template with nothing pointing at it: its
       month would read as unbooked and the checklist would offer to write the
       same cost a second time. */
    if (expense.templateId) {
      notify(t("expenseTemplates.alreadyTemplate"));
      return;
    }
    const source = toForm();
    const ok = await confirmDialog({
      title: t("expenseTemplates.saveFromExpenseConfirm", {
        name: source.description,
      }),
      confirmLabel: t("expenseTemplates.saveFromExpense"),
    });
    if (!ok) return;
    const day = new Date(expense.expenseDate ?? "").getDate();
    const payload = buildTemplatePayload(
      source,
      isVatPayer,
      source.description,
      Number.isFinite(day) ? String(day) : "",
    );
    const result = evolu.insert("expenseTemplate", {
      ...payload,
      deleted: Evolu.sqliteFalse,
    });
    if (!result.ok) {
      notify(t("expenseTemplates.saveFailed"), "error");
      return;
    }
    /* This document *is* that recurring cost for its own month, so it is
       stamped with the template it just became. Without this the checklist
       would offer to book the period again and quietly duplicate it — so a
       failed stamp is reported rather than left to look like success. */
    const stamped = evolu.update("expense", {
      id: expense.id,
      templateId: String(result.value.id),
    });
    if (!stamped.ok) {
      console.error("Expense template stamp failed:", stamped.error);
      notify(t("expenseTemplates.stampFailed"), "error");
      return;
    }
    notify(t("expenseTemplates.saved", { name: payload.name }));
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

  const supplier = supplierLabel(expense, prefill);

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <button onClick={onBack} className="btn-ghost mb-3">
          <ArrowLeft />
          {t("common.backToList")}
        </button>

        <div className="inv-head">
          <div className="inv-ident">
            {supplier ? <div className="inv-client">{supplier}</div> : null}
            <div className="client-title">{expense.description}</div>
            <div className="inv-dates">
              {formatDate(expense.expenseDate, locale)}
              {expense.expenseNumber ? ` · ${expense.expenseNumber}` : ""}
              {expense.supplierVat ? ` · ${expense.supplierVat}` : ""}
            </div>
          </div>
          <div className="inv-money">
            <div className="inv-total num">{money(stored.gross)}</div>
            {isVatPayer && stored.net > 0 ? (
              <div className="settings-help-text">
                {t("expensesList.periodBase", { amount: money(stored.net) })}
                {" · "}
                {t("expensesList.colVat")} {money(stored.vat)}
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
                setNoteOpen(Boolean(expense.note));
                setIsEditing(true);
              }}
            >
              <Pencil />
              {t("common.edit")}
            </button>
          ) : null}
          {expense.templateId ? (
            <span className="lstate inv-action-note">
              <Repeat />
              {t("expenseTemplates.isTemplate")}
            </span>
          ) : (
            <button className="btn-secondary" onClick={saveAsTemplate}>
              <Repeat />
              {t("expenseTemplates.saveFromExpense")}
            </button>
          )}
          <button
            className="btn-danger inv-action-end"
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
              formatAmount={amount}
              noteOpen={noteOpen}
              onNoteOpenChange={setNoteOpen}
              onChange={(patch) => {
                setErrors({});
                setDraft((prev) => ({ ...(prev ?? toForm()), ...patch }));
              }}
              sidebarFooter={
                <div className="compose-panel compose-sticky">
                  <InvoiceSummary
                    net={totals.net}
                    vat={totals.vat}
                    gross={totals.gross}
                    isVatPayer={isVatPayer}
                    formatMoney={plainMoney}
                  />
                  <button
                    className="btn-primary w-full mt-3"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              }
            />
          </>
        ) : (
          <>
            {storedItems.length > 0 ? (
              <section className="compose-block">
                <h2 className="compose-heading">
                  {t("expenseForm.aboutTitle")}
                </h2>
                <div className="items-block">
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>{t("invoiceCreate.itemDescription")}</th>
                        {showQuantity ? (
                          <>
                            <th className="items-num">
                              {t("invoiceCreate.itemAmount")}
                            </th>
                            <th>{t("invoiceCreate.itemUnit")}</th>
                          </>
                        ) : null}
                        <th className="items-num">
                          {showQuantity
                            ? t("invoiceCreate.itemUnitPrice")
                            : t("invoiceCreate.itemPrice")}
                        </th>
                        {isVatPayer ? (
                          <th className="items-num">
                            {t("invoiceCreate.itemVat")}
                          </th>
                        ) : null}
                        <th className="items-num">
                          {t("invoiceCreate.itemTotal")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {storedItems.map((item, index) => (
                        <tr key={index}>
                          <td data-cell="description">
                            {String(item.description ?? "")}
                          </td>
                          {showQuantity ? (
                            <>
                              <td
                                data-cell="amount"
                                data-label={t("invoiceCreate.itemAmount")}
                                className="num"
                              >
                                {Number(item.amount ?? 1)}
                              </td>
                              <td
                                data-cell="unit"
                                data-label={t("invoiceCreate.itemUnit")}
                              >
                                {String(item.unit ?? "")}
                              </td>
                            </>
                          ) : null}
                          <td
                            data-cell="price"
                            data-label={t("invoiceCreate.itemUnitPrice")}
                            className="num"
                          >
                            {amount(Number(item.unitPrice ?? 0))}
                          </td>
                          {isVatPayer ? (
                            <td
                              data-cell="vat"
                              data-label={t("invoiceCreate.itemVat")}
                              className="num"
                            >
                              {Number(item.vat ?? 0)} %
                            </td>
                          ) : null}
                          <td
                            className="items-line-total num"
                            data-cell="total"
                            data-label={t("invoiceCreate.itemTotal")}
                          >
                            {amount(
                              Number(item.amount ?? 1) *
                                Number(item.unitPrice ?? 0),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <InvoiceSummary
                  net={stored.net}
                  vat={stored.vat}
                  gross={stored.gross}
                  isVatPayer={isVatPayer}
                  formatMoney={money}
                />
              </section>
            ) : null}

            {expense.note ? (
              <section className="compose-block mt-3">
                <h2 className="compose-heading">
                  {t("expenseForm.noteLabel")}
                </h2>
                <p className="settings-help-text">{expense.note}</p>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
