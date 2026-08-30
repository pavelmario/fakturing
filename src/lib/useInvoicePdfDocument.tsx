import { useMemo } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { useI18n } from "../i18n";
import { useInvoiceQr } from "./useInvoiceQr";
import { invoiceNet, invoiceVat, parseItems, usesQuantity } from "./invoice";
import { resolveAccount, type BankAccountRow } from "./bankAccounts";
import { DEFAULT_CURRENCY } from "./money";
import {
  InvoicePdfDocument,
  type InvoicePdfData,
} from "../components/invoices/InvoicePdfDocument";

type Source = {
  invoiceNumber?: string | null;
  clientName?: string | null;
  issueDate?: string | null;
  duzp?: string | null;
  paymentDays?: number | null;
  paymentMethod?: string | null;
  purchaseOrderNumber?: string | null;
  invoicingNote?: string | null;
  btcInvoice?: number | null;
  btcAddress?: string | null;
  bankAccountId?: string | null;
  currency?: string | null;
  items?: unknown;
};

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Builds the invoice document element.
 *
 * Lifted out of `InvoicePdfPreview` so the download action can live wherever a
 * page needs it — on the detail page that is the top action bar, next to
 * Upravit, rather than below a full-page preview you had to scroll past.
 */
export const useInvoicePdfDocument = (
  invoice: Source,
  profile: InvoicePdfData["profile"],
  selectedClient: InvoicePdfData["selectedClient"],
  showVat: boolean,
  bankAccounts: readonly BankAccountRow[] = [],
): ReactElement<DocumentProps> => {
  const { t, locale } = useI18n();

  const normalizedItems = useMemo(
    () => parseItems(invoice.items),
    [invoice.items],
  );

  const net = invoiceNet(normalizedItems);
  const vatAmount = invoiceVat(normalizedItems);
  const gross = net + vatAmount;

  const formatNumber = (value: number, maxFraction = 2) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFraction,
    }).format(value);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: invoice.currency || DEFAULT_CURRENCY,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);

  const dateOf = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale).replace(/\s/g, "") : "";

  const due = useMemo(() => {
    if (!invoice.issueDate) return null;
    const issued = new Date(invoice.issueDate);
    if (Number.isNaN(issued.getTime())) return null;
    const value = new Date(issued);
    value.setDate(issued.getDate() + Number(invoice.paymentDays ?? 0));
    return value;
  }, [invoice.issueDate, invoice.paymentDays]);

  const invoiceNumberValue = invoice.invoiceNumber ?? "";
  const sanitizedInvoiceNumber = invoiceNumberValue.replace(/-/g, "");

  /* Falls back to the profile's legacy single account when none are set up. */
  const account = resolveAccount(bankAccounts, profile, invoice.bankAccountId);

  const qrCodeDataUrl = useInvoiceQr({
    invoice,
    profile: account
      ? {
          bankAccount: account.accountNumber,
          iban: account.iban,
          swift: account.swift,
        }
      : profile,
    invoiceTotal: net,
    invoiceTotalWithVat: gross,
    invoiceDueDateQr: due
      ? `${due.getFullYear()}${pad(due.getMonth() + 1)}${pad(due.getDate())}`
      : "",
    sanitizedInvoiceNumber,
    showVat,
  });

  return (
    <InvoicePdfDocument
      invoice={invoice}
      profile={
        account
          ? { ...profile, bankAccount: account.accountNumber }
          : profile
      }
      selectedClient={selectedClient}
      normalizedItems={normalizedItems}
      invoiceNumberValue={invoiceNumberValue}
      invoiceIssueDate={dateOf(invoice.issueDate)}
      invoiceDueDate={due ? dateOf(due.toISOString()) : ""}
      invoiceDuzpDate={dateOf(invoice.duzp)}
      invoiceTotal={net}
      invoiceTotalWithVat={gross}
      totalVatAmount={vatAmount}
      showVat={showVat}
      qrCodeDataUrl={qrCodeDataUrl}
      showQuantity={usesQuantity(normalizedItems)}
      displayClientName={invoice.clientName ?? "—"}
      sanitizedInvoiceNumber={sanitizedInvoiceNumber}
      t={t}
      formatCurrency={formatCurrency}
      formatNumber={formatNumber}
    />
  );
};
