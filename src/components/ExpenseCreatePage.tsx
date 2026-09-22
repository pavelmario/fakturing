import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useUnsavedGuard } from "../lib/useUnsavedGuard";
import { ExpenseForm } from "./expenses/ExpenseForm";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import {
  emptyExpense,
  expenseFormTotals,
  type ExpenseFormValues,
} from "../lib/expenseForm";
import {
  buildExpensePayload,
  buildTemplatePayload,
  effectiveDescription,
  validateExpense,
  type ExpenseErrors,
} from "../lib/expenseSave";
import { expenseDate } from "../lib/expense";
import { collectSuppliers } from "../lib/supplierOptions";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";
import { useNotify } from "../lib/confirmContext";

type ExpenseCreatePageProps = {
  onExpenseCreated: () => void;
};

export function ExpenseCreatePage({
  onExpenseCreated,
}: ExpenseCreatePageProps) {
  const { t, locale } = useI18n();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer", "supplierVatPrefill"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;

  /* Suppliers are gathered, not managed: whoever you have already bought
     from, plus the DIČ list from Settings. */
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
    () =>
      collectSuppliers(
        supplierRows,
        parseSupplierVatPrefill(profile?.supplierVatPrefill),
      ),
    [supplierRows, profile?.supplierVatPrefill],
  );

  const [values, setValues] = useState<ExpenseFormValues>(() =>
    emptyExpense(isVatPayer),
  );
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [touched, setTouched] = useState(false);
  /* A cost can be the first sighting of one that repeats: ticking this saves
     a template from the document as it is entered, rather than making you open
     the detail page and save it again. */
  const [recurring, setRecurring] = useState(false);
  const [autoCreate, setAutoCreate] = useState(true);

  const totals = expenseFormTotals(values, isVatPayer);
  const money = (value: number) =>
    formatMoney(value, locale, values.currency || DEFAULT_CURRENCY);
  const amount = (value: number) => formatAmount(value, locale);

  /* Writing the cost and leaving the page are separate: the guard saves
     without going anywhere, because you are already on your way somewhere
     the guard is about to take you. */
  const persist = (): boolean => {
    const found = validateExpense(values, isVatPayer, t);
    setErrors(found);
    if (Object.keys(found).length > 0) return false;

    const payload = buildExpensePayload(values, isVatPayer);
    if (!payload) {
      setErrors({ expenseDate: t("alerts.expenseDateInvalid") });
      return false;
    }

    /* The template first, so the document is written already carrying it.
       Its day of the month is the day of the document: the cost repeats on
       the date it was entered as. */
    let templateId: string | null = null;
    if (recurring) {
      const day = expenseDate(values.expenseDate)?.getDate();
      const templatePayload = buildTemplatePayload(
        values,
        isVatPayer,
        effectiveDescription(values),
        day != null ? String(day) : "",
        autoCreate,
      );
      const templateResult = evolu.insert("expenseTemplate", {
        ...templatePayload,
        deleted: Evolu.sqliteFalse,
      });
      if (!templateResult.ok) {
        console.error("Expense template insert error:", templateResult.error);
        /* The document is not lost over it: it is saved as a one-off and
           the failed template is said out loud. */
        notify(t("expenseForm.recurringFailed"), "error");
      } else {
        templateId = templateResult.value.id;
      }
    }

    setIsSaving(true);
    const result = evolu.insert("expense", {
      ...payload,
      templateId,
      deleted: Evolu.sqliteFalse,
    });
    setIsSaving(false);
    if (!result.ok) {
      console.error("Expense insert error:", result.error);
      notify(t("alerts.expenseSaveValidation"), "error");
      return false;
    }
    setTouched(false);
    return true;
  };

  const handleSave = () => {
    if (!persist()) return;
    guard.release();
    onExpenseCreated();
  };

  const guard = useUnsavedGuard(touched, () => persist());

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-head">
          <h1 className="page-title">{t("expenseForm.title")}</h1>
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
            setTouched(true);
            setValues((prev) => ({ ...prev, ...patch }));
          }}
          sidebarFooter={
            <div className="compose-panel compose-sticky">
              <div className="setting-row">
                <label className="setting-toggle">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => {
                      setTouched(true);
                      setRecurring(e.target.checked);
                    }}
                  />
                  <span>{t("expenseForm.recurringLabel")}</span>
                </label>
                <p className="field-hint setting-hint">
                  {t("expenseForm.recurringHint")}
                </p>
              </div>
              {recurring ? (
                <div className="setting-row">
                  <label className="setting-toggle">
                    <input
                      type="checkbox"
                      checked={autoCreate}
                      onChange={(e) => {
                        setTouched(true);
                        setAutoCreate(e.target.checked);
                      }}
                    />
                    <span>{t("expenseTemplates.autoCreateLabel")}</span>
                  </label>
                  <p className="field-hint setting-hint">
                    {t("expenseTemplates.autoCreateHint")}
                  </p>
                </div>
              ) : null}
              <InvoiceSummary
                net={totals.net}
                vat={totals.vat}
                gross={totals.gross}
                isVatPayer={isVatPayer}
                formatMoney={money}
              />
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary w-full mt-3"
              >
                {isSaving ? t("common.saving") : t("expenseForm.save")}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
