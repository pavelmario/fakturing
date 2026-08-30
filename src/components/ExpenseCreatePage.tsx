import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { ExpenseForm } from "./expenses/ExpenseForm";
import { emptyExpense, type ExpenseFormValues } from "../lib/expenseForm";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import { useNotify } from "../lib/confirmContext";

type ExpenseCreatePageProps = {
  onExpenseCreated: () => void;
};

export function ExpenseCreatePage({
  onExpenseCreated,
}: ExpenseCreatePageProps) {
  const { t } = useI18n();
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
  const suppliers = useMemo(
    () => parseSupplierVatPrefill(profile?.supplierVatPrefill),
    [profile?.supplierVatPrefill],
  );

  const [values, setValues] = useState<ExpenseFormValues>(() =>
    emptyExpense(isVatPayer),
  );
  const [errors, setErrors] = useState<
    Partial<Record<keyof ExpenseFormValues, string>>
  >({});
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = () => {
    const found: Partial<Record<keyof ExpenseFormValues, string>> = {};
    if (!values.description.trim()) {
      found.description = t("alerts.expenseTypeRequired");
    }
    if (!values.expenseDate.trim()) {
      found.expenseDate = t("alerts.expenseDateRequired");
    }
    if (!values.amountWithVat.trim() || Number(values.amountWithVat) < 0) {
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
    const result = evolu.insert("expense", {
      description: values.description.trim(),
      expenseDate: dateResult.value,
      expenseNumber: values.expenseNumber.trim() || null,
      supplierVat: values.supplierVat.trim() || null,
      amountWithoutVat: nonNegative(values.amountWithoutVat),
      vatRate: nonNegative(values.vatRate),
      amountWithVat: nonNegative(values.amountWithVat),
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
      <div className="page-container">
        <h1 className="page-title mb-5">{t("expenseForm.title")}</h1>
        <ExpenseForm
          values={values}
          errors={errors}
          isVatPayer={isVatPayer}
          suppliers={suppliers}
          onChange={(patch) => {
            setErrors({});
            setValues((prev) => ({ ...prev, ...patch }));
          }}
        />
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full mt-3"
        >
          {isSaving ? t("common.saving") : t("expenseForm.save")}
        </button>
      </div>
    </div>
  );
}
