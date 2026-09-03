import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { ExpenseForm } from "./expenses/ExpenseForm";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import {
  emptyExpense,
  expenseFormTotals,
  itemToForm,
  type ExpenseFormValues,
} from "../lib/expenseForm";
import {
  buildTemplatePayload,
  validateExpense,
  type ExpenseErrors,
} from "../lib/expenseSave";
import { expenseItems } from "../lib/expense";
import { collectSuppliers } from "../lib/supplierOptions";
import { parseSupplierVatPrefill } from "../supplierVatPrefill";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";

const ExpenseTemplateId = Evolu.id("ExpenseTemplate");

type ExpenseTemplatePageProps = {
  /** Empty when creating a new template. */
  templateId?: string;
  onDone: () => void;
};

/**
 * A recurring cost, edited as the expense it will become — the same form,
 * minus the two things a template cannot have: a date and a document number.
 */
export function ExpenseTemplatePage({
  templateId,
  onDone,
}: ExpenseTemplatePageProps) {
  const { t, locale } = useI18n();
  const confirmDialog = useConfirm();
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

  const idValue = useMemo(() => {
    const result = ExpenseTemplateId.from(templateId ?? "");
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"ExpenseTemplate">("invalid-template-id");
  }, [templateId]);

  const templateQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expenseTemplate")
          .selectAll()
          .where("id", "=", idValue)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1),
      ),
    [evolu, idValue, owner.id],
  );
  const template = useQuery(templateQuery)[0] ?? null;
  const isNew = !templateId;

  const seed = (): {
    values: ExpenseFormValues;
    name: string;
    dayOfMonth: string;
  } => {
    if (!template) {
      return {
        values: emptyExpense(isVatPayer),
        name: "",
        dayOfMonth: "1",
      };
    }
    return {
      values: {
        supplierName: template.supplierName ?? "",
        supplierVat: template.supplierVat ?? "",
        supplierIco: template.supplierIco ?? "",
        description: template.description ?? "",
        expenseDate: "",
        expenseNumber: "",
        note: template.note ?? "",
        amountWithoutVat:
          template.amountWithoutVat != null
            ? String(template.amountWithoutVat)
            : "",
        vatRate: template.vatRate != null ? String(template.vatRate) : "",
        amountWithVat:
          template.amountWithVat != null ? String(template.amountWithVat) : "",
        items: expenseItems(template.items).map(itemToForm),
      },
      name: template.name ?? "",
      dayOfMonth: template.dayOfMonth != null ? String(template.dayOfMonth) : "",
    };
  };

  const [draft, setDraft] = useState<ReturnType<typeof seed> | null>(null);
  const [errors, setErrors] = useState<ExpenseErrors>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const state = draft ?? seed();
  const totals = expenseFormTotals(state.values, isVatPayer);
  const money = (value: number) => formatMoney(value, locale, DEFAULT_CURRENCY);
  const amount = (value: number) => formatAmount(value, locale);

  const patch = (next: Partial<ReturnType<typeof seed>>) => {
    setErrors({});
    setDraft((prev) => ({ ...(prev ?? seed()), ...next }));
  };

  if (!isNew && !template) {
    return (
      <div className="page-shell">
        <div className="page-container-lg">
          <button onClick={onDone} className="btn-ghost mb-3">
            <ArrowLeft />
            {t("common.backToList")}
          </button>
          <div className="empty-state">{t("expenseTemplates.notFound")}</div>
        </div>
      </div>
    );
  }

  const handleSave = () => {
    const found = validateExpense(state.values, isVatPayer, t, {
      requireDate: false,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const payload = buildTemplatePayload(
      state.values,
      isVatPayer,
      state.name,
      state.dayOfMonth,
    );

    setIsSaving(true);
    const result = template
      ? evolu.update("expenseTemplate", { id: template.id, ...payload })
      : evolu.insert("expenseTemplate", {
          ...payload,
          deleted: Evolu.sqliteFalse,
        });
    setIsSaving(false);
    if (!result.ok) {
      console.error("Expense template save error:", result.error);
      notify(t("expenseTemplates.saveFailed"), "error");
      return;
    }
    onDone();
  };

  const handleDelete = async () => {
    if (!template) return;
    const ok = await confirmDialog({
      title: t("expenseTemplates.deleteConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    const result = evolu.update("expenseTemplate", {
      id: template.id,
      deleted: Evolu.sqliteTrue,
    });
    if (!result.ok) {
      notify(t("expenseTemplates.saveFailed"), "error");
      return;
    }
    onDone();
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <button onClick={onDone} className="btn-ghost mb-3">
          <ArrowLeft />
          {t("common.backToList")}
        </button>
        <div className="page-head">
          <h1 className="page-title">
            {isNew
              ? t("expenseTemplates.createTitle")
              : t("expenseTemplates.editTitle")}
          </h1>
          {template ? (
            <button className="btn-danger" onClick={handleDelete}>
              <Trash2 />
              {t("common.delete")}
            </button>
          ) : null}
        </div>

        <ExpenseForm
          variant="template"
          values={state.values}
          errors={errors}
          isVatPayer={isVatPayer}
          suppliers={suppliers}
          formatAmount={amount}
          noteOpen={noteOpen}
          onNoteOpenChange={setNoteOpen}
          onChange={(values) =>
            patch({ values: { ...state.values, ...values } })
          }
          documentSlot={
            <>
              <label htmlFor="templateName" className="form-label">
                {t("expenseTemplates.nameLabel")}
              </label>
              <input
                id="templateName"
                type="text"
                value={state.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder={
                  state.values.description ||
                  t("expenseTemplates.namePlaceholder")
                }
                className="form-input"
              />

              <label htmlFor="templateDay" className="form-label mt-3">
                {t("expenseTemplates.dayOfMonthLabel")}
              </label>
              <input
                id="templateDay"
                type="number"
                min={1}
                max={31}
                value={state.dayOfMonth}
                onChange={(e) => patch({ dayOfMonth: e.target.value })}
                className="form-input mono"
              />
              <p className="field-hint">
                {t("expenseTemplates.dayOfMonthHint")}
              </p>
            </>
          }
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
                className="btn-primary w-full mt-3"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? t("common.saving") : t("expenseTemplates.save")}
              </button>
            </div>
          }
        />
      </div>
    </div>
  );
}
