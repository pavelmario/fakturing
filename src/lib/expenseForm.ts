import { invoiceNet, invoiceVat, type InvoiceItem } from "./invoice";
import { round2 } from "./expense";
import { emptyItem, type InvoiceItemForm } from "./invoiceItemForm";

/**
 * The editable shape of an expense — the same document as an invoice, read
 * the other way round: from whom, and for what.
 *
 * `items` is optional detail. Empty means the amount was read whole off the
 * receipt, which is how most costs are entered and why the gross field still
 * back-computes its base. Once there are lines, they are the truth and the
 * amount fields become their summary.
 */
export type ExpenseFormValues = {
  supplierName: string;
  supplierVat: string;
  supplierIco: string;
  description: string;
  expenseDate: string;
  expenseNumber: string;
  note: string;
  amountWithoutVat: string;
  vatRate: string;
  amountWithVat: string;
  items: InvoiceItemForm[];
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export const emptyExpense = (isVatPayer: boolean): ExpenseFormValues => ({
  supplierName: "",
  supplierVat: "",
  supplierIco: "",
  description: "",
  expenseDate: todayIso(),
  expenseNumber: "",
  note: "",
  amountWithoutVat: "",
  vatRate: isVatPayer ? "21" : "0",
  amountWithVat: "",
  items: [],
});

const num = (value: string | number | undefined | null, blank = 0): number => {
  const raw = String(value ?? "").trim();
  if (!raw) return blank;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Evolu's TrimmedString100 rejects anything longer; nothing here is worth
 *  failing a save over, so long values are cut rather than refused. */
export const trim100 = (value: string): string => value.trim().slice(0, 100);
export const trim1000 = (value: string): string => value.trim().slice(0, 1000);

/** A line the user added and left blank is not a line. */
const isFilled = (item: InvoiceItemForm): boolean =>
  Boolean(
    item.description.trim() ||
      item.unit.trim() ||
      item.amount.trim() ||
      item.unitPrice.trim(),
  );

export const hasFilledItems = (items: readonly InvoiceItemForm[]): boolean =>
  items.some(isFilled);

/** Lines as they will be stored: numbers, blank quantity meaning one. */
export const normalizeExpenseItems = (
  items: readonly InvoiceItemForm[],
  isVatPayer: boolean,
): InvoiceItem[] =>
  items.filter(isFilled).map((item) => ({
    amount: num(item.amount, 1),
    unit: item.unit.trim(),
    description: trim100(item.description),
    unitPrice: num(item.unitPrice),
    vat: isVatPayer ? num(item.vat) : 0,
  }));

export type ExpenseFormTotals = {
  net: number;
  vat: number;
  gross: number;
  /** Whether the figures come from the breakdown rather than the fields. */
  fromItems: boolean;
};

export const expenseFormTotals = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
): ExpenseFormTotals => {
  if (hasFilledItems(values.items)) {
    const items = normalizeExpenseItems(values.items, isVatPayer);
    const net = round2(invoiceNet(items));
    const vat = isVatPayer ? round2(invoiceVat(items)) : 0;
    return { net, vat, gross: round2(net + vat), fromItems: true };
  }
  const gross = num(values.amountWithVat);
  const net = isVatPayer ? num(values.amountWithoutVat) : gross;
  return { net, vat: gross - net, gross, fromItems: false };
};

/**
 * The rate to stamp on the document.
 *
 * With a breakdown the rate is per line, but one rate is still written to the
 * expense: it is what the ledger shows and what the control statement falls
 * back to. The band carrying the most money wins, which for the ordinary
 * single-rate receipt is simply that rate.
 */
const dominantRate = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
): number => {
  if (!isVatPayer) return 0;
  const items = normalizeExpenseItems(values.items, isVatPayer);
  const byRate = new Map<number, number>();
  for (const item of items) {
    const rate = Number(item.vat ?? 0);
    if (!(rate > 0)) continue;
    const base = Number(item.amount ?? 0) * Number(item.unitPrice ?? 0);
    byRate.set(rate, (byRate.get(rate) ?? 0) + base);
  }
  if (byRate.size === 0) return num(values.vatRate);
  return [...byRate.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

/**
 * The columns to write, whichever way the amount was entered. Everything
 * downstream — the ledger, the period totals, the XML export — reads these,
 * so they are kept filled and in step with the breakdown.
 */
export const expenseAmountColumns = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
): {
  amountWithoutVat: number;
  vatRate: number;
  amountWithVat: number;
} => {
  const totals = expenseFormTotals(values, isVatPayer);
  return {
    amountWithoutVat: totals.net,
    vatRate: dominantRate(values, isVatPayer),
    amountWithVat: totals.gross,
  };
};

/** A stored line back into an editable one. */
export const itemToForm = (item: InvoiceItem): InvoiceItemForm => ({
  amount: item.amount != null ? String(item.amount) : "",
  unit: typeof item.unit === "string" ? item.unit : "",
  description: typeof item.description === "string" ? item.description : "",
  unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
  vat: item.vat != null && Number(item.vat) !== 0 ? String(item.vat) : "",
});

/** A first line seeded from an amount already typed, so opening the
 *  breakdown never loses what was there. */
export const seedItemFromAmount = (
  values: ExpenseFormValues,
  isVatPayer: boolean,
): InvoiceItemForm => ({
  ...emptyItem(),
  description: values.description.trim(),
  amount: "1",
  unitPrice: isVatPayer
    ? values.amountWithoutVat.trim()
    : values.amountWithVat.trim(),
  vat: isVatPayer ? values.vatRate.trim() : "",
});
