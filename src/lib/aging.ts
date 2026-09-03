/**
 * The monthly billing series, and the one aggregate worth showing standing:
 * how much has been invoiced.
 *
 * There is deliberately no aggregate ageing report here. Bucketing receivables
 * into 1–30 / 30+ earns its place when there are too many open invoices to
 * scan; below that it restates, more vaguely, what the ledger's own state
 * column already says per invoice ("97 dní po splatnosti"). Lateness is shown
 * per invoice, and in aggregate only as a banner when something is actually
 * overdue.
 */

export type Aggregatable = {
  id: string;
  paymentDate?: string | null;
  issueDate?: string | null;
  paymentDays?: number | null;
  total: number;
  currency?: string | null;
};

export type MonthInvoice = {
  id: string;
  total: number;
  paid: boolean;
  /** Set only on invoices in a currency other than the series' own. */
  currency?: string;
};

/** One other currency's share of a month or a year. */
export type CurrencyTotals = {
  currency: string;
  invoiced: number;
  paid: number;
  unpaid: number;
  count: number;
};

export type MonthCell = {
  month: number;
  invoiced: number;
  paid: number;
  unpaid: number;
  /** Every invoice issued that month, whatever its currency. */
  count: number;
  /** Each invoice as its own stacked segment, largest first. */
  invoices: MonthInvoice[];
  /**
   * Invoices in another currency. Counted and listed, never measured: the
   * money figures above stay in one currency, because summing two of them
   * would mean converting, and nothing here converts.
   */
  foreign: MonthInvoice[];
  foreignTotals: CurrencyTotals[];
};

export type YearSeries = {
  year: number;
  months: MonthCell[];
  invoiced: number;
  paid: number;
  unpaid: number;
  count: number;
  paidCount: number;
  unpaidCount: number;
  peak: number;
  /** The year's other currencies, each on its own — never added together. */
  foreignTotals: CurrencyTotals[];
};

/**
 * Beyond this many invoices in one month the per-invoice dividers fall below a
 * pixel, so the column collapses back to two aggregate segments.
 */
export const MAX_SEGMENTS = 14;

const addTo = (
  totals: CurrencyTotals[],
  currency: string,
  total: number,
  paid: boolean,
) => {
  let entry = totals.find((candidate) => candidate.currency === currency);
  if (!entry) {
    entry = { currency, invoiced: 0, paid: 0, unpaid: 0, count: 0 };
    totals.push(entry);
  }
  entry.invoiced += total;
  entry.count += 1;
  if (paid) entry.paid += total;
  else entry.unpaid += total;
};

/**
 * @param currency The currency the bars are measured in. Invoices in any
 * other are kept apart — see `MonthCell.foreign`. Omitted, everything counts
 * as measurable, which is what a single-currency ledger wants.
 */
export const computeYearSeries = (
  invoices: readonly Aggregatable[],
  year: number,
  currency?: string,
): YearSeries => {
  const months: MonthCell[] = Array.from({ length: 12 }, (_, index) => ({
    month: index,
    invoiced: 0,
    paid: 0,
    unpaid: 0,
    count: 0,
    invoices: [],
    foreign: [],
    foreignTotals: [],
  }));

  for (const invoice of invoices) {
    if (!invoice.issueDate) continue;
    const issued = new Date(invoice.issueDate);
    if (Number.isNaN(issued.getTime()) || issued.getFullYear() !== year) {
      continue;
    }
    const cell = months[issued.getMonth()];
    const paid = Boolean(invoice.paymentDate);
    const own = invoice.currency ?? currency ?? "";
    cell.count += 1;

    if (currency && own !== currency) {
      cell.foreign.push({
        id: invoice.id,
        total: invoice.total,
        paid,
        currency: own,
      });
      addTo(cell.foreignTotals, own, invoice.total, paid);
      continue;
    }

    cell.invoiced += invoice.total;
    if (paid) cell.paid += invoice.total;
    else cell.unpaid += invoice.total;
    cell.invoices.push({ id: invoice.id, total: invoice.total, paid });
  }

  for (const cell of months) {
    cell.invoices.sort((a, b) => b.total - a.total);
    cell.foreign.sort((a, b) => b.total - a.total);
    cell.foreignTotals.sort((a, b) => a.currency.localeCompare(b.currency));
  }

  const foreignTotals: CurrencyTotals[] = [];
  for (const cell of months) {
    for (const invoice of cell.foreign) {
      addTo(foreignTotals, invoice.currency ?? "", invoice.total, invoice.paid);
    }
  }
  foreignTotals.sort((a, b) => a.currency.localeCompare(b.currency));

  const sum = (pick: (cell: MonthCell) => number) =>
    months.reduce((total, cell) => total + pick(cell), 0);

  /* invoiced === paid + unpaid, and count === paidCount + unpaidCount, so the
     three summary cells in the header read as a part-to-whole. */
  return {
    year,
    months,
    invoiced: sum((cell) => cell.invoiced),
    paid: sum((cell) => cell.paid),
    unpaid: sum((cell) => cell.unpaid),
    count: sum((cell) => cell.count),
    /* Counts cover every invoice, whatever its currency — the figure beside
       them is one currency's, and says so. */
    paidCount: sum(
      (cell) =>
        cell.invoices.filter((i) => i.paid).length +
        cell.foreign.filter((i) => i.paid).length,
    ),
    unpaidCount: sum(
      (cell) =>
        cell.invoices.filter((i) => !i.paid).length +
        cell.foreign.filter((i) => !i.paid).length,
    ),
    /* Scaled by measurable money only, so a foreign invoice cannot stretch
       the axis it is not drawn on. */
    peak: months.reduce((max, cell) => Math.max(max, cell.invoiced), 0),
    foreignTotals,
  };
};
