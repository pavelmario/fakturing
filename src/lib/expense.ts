/**
 * Shared expense arithmetic — the mirror of `lib/invoice.ts`.
 *
 * An expense is now the same document as an invoice read the other way round:
 * from whom, and for what. The "for what" is an optional breakdown in
 * `expense.items`, holding the same line shape as `invoice.items`, so the two
 * share the item table, the totals and the parser.
 *
 * The three amount columns (`amountWithoutVat`, `vatRate`, `amountWithVat`)
 * stay filled whether or not there is a breakdown. They are what the ledger,
 * the period totals and the kontrolní hlášení export have always read, and
 * keeping them written means none of that had to learn about items.
 */

import { invoiceNet, invoiceVat, parseItems, type InvoiceItem } from "./invoice";

export type ExpenseItem = InvoiceItem;

/** The columns every helper here needs; pages pass whole rows. */
export type ExpenseAmountSource = {
  items?: unknown;
  amountWithoutVat?: number | null;
  amountWithVat?: number | null;
  vatRate?: number | null;
};

export const round2 = (value: number): number => Math.round(value * 100) / 100;

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Lines with nothing on them are not a breakdown. */
export const expenseItems = (raw: unknown): ExpenseItem[] =>
  parseItems(raw).filter(
    (item) =>
      String(item.description ?? "").trim() !== "" ||
      num(item.unitPrice) !== 0 ||
      num(item.amount) !== 0,
  );

/**
 * What the expense cost.
 *
 * The breakdown wins when there is one — it is what the user last edited, and
 * the stored columns are its summary. Without one, the stored amounts are the
 * document, exactly as before.
 */
export const expenseAmounts = (
  expense: ExpenseAmountSource,
): { net: number; vat: number; gross: number } =>
  expenseAmountsOf(expenseItems(expense.items), expense);

/**
 * The same figures when the lines have already been parsed — the list pages
 * decorate every row once rather than re-reading the same JSON column five
 * times per render.
 */
export const expenseAmountsOf = (
  items: readonly ExpenseItem[],
  expense: ExpenseAmountSource,
): { net: number; vat: number; gross: number } => {
  if (items.length > 0) {
    const net = invoiceNet(items);
    const vat = invoiceVat(items);
    return { net: round2(net), vat: round2(vat), gross: round2(net + vat) };
  }
  const gross = num(expense.amountWithVat);
  const net = num(expense.amountWithoutVat);
  return { net, vat: gross - net, gross };
};

/**
 * The legal rate a typed one belongs to.
 *
 * Kept verbatim from the export it was extracted out of, tolerant input and
 * all: a rate stored as 0.21 or 21 both land on 21, because both have been
 * typed into that field.
 */
const normalizeVatRate = (vatRate: number): 21 | 12 | 10 => {
  if (!Number.isFinite(vatRate) || vatRate <= 0) return 21;
  const candidates = [vatRate, vatRate * 10, vatRate * 100];
  const allowedRates: Array<21 | 12 | 10> = [21, 12, 10];

  let bestRate: 21 | 12 | 10 = 21;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    for (const allowedRate of allowedRates) {
      const diff = Math.abs(candidate - allowedRate);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestRate = allowedRate;
      }
    }
  }

  return bestRate;
};

/**
 * The two bands the control statement reports in: 21 % is `zakl_dane1`, the
 * reduced rate `zakl_dane2`. Czech VAT has had a single reduced rate since
 * 2024, so 10 and 12 collapse into one band.
 */
const bandRateOf = (rate: number): 21 | 12 =>
  normalizeVatRate(rate) === 21 ? 21 : 12;

export type VatBands = {
  zakl_dane1: number;
  dan1: number;
  zakl_dane2: number;
  dan2: number;
};

const emptyBands = (): VatBands => ({
  zakl_dane1: 0,
  dan1: 0,
  zakl_dane2: 0,
  dan2: 0,
});

/**
 * Whether the document belongs in the control statement at all.
 *
 * A purchase from a non-VAT payer, or any other supply carrying no tax, gives
 * nothing to deduct and is not reported. The distinction that matters is
 * between a rate **explicitly set to zero** — the "0 %" the form offers — and
 * a rate that was simply never recorded: `normalizeVatRate` reads a missing
 * rate as the standard one, which is the older behaviour and stays, so
 * documents predating the rate column keep being reported as they were.
 */
