import {
  invoiceStatus,
  invoiceTotal,
  parseItems,
  type InvoiceStatus,
} from "./invoice";

export type ClientInvoice = {
  clientName: string | null;
  clientId?: string | null;
  currency?: string | null;
  issueDate: string | null;
  paymentDate?: string | null;
  paymentDays: number | null;
  items: unknown;
};

export type ClientTotals = {
  count: number;
  /** Per currency — amounts are never converted. */
  invoiced: Map<string, number>;
  unpaid: Map<string, number>;
  overdueCount: number;
  lastIssue: number;
};

const empty = (): ClientTotals => ({
  count: 0,
  invoiced: new Map(),
  unpaid: new Map(),
  overdueCount: 0,
  lastIssue: 0,
});

const add = (into: Map<string, number>, currency: string, value: number) =>
  into.set(currency, (into.get(currency) ?? 0) + value);

/**
 * Revenue per client, keyed by name.
 *
 * The client list showed name, phone and email — an address book. Your clients
 * are your revenue, so what you actually want to see is what each is worth and
 * which of them owe you money. Keyed by name because invoices reference the
 * client by name today; it becomes an id join once `clientId` lands.
 */
export const clientTotals = (
  invoices: readonly ClientInvoice[],
  isVatPayer: boolean,
  /** Maps a client id to its current name, so renamed clients keep history. */
  nameById?: Map<string, string>,
): Map<string, ClientTotals> => {
  const totals = new Map<string, ClientTotals>();
  for (const invoice of invoices) {
    const key =
      (invoice.clientId && nameById?.get(invoice.clientId)) ||
      invoice.clientName ||
      "";
    if (!key) continue;
    const entry = totals.get(key) ?? empty();
    const total = invoiceTotal(parseItems(invoice.items), isVatPayer);
    const status: InvoiceStatus = invoiceStatus(invoice);
    const currency = invoice.currency || "CZK";

    entry.count += 1;
    add(entry.invoiced, currency, total);
    if (status !== "paid") add(entry.unpaid, currency, total);
    if (status === "overdue") entry.overdueCount += 1;

    const issued = invoice.issueDate ? new Date(invoice.issueDate) : null;
    if (issued && !Number.isNaN(issued.getTime())) {
      entry.lastIssue = Math.max(entry.lastIssue, issued.getTime());
    }
    totals.set(key, entry);
  }
  return totals;
};

export const emptyTotals = empty;
