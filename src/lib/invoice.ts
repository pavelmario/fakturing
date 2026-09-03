/**
 * Shared invoice arithmetic and status rules.
 *
 * These used to be duplicated (and to disagree) between the list, the detail
 * page and the PDF: the list summed `amount * unitPrice` while the detail and
 * PDF added VAT, so a VAT payer's dashboard understated every figure. One
 * implementation now, used everywhere.
 */

export type InvoiceItem = {
  amount?: number | string;
  unit?: string;
  description?: string;
  unitPrice?: number | string;
  vat?: number | string;
};

export type InvoiceStatus = "paid" | "overdue" | "unpaid";

export const parseItems = (raw: unknown): InvoiceItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as InvoiceItem[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as InvoiceItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const num = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Sum of line totals, excluding VAT. */
export const invoiceNet = (items: readonly InvoiceItem[]): number =>
  items.reduce((sum, item) => sum + num(item.amount) * num(item.unitPrice), 0);

/** VAT owed across all lines. */
export const invoiceVat = (items: readonly InvoiceItem[]): number =>
  items.reduce(
    (sum, item) =>
      sum + num(item.amount) * num(item.unitPrice) * (num(item.vat) / 100),
    0,
  );

/** Sum of line totals including VAT. */
export const invoiceGross = (items: readonly InvoiceItem[]): number =>
  invoiceNet(items) + invoiceVat(items);

/**
 * The figure to show the user. A VAT payer thinks in gross — it is what the
 * client actually transfers and what the PDF and payment QR carry.
 */
export const invoiceTotal = (items: readonly InvoiceItem[], isVatPayer: boolean) =>
  isVatPayer ? invoiceGross(items) : invoiceNet(items);

export const parseDate = (iso: string | null | undefined): Date | null => {
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const dueDate = (
  issueDate: string | null | undefined,
  paymentDays: number | null | undefined,
): Date | null => {
  const issued = parseDate(issueDate);
  if (!issued) return null;
  const days = num(paymentDays);
  const due = new Date(issued);
  due.setDate(due.getDate() + days);
  due.setHours(0, 0, 0, 0);
  return due;
};

const startOfToday = (): Date => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

export const invoiceStatus = (invoice: {
  paymentDate?: string | null;
  issueDate?: string | null;
  paymentDays?: number | null;
}): InvoiceStatus => {
  if (invoice.paymentDate) return "paid";
  const due = dueDate(invoice.issueDate, invoice.paymentDays);
  if (due && due < startOfToday()) return "overdue";
  return "unpaid";
};

/** Negative once the due date has passed. */
export const daysUntilDue = (
  issueDate: string | null | undefined,
  paymentDays: number | null | undefined,
): number | null => {
  const due = dueDate(issueDate, paymentDays);
  if (!due) return null;
  return Math.round((due.getTime() - startOfToday().getTime()) / 86_400_000);
};

export const invoiceYear = (iso: string | null | undefined): number | null =>
  parseDate(iso)?.getFullYear() ?? null;

/**
 * Compact, fixed-width date. Czech renders as `20.08.2026` rather than the
 * locale default `20. 08. 2026` — in a tabular mono column the padded spaces
 * read as gaps and cost roughly two characters of width per row.
 */
export const formatDate = (
  iso: string | null | undefined,
  locale: string,
  placeholder = "—",
): string => {
  const parsed = parseDate(iso);
  if (!parsed) return placeholder;
  return parsed
    .toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\s+/g, "");
};


/**
 * Whether this invoice is billing *per something*.
 *
 * For IT work only part of what you invoice is time-based. "32 hod × 1 950"
 * needs a quantity and a unit; "Redesign webu — 47 500" has neither, and
 * printing "1 ks" against it is noise. A filled-in unit — or a quantity that
 * is not simply one — is the signal that those columns carry meaning, so the
 * form and the document show them only then.
 */
export const usesQuantity = (items: readonly InvoiceItem[]): boolean =>
  items.some((item) => {
    const unit = String(item.unit ?? "").trim();
    if (unit) return true;
    const raw = String(item.amount ?? "").trim();
    return Boolean(raw) && Number(raw) !== 1;
  });