export const hasNothingToReport = (expense: ExpenseAmountSource): boolean => {
  if (expense.vatRate == null || num(expense.vatRate) !== 0) return false;
  /* A zero on the document is overridden by any line that does carry a rate,
     since the lines are the finer truth. */
  return !expenseItems(expense.items).some((item) => num(item.vat) > 0);
};

/**
 * The expense split into the bands the kontrolní hlášení reports.
 *
 * A single document can carry both rates — a receipt with 21 % goods and 12 %
 * food is one document — and VetaB2 has attributes for both, so an itemised
 * expense is summed per line. Tax on the line is recomputed from the *legal*
 * band rate rather than from what was typed, which is what the export has
 * always done: only 21 and 12 are filable.
 *
 * Two deliberate fallbacks, both so that itemising an expense can never quietly
 * report less than the same expense would have reported unitemised:
 *   - no breakdown → the stored amounts, split by the document's own rate,
 *     the exact arithmetic this function was extracted from;
 *   - a breakdown with no rate anywhere on it → the same, because blank lines
 *     mean "the rate is on the document", not "no VAT to deduct".
 *
 * A document that carries **no VAT at all** reports nothing: see
 * `hasNothingToReport`.
 */
export const expenseVatBands = (expense: ExpenseAmountSource): VatBands => {
  if (hasNothingToReport(expense)) return emptyBands();

  const items = expenseItems(expense.items);
  const rated = items.filter((item) => num(item.vat) > 0);

  if (rated.length > 0) {
    const bands = emptyBands();
    for (const item of rated) {
      const zaklDane = round2(num(item.amount) * num(item.unitPrice));
      if (zaklDane === 0) continue;
      const rate = bandRateOf(num(item.vat));
      const dan = round2((zaklDane * rate) / 100);
      if (rate === 12) {
        bands.zakl_dane2 += zaklDane;
        bands.dan2 += dan;
      } else {
        bands.zakl_dane1 += zaklDane;
        bands.dan1 += dan;
      }
    }
    return bands;
  }

  const amountWithVat = num(expense.amountWithVat);
  const amountWithoutVat = Number(expense.amountWithoutVat ?? Number.NaN);
  const rate = bandRateOf(num(expense.vatRate ?? 21));
  const bands = emptyBands();

  const zaklDane =
    Number.isFinite(amountWithoutVat) && amountWithoutVat >= 0
      ? round2(amountWithoutVat)
      : round2(amountWithVat / (1 + rate / 100));
  const dan =
    Number.isFinite(amountWithoutVat) && amountWithoutVat >= 0
      ? round2((zaklDane * rate) / 100)
      : round2(amountWithVat - zaklDane);

  if (rate === 12) {
    bands.zakl_dane2 = zaklDane;
    bands.dan2 = dan;
  } else {
    bands.zakl_dane1 = zaklDane;
    bands.dan1 = dan;
  }
  return bands;
};

export const addBands = (into: VatBands, from: VatBands): void => {
  into.zakl_dane1 += from.zakl_dane1;
  into.dan1 += from.dan1;
  into.zakl_dane2 += from.zakl_dane2;
  into.dan2 += from.dan2;
};

export const bandsAreEmpty = (bands: VatBands): boolean =>
  bands.zakl_dane1 === 0 &&
  bands.dan1 === 0 &&
  bands.zakl_dane2 === 0 &&
  bands.dan2 === 0;

/**
 * How to label an expense whose supplier was recorded before there was a
 * field for it: the name if it was typed, otherwise whatever the VAT-number
 * list in Settings calls that DIČ, otherwise the number itself.
 */
export const supplierLabel = (
  expense: { supplierName?: string | null; supplierVat?: string | null },
  known: readonly { name: string; vat: string }[] = [],
): string => {
  const name = expense.supplierName?.trim();
  if (name) return name;
  const vat = expense.supplierVat?.trim();
  if (!vat) return "";
  const match = known.find(
    (option) => option.vat.trim().toLowerCase() === vat.toLowerCase(),
  );
  return match?.name ?? vat;
};
