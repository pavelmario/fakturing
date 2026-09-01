import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ArrowDownToLine, Download, X } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { InvoiceComposer } from "./invoices/InvoiceComposer";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import { InvoicePdfPreview } from "./invoices/InvoicePdfPreview";
import { useInvoicePdfDocument } from "../lib/useInvoicePdfDocument";
import { buildInvoiceFileName } from "../lib/invoiceFileName";
import { formatInvoiceNumber, nextSequence } from "../lib/invoiceNumber";
import { emptyItem, type InvoiceItemForm } from "../lib/invoiceItemForm";
import { formatDate, parseItems, usesQuantity } from "../lib/invoice";
import { useInvoiceForm, todayIso } from "../lib/useInvoiceForm";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";
import type { BankAccountRow } from "../lib/bankAccounts";

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDays: number | null;
  paymentMethod: string | null;
  invoicingNote: string | null;
  btcInvoice: number | null;
  items: unknown;
};

type InvoiceCreatePageProps = {
  onInvoiceCreated: () => void;
};

const parseBooleanParam = (value: string | null): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
};

const parseItemsParam = (value: string | null): InvoiceItemForm[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        amount: item.amount === 0 || item.amount ? String(item.amount) : "",
        unit: typeof item.unit === "string" ? item.unit : "",
        description:
          typeof item.description === "string" ? item.description : "",
        unitPrice:
          item.unitPrice === 0 || item.unitPrice ? String(item.unitPrice) : "",
        vat: item.vat === 0 || item.vat ? String(item.vat) : "",
      }))
      .filter(
        (item) =>
          item.description ||
          item.unit ||
          item.amount ||
          item.unitPrice ||
          item.vat,
      );
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

/** Most frequent value, used to inherit the unit you actually type. */
const mode = (values: string[]): string => {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
};

