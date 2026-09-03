import * as Evolu from "@evolu/common";
import {
  expenseAmountColumns,
  expenseFormTotals,
  hasFilledItems,
  normalizeExpenseItems,
  trim100,
  trim1000,
  type ExpenseFormValues,
} from "./expenseForm";

export type ExpenseErrors = Partial<Record<keyof ExpenseFormValues, string>>;

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The label the expense is filed under.
 *
 * A broken-down expense should not make you name it twice, so a blank
 * description takes the first line's — which is what the placeholder was
 * already showing.
 */
export const effectiveDescription = (values: ExpenseFormValues): string => {
  const typed = values.description.trim();
  if (typed) return trim100(typed);
  const line = values.items.find((item) => item.description.trim());
  return trim100(line?.description ?? "");
};

export const validateExpense = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
  t: Translate,
  options: { requireDate?: boolean } = {},
): ExpenseErrors => {
  const { requireDate = true } = options;
  const found: ExpenseErrors = {};

  if (!effectiveDescription(values)) {
    found.description = t("alerts.expenseTypeRequired");
  }
  if (requireDate && !values.expenseDate.trim()) {
    found.expenseDate = t("alerts.expenseDateRequired");
  }

  const totals = expenseFormTotals(values, isVatPayer);
  if (!(totals.gross > 0)) {
    /* With a breakdown open the amount fields are not on screen, so the
       message has to point at the lines instead. */
    found[hasFilledItems(values.items) ? "items" : "amountWithVat"] =
      hasFilledItems(values.items)
        ? t("alerts.expenseItemsAmountRequired")
        : t("alerts.expenseAmountWithVatRequired");
  }
  return found;
};

/** The columns shared by an expense and a recurring template. */
const commonColumns = (values: ExpenseFormValues, isVatPayer: boolean) => {
  const amounts = expenseAmountColumns(values, isVatPayer);
  const nonNegative = (value: number) => {
    const result = Evolu.NonNegativeNumber.from(value);
    return result.ok ? result.value : null;
  };
  const items = normalizeExpenseItems(values.items, isVatPayer);
  const itemsResult = Evolu.Json.from(JSON.stringify(items));

  return {
    description: effectiveDescription(values),
    supplierName: trim100(values.supplierName) || null,
    supplierVat: trim100(values.supplierVat) || null,
    supplierIco: trim100(values.supplierIco) || null,
    amountWithoutVat: nonNegative(amounts.amountWithoutVat),
    vatRate: nonNegative(amounts.vatRate),
    amountWithVat: nonNegative(amounts.amountWithVat),
    note: trim1000(values.note) || null,
    items: items.length > 0 && itemsResult.ok ? itemsResult.value : null,
  };
};

/** Null when the date will not parse — the only value that can still fail. */
export const buildExpensePayload = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
) => {
  const dateResult = Evolu.dateToDateIso(new Date(values.expenseDate));
  if (!dateResult.ok) return null;
  return {
    ...commonColumns(values, isVatPayer),
    expenseNumber: trim100(values.expenseNumber) || null,
    expenseDate: dateResult.value,
  };
};

export type ExpensePayload = NonNullable<ReturnType<typeof buildExpensePayload>>;

export const buildTemplatePayload = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
  name: string,
  dayOfMonth: string,
) => {
  const day = Number(dayOfMonth);
  const dayResult =
    dayOfMonth.trim() && Number.isFinite(day)
      ? Evolu.NonNegativeNumber.from(Math.min(Math.max(Math.round(day), 1), 31))
      : null;
  const columns = commonColumns(values, isVatPayer);
  return {
    ...columns,
    name: trim100(name) || columns.description,
    dayOfMonth: dayResult?.ok ? dayResult.value : null,
  };
};
