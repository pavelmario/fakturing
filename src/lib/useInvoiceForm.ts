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

/**
 * Values a page works out rather than the user typing them: the terms carried
 * over from the last invoice, the unit and rate normally used. They are
 * applied here, inside the hook, so that what the composer shows, what the
 * summary totals and what is saved are the same numbers — the create page
 * used to overlay them on the composer only, and quietly saved an invoice
 * with no VAT on it while the table displayed 21 %.
 */
export type InvoiceFormDerived = {
  paymentDays?: string;
  paymentMethod?: string;
  /** Applied to the first line while it is still untouched. */
  unit?: string;
  vat?: string;
};

type Options = {
  isVatPayer: boolean;
  /** Profile-level default for billing per unit. */
  billPerUnitDefault: boolean;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  derived?: InvoiceFormDerived;
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
  const { isVatPayer, billPerUnitDefault, locale, t, derived } = options;
  const [values, setValues] = useState<InvoiceFormValues>(() => seedState(seed));
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [dirty, setDirty] = useState(false);
  /* Derived line defaults are a seed, not a standing rule: once the user has
     edited the lines, state is the truth — otherwise clearing a rate would
     just spring back to the default and the field could never be emptied. */
  const [itemsTouched, setItemsTouched] = useState(false);

  const set = <K extends keyof InvoiceFormValues>(
    key: K,
    value: InvoiceFormValues[K],
  ) => {
    setDirty(true);
    if (key === "items") setItemsTouched(true);
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
    setItemsTouched(false);
  };

  const perUnit = values.perUnitChoice ?? billPerUnitDefault;

  const setItem = (
    index: number,
    field: keyof InvoiceItemForm,
    value: string,
  ) => {
    setDirty(true);
    setItemsTouched(true);
    setValues((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        /* Write the seeded unit and rate into state as the row is first
           touched, so what was on screen is what gets saved — and is then
           ordinary editable state, clearable like any other field. */
        const seeded = derived
          ? {
              ...item,
              unit: item.unit || derived.unit || "",
              vat: item.vat || derived.vat || "",
            }
          : item;
        return { ...seeded, [field]: value };
      }),
    }));
  };

  /**
   * Until the lines are edited, they show the unit and rate you normally use.
   * These are real values, not decoration: the summary totals them and they
   * are what gets saved. Previously they were painted on the table only, so a
   * VAT payer saw 21 %, a summary reading "DPH 0 Kč", and an invoice with no
   * VAT on it — and the 21 vanished the moment you typed a description.
   */
  const effectiveItems = useMemo(() => {
    if (itemsTouched || !derived || (!derived.unit && !derived.vat)) {
      return values.items;
    }
    return values.items.map((item) => ({
      ...item,
      unit: item.unit || derived.unit || "",
      vat: item.vat || derived.vat || "",
    }));
  }, [derived, itemsTouched, values.items]);

  /** Values as they will be saved: what was typed, over what was derived. */
  const effective: InvoiceFormValues = useMemo(
    () => ({
      ...values,
      paymentDays: values.paymentDays || derived?.paymentDays || "",
      paymentMethod: values.paymentMethod || derived?.paymentMethod || "",
      items: effectiveItems,
    }),
    [derived, effectiveItems, values],
  );

  const normalizedItems = useMemo(
    () =>
      effective.items
        /* Drop lines the user added and left blank — tested on what was
           typed, because the mapping below defaults a blank quantity to 1
           and would make every empty row look filled in. */
        .filter(
          (item) =>
            item.description.trim() ||
            item.unit.trim() ||
            item.amount.trim() ||
            item.unitPrice.trim(),
        )
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
        })),
    [effective.items, perUnit],
  );

  const net = invoiceNet(normalizedItems);
  const vat = isVatPayer ? invoiceVat(normalizedItems) : 0;
  const gross = net + vat;

  const dueDate = useMemo(() => {
    const issued = new Date(effective.issueDate);
    /* Blank is not zero days: Number("") is 0, which printed today's date as
       the due date under a field showing 14-day terms. */
    if (!effective.paymentDays.trim()) return null;
    const days = Number(effective.paymentDays);
    if (Number.isNaN(issued.getTime()) || !Number.isFinite(days)) return null;
    const due = new Date(issued);
    due.setDate(due.getDate() + days);
    return due;
  }, [effective.issueDate, effective.paymentDays]);

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
    const v = { ...effective, ...candidate };
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
    effective,
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