export function InvoiceCreatePage({
  onInvoiceCreated,
}: InvoiceCreatePageProps) {
  const { t, locale } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const params =
    typeof window === "undefined"
      ? new URLSearchParams("")
      : new URLSearchParams(window.location.search);
  const param = (key: string) => params.get(key);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isPoRequired = profile?.poRequired === Evolu.sqliteTrue;
  const billPerUnitDefault = profile?.billPerUnit === Evolu.sqliteTrue;

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );
  const clients = useQuery(clientsQuery);

  const bankAccountsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("bankAccount")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("label", "asc"),
      ),
    [evolu, owner.id],
  );
  const bankAccountRows = useQuery(bankAccountsQuery) as readonly BankAccountRow[];
  const bankAccounts = bankAccountRows.map((account) => ({
    id: account.id,
    label: account.label ?? "",
    currency: account.currency ?? "",
    isDefault: account.isDefault === Evolu.sqliteTrue,
  }));

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select([
            "id",
            "invoiceNumber",
            "clientName",
            "issueDate",
            "paymentDays",
            "paymentMethod",
            "invoicingNote",
            "btcInvoice",
            "items",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc"),
      ),
    [evolu, owner.id],
  );
  const invoices = useQuery(invoicesQuery) as readonly InvoiceRow[];
  const lastInvoice = invoices[0] ?? null;

  /* Defaults inherited from the last invoice, so the fields that never change
     are not retyped. */
  const defaults = useMemo(() => {
    const lastItems = parseItems(lastInvoice?.items);
    return {
      paymentDays:
        lastInvoice?.paymentDays != null
          ? String(lastInvoice.paymentDays)
          : "14",
      paymentMethod: lastInvoice?.paymentMethod ?? "bank",
      unit: mode(lastItems.map((item) => String(item.unit ?? ""))),
      vat: isVatPayer
        ? String(lastItems.find((item) => Number(item.vat) > 0)?.vat ?? 21)
        : "",
    };
  }, [isVatPayer, lastInvoice]);

  const [noteOpen, setNoteOpen] = useState(Boolean(param("invoicingNote")));
  const [takenFrom, setTakenFrom] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<Record<string, unknown> | null>(null);

  const form = useInvoiceForm(
    {
      clientName: param("clientName") ?? param("client") ?? "",
      clientId: param("clientId") ?? "",
      currency: param("currency") ?? "",
      bankAccountId: param("bankAccountId") ?? "",
      invoiceNumber: param("invoiceNumber") ?? param("number") ?? "",
      issueDate: param("issueDate") ?? param("date") ?? todayIso(),
      paymentDays: param("paymentDays") ?? "",
      paymentMethod: (() => {
        const raw = (
          param("paymentMethod") ??
          param("payment") ??
          ""
        ).toLowerCase();
        return raw === "cash" || raw === "bank" ? raw : "";
      })(),
      purchaseOrderNumber: param("purchaseOrderNumber") ?? param("po") ?? "",
      invoicingNote: param("invoicingNote") ?? "",
      btcInvoice:
        parseBooleanParam(param("btcInvoice") ?? param("bitcoin")) ?? false,
      btcAddress: param("btcAddress") ?? "",
      items: parseItemsParam(param("items")) ?? undefined,
      perUnit: param("items")
        ? usesQuantity(parseItemsParam(param("items")) ?? [])
        : null,
    },
    {
      isVatPayer,
      billPerUnitDefault,
      locale,
      t,
      /* Handed to the hook rather than overlaid on the composer, so the
         terms and the first line's rate are what actually gets saved. */
      derived: {
        paymentDays: defaults.paymentDays,
        paymentMethod: defaults.paymentMethod,
        unit: defaults.unit,
        vat: defaults.vat,
      },
    },
  );

  const clientLastInvoice = useMemo(
    () =>
      form.values.clientName
        ? (invoices.find((row) => row.clientName === form.values.clientName) ??
          null)
        : null,
    [form.values.clientName, invoices],
  );

  /* The pattern from Settings decides the shape; the sequence continues from
     the highest existing number sharing that pattern's prefix. */
  const nextNumber = useMemo(() => {
    const pattern = profile?.invoiceNumberFormat;
    const issued = new Date(form.values.issueDate || Date.now());
    const date = Number.isNaN(issued.getTime()) ? new Date() : issued;
    return formatInvoiceNumber(
      pattern,
      nextSequence(
        pattern,
        invoices.map((row) => row.invoiceNumber),
        date,
      ),
      date,
    );
  }, [form.values.issueDate, invoices, profile?.invoiceNumberFormat]);

  /* Defaults to the account marked default, so a single-account setup never
     has to think about it. */
  const bankAccountId =
    form.values.bankAccountId ||
    bankAccounts.find((account) => account.isDefault)?.id ||
    bankAccounts[0]?.id ||
    "";

  /* Follows the chosen account's currency unless explicitly set. */
  const currency =
    form.values.currency ||
    bankAccounts.find((account) => account.id === bankAccountId)?.currency ||
    DEFAULT_CURRENCY;

  const invoiceNumber = form.values.invoiceNumber || nextNumber;
  const isDuplicateNumber = Boolean(
    invoiceNumber.trim() &&
      invoices.some((row) => row.invoiceNumber === invoiceNumber.trim()),
  );

  const money = (value: number) => formatMoney(value, locale, currency);
  const amount = (value: number) => formatAmount(value, locale);

  /**
   * Reuses the previous invoice as a template: its lines and the terms that go
   * with them. Number and issue date are not copied (new document → next
   * number, today), nor the purchase order number, which belongs to one
   * specific order, nor the bitcoin address — reusing a receive address is
   * what the Trezor "next unused address" flow exists to avoid.
   */
  const useAsTemplate = () => {
    if (!clientLastInvoice) return;
    const previous = parseItems(clientLastInvoice.items);
    form.setValues((prev) => ({
      ...prev,
      paymentDays:
        clientLastInvoice.paymentDays != null
          ? String(clientLastInvoice.paymentDays)
          : prev.paymentDays,
      paymentMethod: clientLastInvoice.paymentMethod ?? prev.paymentMethod,
      invoicingNote: clientLastInvoice.invoicingNote ?? "",
      btcInvoice: clientLastInvoice.btcInvoice === Evolu.sqliteTrue,
      perUnitChoice: usesQuantity(previous),
      items:
        previous.length > 0
          ? previous.map((item) => ({
              amount: item.amount != null ? String(item.amount) : "",
              unit: typeof item.unit === "string" ? item.unit : "",
              description:
                typeof item.description === "string" ? item.description : "",
              unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
              vat: item.vat != null ? String(item.vat) : "",
            }))
          : prev.items,
    }));
    if (clientLastInvoice.invoicingNote) setNoteOpen(true);
    setTakenFrom(clientLastInvoice.invoiceNumber ?? null);
  };

  const startAnother = () => {
    setSaved(null);
    setNoteOpen(false);
    setTakenFrom(null);
    form.reset({ issueDate: todayIso() });
  };

  const selectedClientRecord =
    (form.effective.clientId
      ? clients.find((client) => client.id === form.effective.clientId)
      : null) ??
    clients.find((client) => client.name === form.effective.clientName) ??
    null;

  /* Honour the filename template — the create flow used to hardcode this and
     silently ignore the preference. */
  const savedFileName = buildInvoiceFileName(profile?.invoiceNamingFormat, {
    number: String(saved?.invoiceNumber ?? ""),
    client: String(saved?.clientName ?? ""),
    supplier: profile?.name ?? "",
    issueDate: saved?.issueDate ? new Date(String(saved.issueDate)) : null,
  });
  const savedDocument = useInvoicePdfDocument(
    saved ?? {},
    profile ?? null,
    selectedClientRecord,
    isVatPayer,
    bankAccountRows,
  );

  const handleSave = async () => {
    /* Validate the values that will actually be written — the number and the
       terms may still be derived defaults rather than typed state. */
    const found = form.validate({
      invoiceNumber,
      paymentDays: form.effective.paymentDays,
      paymentMethod: form.effective.paymentMethod,
      clientName: form.effective.clientName,
      issueDate: form.effective.issueDate,
    });
    if (Object.keys(found).length > 0) return;
    if (
      isDuplicateNumber &&
      !(await confirmDialog({
        title: t("alerts.duplicateInvoiceConfirm"),
        confirmLabel: t("invoiceCreate.save"),
      }))
    ) {
      return;
    }

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(new Date(form.effective.issueDate));
    if (!issueDateResult.ok) {
      form.setErrors({ issueDate: t("alerts.issueDateInvalid") });
      return;
    }
    const paymentDaysResult = Evolu.NonNegativeNumber.from(
      Number(form.effective.paymentDays),
    );
    if (!paymentDaysResult.ok) {
      form.setErrors({ paymentDays: t("alerts.paymentDaysInvalid") });
      return;
    }

    setIsSaving(true);
    try {
      const itemsResult = Evolu.Json.from(JSON.stringify(form.normalizedItems));
      if (!itemsResult.ok) {
        console.error("Items error:", formatTypeError(itemsResult.error));
        notify(t("alerts.invoiceItemsInvalid"), "error");
        return;
      }

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        clientName: form.effective.clientName.trim(),
        issueDate: issueDateResult.value,
        duzp: isVatPayer ? issueDateResult.value : null,
        paymentDays: paymentDaysResult.value,
        paymentMethod: form.effective.paymentMethod,
        purchaseOrderNumber: form.effective.purchaseOrderNumber.trim() || null,
        invoicingNote: form.effective.invoicingNote.trim() || null,
        btcInvoice: form.effective.btcInvoice
          ? Evolu.sqliteTrue
          : Evolu.sqliteFalse,
        btcAddress: form.effective.btcAddress.trim() || null,
        bankAccountId: bankAccountId || null,
        clientId: form.effective.clientId || null,
        currency: currency,
        items: itemsResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, {
        onlyValidate: true,
      });
      if (!validation.ok) {
        console.error("Validation error:", formatTypeError(validation.error));
        notify(t("alerts.invoiceSaveValidation"), "error");
        return;
      }
      const result = evolu.insert("invoice", payload);
      if (!result.ok) {
        console.error("Insert error:", formatTypeError(result.error));
        notify(t("alerts.invoiceSaveValidation"), "error");
        return;
      }
      setSaved({ ...payload, items: form.normalizedItems });
    } catch (error) {
      console.error("Error saving invoice:", error);
      notify(t("alerts.invoiceSaveFailed"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-head">
          <h1 className="page-title">{t("invoiceCreate.title")}</h1>
        </div>

        {saved ? (
          <div className="saved">
            <div className="saved-head">
              <div>
                <div className="stat-label">{t("invoiceCreate.savedTitle")}</div>
                <div className="saved-number mono">
                  {String(saved.invoiceNumber ?? "")}
                </div>
                <div className="settings-help-text">
                  {String(saved.clientName ?? "")}
                </div>
              </div>
              <div className="saved-actions">
                <PDFDownloadLink
                  document={savedDocument}
                  fileName={savedFileName}
                  className="btn-primary"
                >
                  {({ loading }) => (
                    <>
                      <Download />
                      {loading
                        ? t("invoiceDetail.pdfPreparing")
                        : t("invoiceDetail.pdfExport")}
                    </>
                  )}
                </PDFDownloadLink>
                <button className="btn-secondary" onClick={startAnother}>
                  {t("invoiceCreate.saveAnother")}
                </button>
                <button className="btn-secondary" onClick={onInvoiceCreated}>
                  {t("common.backToList")}
                </button>
              </div>
            </div>
            <InvoicePdfPreview
              document={savedDocument}
              title={savedFileName}
            />
          </div>
        ) : (
          <InvoiceComposer
            /* The number and the account are still worked out here — they
               depend on the whole ledger, not on this form. */
            form={{
              ...form,
              effective: {
                ...form.effective,
                invoiceNumber,
                bankAccountId,
                currency,
              },
            }}
            clients={clients}
            bankAccounts={bankAccounts}
            isVatPayer={isVatPayer}
            isPoRequired={isPoRequired}
            lineDefaults={{ unit: defaults.unit, vat: defaults.vat }}
            duplicateNumber={isDuplicateNumber}
            formatAmount={amount}
            noteOpen={noteOpen}
            onNoteOpenChange={setNoteOpen}
            clientSlot={
              clientLastInvoice && !takenFrom ? (
                <div className="suggest">
                  <span>
                    {t("invoiceCreate.lastInvoiceHint", {
                      number: clientLastInvoice.invoiceNumber ?? "",
                      date: formatDate(clientLastInvoice.issueDate, locale),
                    })}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={useAsTemplate}
                  >
                    <ArrowDownToLine />
                    {t("invoiceCreate.takeItems")}
                  </button>
                </div>
              ) : takenFrom ? (
                <div className="suggest" data-taken="true">
                  <span>
                    {t("invoiceCreate.takenFrom", { number: takenFrom })}
                  </span>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      form.set("items", [emptyItem()]);
                      setTakenFrom(null);
                    }}
                  >
                    <X />
                    {t("invoiceCreate.takenClear")}
                  </button>
                </div>
              ) : null
            }
            sidebarFooter={
              <div className="compose-panel compose-sticky">
                <InvoiceSummary
                  net={form.net}
                  vat={form.vat}
                  gross={form.gross}
                  isVatPayer={isVatPayer}
                  formatMoney={money}
                />
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="btn-primary w-full mt-3"
                >
                  {isSaving
                    ? t("invoiceCreate.saving")
                    : t("invoiceCreate.save")}
                </button>
              </div>
            }
          />
        )}
      </div>
    </div>
  );
}
