import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { ExpenseForm } from "./expenses/ExpenseForm";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import {
  emptyExpense,
  expenseFormTotals,
  type ExpenseFormValues,
} from "../lib/expenseForm";
import {
  buildExpensePayload,
  validateExpense,
  type ExpenseErrors,
} from "../lib/expenseSave";
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

  const totals = expenseFormTotals(values, isVatPayer);
  const money = (value: number) => formatMoney(value, locale, DEFAULT_CURRENCY);
  const amount = (value: number) => formatAmount(value, locale);

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
    const result = evolu.insert("expense", {
      ...payload,
      templateId: null,
      deleted: Evolu.sqliteFalse,
    });
    setIsSaving(false);
    if (!result.ok) {
      console.error("Expense insert error:", result.error);
      notify(t("alerts.expenseSaveValidation"), "error");
      return;
    }
    onExpenseCreated();
  };

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
            setValues((prev) => ({ ...prev, ...patch }));
          }}
          sidebarFooter={
            <div className="compose-panel compose-sticky">
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
