import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  RotateCcw,
  Trash2,
  Wallet,
} from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { InvoiceComposer } from "./invoices/InvoiceComposer";
import { InvoiceSummary } from "./invoices/InvoiceSummary";
import { InvoicePdfPreview } from "./invoices/InvoicePdfPreview";
import { useInvoicePdfDocument } from "../lib/useInvoicePdfDocument";
import { PaymentDialog } from "./PaymentDialog";
import {
  daysUntilDue,
  formatDate,
  invoiceStatus,
  invoiceTotal,
  parseItems,
  usesQuantity,
  type InvoiceStatus,
} from "../lib/invoice";
import { buildInvoiceFileName } from "../lib/invoiceFileName";
import { useInvoiceForm } from "../lib/useInvoiceForm";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";
import type { BankAccountRow } from "../lib/bankAccounts";

const InvoiceId = Evolu.id("Invoice");

type InvoiceDetailPageProps = {
  invoiceId: string;
  onBack: () => void;
  onInvoiceDeleted: () => void;
  onDuplicate: (search: string) => void;
};

const toDateInput = (value: string | null | undefined) => {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
};

export function InvoiceDetailPage({
  invoiceId,
  onBack,
  onInvoiceDeleted,
  onDuplicate,
}: InvoiceDetailPageProps) {
  const { t, tp, locale } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const invoiceIdValue = useMemo(() => {
    const result = InvoiceId.from(invoiceId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Invoice">("invalid-invoice-id");
  }, [invoiceId]);

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
  const profile = useQuery(profileQuery)[0] ?? null;
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isDiscreteMode = profile?.discreteMode === Evolu.sqliteTrue;
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

  const invoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .selectAll()
          .where("id", "=", invoiceIdValue)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1),
      ),
    [evolu, invoiceIdValue, owner.id],
  );
  const invoice = useQuery(invoiceQuery)[0] ?? null;

  const [isEditing, setIsEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [payingOpen, setPayingOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const storedItems = useMemo(() => parseItems(invoice?.items), [invoice]);

  const selectedClientRecord =
    clients.find((client) => client.name === invoice?.clientName) ?? null;

  /* Hooks must run before the not-found early return, so this is built from a
     possibly-empty invoice and simply not rendered when there is none. */
  const pdfDocument = useInvoicePdfDocument(
    invoice ?? {},
    profile,
    selectedClientRecord,
    isVatPayer,
    bankAccountRows,
  );

  const form = useInvoiceForm(
    {
      clientName: invoice?.clientName ?? "",
      invoiceNumber: invoice?.invoiceNumber ?? "",
      issueDate: toDateInput(invoice?.issueDate),
      paymentDays:
        invoice?.paymentDays != null ? String(invoice.paymentDays) : "",
      paymentMethod: invoice?.paymentMethod ?? "bank",
      purchaseOrderNumber: invoice?.purchaseOrderNumber ?? "",
      invoicingNote: invoice?.invoicingNote ?? "",
      btcInvoice: invoice?.btcInvoice === Evolu.sqliteTrue,
      btcAddress: invoice?.btcAddress ?? "",
      bankAccountId: invoice?.bankAccountId ?? "",
      clientId: invoice?.clientId ?? "",
      currency: invoice?.currency ?? "",
      items: storedItems.map((item) => ({
        amount: item.amount != null ? String(item.amount) : "",
        unit: typeof item.unit === "string" ? item.unit : "",
        description:
          typeof item.description === "string" ? item.description : "",
        unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
        vat: item.vat != null ? String(item.vat) : "",
      })),
      perUnit: usesQuantity(storedItems),
    },
    { isVatPayer, billPerUnitDefault, locale, t },
  );

  /* Discrete mode hides amounts wherever the app states them. The document
     preview still shows them — you opened the invoice itself. */
  const invoiceCurrency = invoice?.currency ?? DEFAULT_CURRENCY;
  const money = (value: number) =>
    isDiscreteMode
      ? t("common.discreteMask")
      : formatMoney(value, locale, invoiceCurrency);
  const amount = (value: number) =>
    isDiscreteMode ? t("common.discreteMask") : formatAmount(value, locale);

  if (!invoice) {
    return (
      <div className="page-shell">
        <div className="page-container-lg">
          <div className="flex items-center justify-between mb-5">
            <h1 className="page-title">{t("invoiceDetail.title")}</h1>
            <button onClick={onBack} className="btn-secondary">
              <ArrowLeft />
              {t("common.backToList")}
            </button>
          </div>
          <div className="empty-state">{t("invoiceDetail.notFound")}</div>
        </div>
      </div>
    );
  }

  const status: InvoiceStatus = invoiceStatus(invoice);
  const isPaid = status === "paid";
  const storedTotal = invoiceTotal(storedItems, isVatPayer);
  const fileName = buildInvoiceFileName(profile?.invoiceNamingFormat, {
    number: invoice.invoiceNumber ?? "",
    client: invoice.clientName ?? "",
    supplier: profile?.name ?? "",
    issueDate: invoice.issueDate ? new Date(invoice.issueDate) : null,
  })

  const mempoolBase = (profile?.mempoolUrl ?? "").trim().replace(/\/+$/, "");
  const mempoolUrl =
    mempoolBase && invoice.btcAddress
      ? `${mempoolBase}/address/${invoice.btcAddress}`
      : "";

  /* The payment state is carried by the date line itself, in the same words
     the ledger uses — a separate "UHRAZENO" pill next to "Uhrazeno 28.01.2026"
     was saying it twice. */
  const daysLeft = daysUntilDue(invoice.issueDate, invoice.paymentDays);
  const paymentLine = isPaid ? (
    <span className="lstate" data-state="paid">
      {t("invoiceDetail.paidOn", {
        date: formatDate(invoice.paymentDate, locale),
      })}
    </span>
  ) : daysLeft === null ? null : daysLeft < 0 ? (
    <span className="lstate" data-state="overdue">
      {tp("invoicesList.overdueBy", Math.abs(daysLeft), {
        count: Math.abs(daysLeft),
      })}
    </span>
  ) : (
    <span className="lstate" data-state="unpaid">
      {t("invoiceCreate.dueOn", {
        date: formatDate(form.dueDate?.toISOString() ?? null, locale),
      })}
    </span>
  );

  const startEditing = async () => {
    /* Soft lock: a paid invoice has already gone to the client, so changing
       amounts or dates is a decision, not a typo fix. */
    if (isPaid && !(await confirmDialog({
      title: t("invoiceDetail.editPaidConfirm"),
      confirmLabel: t("common.edit"),
    }))) {
      return;
    }
    setNoteOpen(Boolean(invoice.invoicingNote));
    setIsEditing(true);
  };

  const cancelEditing = async () => {
    if (form.dirty && !(await confirmDialog({
      title: t("invoiceDetail.discardConfirm"),
      confirmLabel: t("invoiceDetail.cancelEdits"),
      tone: "danger",
    }))) {
      return;
    }
    form.reset({
      clientName: invoice.clientName ?? "",
      invoiceNumber: invoice.invoiceNumber ?? "",
      issueDate: toDateInput(invoice.issueDate),
      paymentDays:
        invoice.paymentDays != null ? String(invoice.paymentDays) : "",
      paymentMethod: invoice.paymentMethod ?? "bank",
      purchaseOrderNumber: invoice.purchaseOrderNumber ?? "",
      invoicingNote: invoice.invoicingNote ?? "",
      btcInvoice: invoice.btcInvoice === Evolu.sqliteTrue,
      btcAddress: invoice.btcAddress ?? "",
      bankAccountId: invoice.bankAccountId ?? "",
      clientId: invoice.clientId ?? "",
      currency: invoice.currency ?? "",
      items: storedItems.map((item) => ({
        amount: item.amount != null ? String(item.amount) : "",
        unit: typeof item.unit === "string" ? item.unit : "",
        description:
          typeof item.description === "string" ? item.description : "",
        unitPrice: item.unitPrice != null ? String(item.unitPrice) : "",
        vat: item.vat != null ? String(item.vat) : "",
      })),
      perUnit: usesQuantity(storedItems),
    });
    setIsEditing(false);
  };

  const leave = async () => {
    if (isEditing && form.dirty && !(await confirmDialog({
      title: t("invoiceDetail.discardConfirm"),
      confirmLabel: t("invoiceDetail.cancelEdits"),
      tone: "danger",
    }))) {
      return;
    }
    onBack();
  };

  const handleSave = async () => {
    const found = form.validate();
    if (Object.keys(found).length > 0) return;

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(
      new Date(form.values.issueDate),
    );
    if (!issueDateResult.ok) {
      form.setErrors({ issueDate: t("alerts.issueDateInvalid") });
      return;
    }
    const paymentDaysResult = Evolu.NonNegativeNumber.from(
      Number(form.values.paymentDays),
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
      const result = evolu.update("invoice", {
        id: invoice.id,
        invoiceNumber: form.values.invoiceNumber.trim(),
        clientName: form.values.clientName.trim(),
        issueDate: issueDateResult.value,
        duzp: isVatPayer ? issueDateResult.value : null,
        paymentDays: paymentDaysResult.value,
        paymentMethod: form.values.paymentMethod,
        purchaseOrderNumber: form.values.purchaseOrderNumber.trim() || null,
        invoicingNote: form.values.invoicingNote.trim() || null,
        btcInvoice: form.values.btcInvoice
          ? Evolu.sqliteTrue
          : Evolu.sqliteFalse,
        btcAddress: form.values.btcAddress.trim() || null,
        bankAccountId: form.values.bankAccountId || null,
        clientId: form.values.clientId || null,
        currency: form.values.currency || DEFAULT_CURRENCY,
        items: itemsResult.value,
      });
      if (!result.ok) {
        console.error("Update error:", formatTypeError(result.error));
        notify(t("alerts.invoiceSaveValidation"), "error");
        return;
      }
      form.setDirty(false);
      setIsEditing(false);
      setFlash(t("alerts.invoiceUpdateSaved"));
      window.setTimeout(() => setFlash(null), 3000);
    } catch (error) {
      console.error("Error updating invoice:", error);
      notify(t("alerts.invoiceSaveFailed"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmPayment = (date: string) => {
    const parsed = Evolu.dateToDateIso(new Date(`${date}T12:00:00`));
    if (!parsed.ok) {
      notify(t("invoicesList.alertPaymentDateError"), "error");
      return;
    }
    const result = evolu.update("invoice", {
      id: invoice.id,
      paymentDate: parsed.value,
    });
    if (!result.ok) {
      notify(t("invoicesList.alertPaymentUpdateError"), "error");
      return;
    }
    setPayingOpen(false);
  };

  const undoPayment = () => {
    const result = evolu.update("invoice", {
      id: invoice.id,
      paymentDate: null,
    });
    if (!result.ok) notify(t("alerts.paymentCancelFailed"), "error");
  };

  /* Duplicating opens a prefilled new invoice to confirm, rather than silently
     writing a second document to the ledger. */
  const duplicate = () => {
    const search = new URLSearchParams({
      clientName: invoice.clientName ?? "",
      paymentDays: String(invoice.paymentDays ?? 14),
      paymentMethod: invoice.paymentMethod ?? "bank",
      items: JSON.stringify(storedItems),
    });
    if (invoice.invoicingNote) {
      search.set("invoicingNote", invoice.invoicingNote);
    }
    if (invoice.btcInvoice === Evolu.sqliteTrue) search.set("btcInvoice", "1");
    onDuplicate(search.toString());
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: t("alerts.invoiceDeleteConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setIsDeleting(true);
    const result = evolu.update("invoice", {
      id: invoice.id,
      deleted: Evolu.sqliteTrue,
    });
    setIsDeleting(false);
    if (!result.ok) {
      notify(t("alerts.invoiceDeleteFailed"), "error");
      return;
    }
    onInvoiceDeleted();
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <button onClick={leave} className="btn-ghost mb-3">
          <ArrowLeft />
          {t("common.backToList")}
        </button>

        {/* ---- Identity and status, always visible ------------------- */}
        <div className="inv-head">
          <div className="inv-ident">
            <div className="inv-number mono">{invoice.invoiceNumber}</div>
            <div className="inv-client">{invoice.clientName}</div>
            <div className="inv-dates">
              {t("invoiceDetail.issuedOn", {
                date: formatDate(invoice.issueDate, locale),
              })}
              {" · "}
              {paymentLine}
            </div>
          </div>

          <div className="inv-money">
            <div className="inv-total num">{money(storedTotal)}</div>
          </div>
        </div>

        {/* Payment is its own control, not an option buried in the edit form
            next to Delete. */}
        <div className="inv-actions">
          <PDFDownloadLink
            document={pdfDocument}
            fileName={fileName}
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
          {isPaid ? (
            <button className="btn-secondary" onClick={undoPayment}>
              <RotateCcw />
              {t("invoicesList.markUnpaid")}
            </button>
          ) : (
            <button className="btn-paid" onClick={() => setPayingOpen(true)}>
              <Wallet />
              {t("invoicesList.markPaid")}
            </button>
          )}
          {!isEditing ? (
            <button className="btn-secondary" onClick={startEditing}>
              <Pencil />
              {t("common.edit")}
            </button>
          ) : null}
          <button className="btn-secondary" onClick={duplicate}>
            <Copy />
            {t("invoiceDetail.duplicate")}
          </button>
          {mempoolUrl ? (
            <a
              href={mempoolUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <ExternalLink />
              {t("invoiceDetail.mempoolCheck")}
            </a>
          ) : null}
          <button
            className="btn-danger ml-auto"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 />
            {isDeleting ? t("invoiceDetail.deleting") : t("common.delete")}
          </button>
        </div>

        {flash ? <div className="alert-success mb-3">{flash}</div> : null}

        {isEditing ? (
          <>
            <div className="editing-bar">
              <span>{t("invoiceDetail.editingBanner")}</span>
              <div className="editing-bar-actions">
                <button className="btn-ghost" onClick={cancelEditing}>
                  {t("invoiceDetail.cancelEdits")}
                </button>
                <button
                  className="btn-primary"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? t("common.saving") : t("common.save")}
                </button>
              </div>
            </div>
            <InvoiceComposer
              form={form}
              clients={clients}
              bankAccounts={bankAccounts}
              isVatPayer={isVatPayer}
              isPoRequired={isPoRequired}
              lineDefaults={{ unit: "", vat: isVatPayer ? "21" : "" }}
              formatAmount={amount}
              noteOpen={noteOpen}
              onNoteOpenChange={setNoteOpen}
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
                    className="btn-primary w-full mt-3"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              }
            />
          </>
        ) : (
          <div className="saved">
            <InvoicePdfPreview document={pdfDocument} title={fileName} />
          </div>
        )}
      </div>

      {payingOpen ? (
        <PaymentDialog
          invoiceNumber={invoice.invoiceNumber ?? ""}
          clientName={invoice.clientName ?? ""}
          amount={money(storedTotal)}
          onConfirm={confirmPayment}
          onCancel={() => setPayingOpen(false)}
        />
      ) : null}
    </div>
  );
}
