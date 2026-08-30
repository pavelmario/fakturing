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
};

export type MonthInvoice = {
  id: string;
  total: number;
  paid: boolean;
};

export type MonthCell = {
  month: number;
  invoiced: number;
  paid: number;
  unpaid: number;
  count: number;
  /** Each invoice as its own stacked segment, largest first. */
  invoices: MonthInvoice[];
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
};

/**
 * Beyond this many invoices in one month the per-invoice dividers fall below a
 * pixel, so the column collapses back to two aggregate segments.
 */
export const MAX_SEGMENTS = 14;

export const computeYearSeries = (
  invoices: readonly Aggregatable[],
  year: number,
): YearSeries => {
  const months: MonthCell[] = Array.from({ length: 12 }, (_, index) => ({
    month: index,
    invoiced: 0,
    paid: 0,
    unpaid: 0,
    count: 0,
    invoices: [],
  }));

  for (const invoice of invoices) {
    if (!invoice.issueDate) continue;
    const issued = new Date(invoice.issueDate);
    if (Number.isNaN(issued.getTime()) || issued.getFullYear() !== year) {
      continue;
    }
    const cell = months[issued.getMonth()];
    const paid = Boolean(invoice.paymentDate);
    cell.invoiced += invoice.total;
    cell.count += 1;
    if (paid) cell.paid += invoice.total;
    else cell.unpaid += invoice.total;
    cell.invoices.push({ id: invoice.id, total: invoice.total, paid });
  }

  for (const cell of months) {
    cell.invoices.sort((a, b) => b.total - a.total);
  }

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
    paidCount: sum((cell) => cell.invoices.filter((i) => i.paid).length),
    unpaidCount: sum((cell) => cell.invoices.filter((i) => !i.paid).length),
    peak: months.reduce((max, cell) => Math.max(max, cell.invoiced), 0),
  };
};
