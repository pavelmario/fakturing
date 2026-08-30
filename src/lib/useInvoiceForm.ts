import { useMemo, useState } from "react";
import { formatDate, invoiceNet, invoiceVat, usesQuantity } from "./invoice";
import { emptyItem, type InvoiceItemForm } from "./invoiceItemForm";

export type InvoiceFormErrors = Partial<
  Record<"invoiceNumber" | "clientName" | "issueDate" | "paymentDays", string>
>;

export type InvoiceFormSeed = {
  clientName?: string;
  invoiceNumber?: string;
  issueDate?: string;
  paymentDays?: string;
  paymentMethod?: string;
  purchaseOrderNumber?: string;
  invoicingNote?: string;
  btcInvoice?: boolean;
  btcAddress?: string;
  items?: InvoiceItemForm[];
  bankAccountId?: string;
  clientId?: string;
  currency?: string;
  /** null = fall back to the profile default. */
  perUnit?: boolean | null;
};

export const todayIso = () => new Date().toISOString().slice(0, 10);

const seedState = (seed: InvoiceFormSeed) => ({
  clientName: seed.clientName ?? "",
  invoiceNumber: seed.invoiceNumber ?? "",
  issueDate: seed.issueDate ?? todayIso(),
  paymentDays: seed.paymentDays ?? "",
  paymentMethod: seed.paymentMethod ?? "",
  purchaseOrderNumber: seed.purchaseOrderNumber ?? "",
  invoicingNote: seed.invoicingNote ?? "",
  btcInvoice: seed.btcInvoice ?? false,
  btcAddress: seed.btcAddress ?? "",
  items: seed.items ?? [emptyItem()],
  bankAccountId: seed.bankAccountId ?? "",
  clientId: seed.clientId ?? "",
  currency: seed.currency ?? "",
  perUnitChoice: seed.perUnit ?? null,
});

export type InvoiceFormValues = ReturnType<typeof seedState>;

type Options = {
  isVatPayer: boolean;
  /** Profile-level default for billing per unit. */
  billPerUnitDefault: boolean;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/**
 * The invoice form, shared by the create and detail pages.
 *
 * These two used to be separate implementations of the same form — separate
 * item editors, separate VAT arithmetic, separate Trezor handling — which is
 * exactly how the totals drifted apart between the list, the detail page and
 * the PDF. One implementation now, so they cannot disagree.
 */
export const useInvoiceForm = (seed: InvoiceFormSeed, options: Options) => {
  const { isVatPayer, billPerUnitDefault, locale, t } = options;
  const [values, setValues] = useState<InvoiceFormValues>(() => seedState(seed));
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof InvoiceFormValues>(
    key: K,
    value: InvoiceFormValues[K],
  ) => {
    setDirty(true);
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key in errors) {
      setErrors((prev) => ({ ...prev, [key as string]: undefined }));
    }
  };

  /** Replace the whole form — used when hydrating from a stored invoice. */
  const reset = (next: InvoiceFormSeed) => {
    setValues(seedState(next));
    setErrors({});
    setDirty(false);
  };

  const perUnit = values.perUnitChoice ?? billPerUnitDefault;

  const setItem = (
    index: number,
    field: keyof InvoiceItemForm,
    value: string,
  ) => {
    setDirty(true);
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      ),
    }));
  };

  const normalizedItems = useMemo(
    () =>
      values.items
        .map((item) => ({
          /* Blank quantity means one; a fixed-price line stores no unit. */
          amount: !perUnit
            ? 1
            : item.amount.trim()
              ? Number.isFinite(Number(item.amount))
                ? Number(item.amount)
                : 0
              : 1,
          unit: perUnit ? item.unit.trim() : "",
          description: item.description.trim(),
          unitPrice: Number.isFinite(Number(item.unitPrice))
            ? Number(item.unitPrice)
            : 0,
          vat: Number.isFinite(Number(item.vat)) ? Number(item.vat) : 0,
        }))
        .filter(
          (item) =>
            item.description || item.unit || item.amount || item.unitPrice,
        ),
    [perUnit, values.items],
  );

  const net = invoiceNet(normalizedItems);
  const vat = isVatPayer ? invoiceVat(normalizedItems) : 0;
  const gross = net + vat;

  const dueDate = useMemo(() => {
    const issued = new Date(values.issueDate);
    const days = Number(values.paymentDays);
    if (Number.isNaN(issued.getTime()) || !Number.isFinite(days)) return null;
    const due = new Date(issued);
    due.setDate(due.getDate() + days);
    return due;
  }, [values.issueDate, values.paymentDays]);

  const dueDateLabel = dueDate ? formatDate(dueDate.toISOString(), locale) : null;

  /**
   * Validates the values as they will be saved.
   *
   * `candidate` exists because some fields are *derived* rather than typed —
   * the create page's invoice number and payment terms fall back to defaults
   * that live outside this state. Validating raw state there reported empty
   * fields the user could plainly see were filled.
   */
  const validate = (
    candidate: Partial<InvoiceFormValues> = {},
  ): InvoiceFormErrors => {
    const v = { ...values, ...candidate };
    const found: InvoiceFormErrors = {};
    if (!v.invoiceNumber.trim()) {
      found.invoiceNumber = t("alerts.invoiceNumberRequired");
    }
    if (!v.clientName.trim()) {
      found.clientName = t("alerts.invoiceClientRequired");
    }
    if (!v.issueDate.trim()) {
      found.issueDate = t("alerts.issueDateRequired");
    }
    const days = Number(v.paymentDays);
    if (!v.paymentDays.trim() || Number.isNaN(days) || days < 0) {
      found.paymentDays = t("alerts.paymentDaysInvalid");
    }
    setErrors(found);
    return found;
  };

  return {
    values,
    set,
    setItem,
    setValues,
    reset,
    errors,
    setErrors,
    dirty,
    setDirty,
    perUnit,
    setPerUnit: (next: boolean) => set("perUnitChoice", next),
    normalizedItems,
    net,
    vat,
    gross,
    dueDate,
    dueDateLabel,
    validate,
    usesQuantity: () => usesQuantity(normalizedItems),
  };
};

export type InvoiceForm = ReturnType<typeof useInvoiceForm>;
