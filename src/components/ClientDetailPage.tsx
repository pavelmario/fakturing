import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ArrowLeft, Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { ClientForm } from "./clients/ClientForm";
import type { ClientFormValues } from "../lib/clientForm";
import { LedgerTable, type LedgerRow } from "./invoices/LedgerTable";
import {
  daysUntilDue,
  invoiceStatus,
  invoiceTotal,
  parseItems,
} from "../lib/invoice";
import { DEFAULT_CURRENCY, formatAmount, formatMoney } from "../lib/money";

const ClientId = Evolu.id("Client");

type ClientDetailPageProps = {
  clientId: string;
  onBack: () => void;
  onClientDeleted: () => void;
  onViewInvoice: (invoiceId: string) => void;
  onCreateInvoice: (search: string) => void;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientId: string | null;
  currency: string | null;
  issueDate: string | null;
  paymentDate: string | null;
  paymentDays: number | null;
  btcInvoice: number | null;
  items: unknown;
};

export function ClientDetailPage({
  clientId,
  onBack,
  onClientDeleted,
  onViewInvoice,
  onCreateInvoice,
}: ClientDetailPageProps) {
  const { t, tp, locale } = useI18n();
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const clientIdValue = useMemo(() => {
    const result = ClientId.from(clientId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Client">("invalid-client-id");
  }, [clientId]);

  const clientQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .selectAll()
          .where("id", "=", clientIdValue)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1),
      ),
    [clientIdValue, evolu, owner.id],
  );
  const client = useQuery(clientQuery)[0] ?? null;

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer", "discreteMode"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isDiscreteMode = profile?.discreteMode === Evolu.sqliteTrue;

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select([
            "id",
            "invoiceNumber",
            "clientName",
            "clientId",
            "currency",
            "issueDate",
            "paymentDate",
            "paymentDays",
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
  const allInvoices = useQuery(invoicesQuery) as readonly InvoiceRow[];

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<ClientFormValues | null>(null);
  const [nameError, setNameError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatMoneyIn = (value: number, code: string) =>
    isDiscreteMode
      ? t("common.discreteMask")
      : formatMoney(value, locale, code);

  const money = (value: number) =>
    isDiscreteMode
      ? t("common.discreteMask")
      : formatMoney(value, locale, DEFAULT_CURRENCY);
  const amount = (value: number) =>
    isDiscreteMode ? t("common.discreteMask") : formatAmount(value, locale);

  /* Their invoices, shown with the same ledger the invoice list uses.
     Narrowed to a plain string first — reading through the optional record
     inside the callback defeats the compiler's memoization. */
  const clientName = client?.name ?? "";

  const rows = useMemo<LedgerRow[]>(() => {
    if (!clientName) return [];
    return allInvoices
      /* Match by id where the invoice has one, so a renamed client keeps its
         history; older invoices still match on the stored name. */
      .filter((invoice) =>
        invoice.clientId ? invoice.clientId === client?.id : invoice.clientName === clientName,
      )
      .map((invoice) => {
        const issued = invoice.issueDate ? new Date(invoice.issueDate) : null;
        const valid = issued !== null && !Number.isNaN(issued.getTime());
        return {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          clientName: invoice.clientName,
          issueDate: invoice.issueDate,
          paymentDate: invoice.paymentDate,
          status: invoiceStatus(invoice),
          total: invoiceTotal(parseItems(invoice.items), isVatPayer),
          dueTime:
            valid && issued
              ? new Date(issued).setDate(
                  issued.getDate() + Number(invoice.paymentDays ?? 0),
                )
              : 0,
          daysToDue: daysUntilDue(invoice.issueDate, invoice.paymentDays),
          isBtc: invoice.btcInvoice === Evolu.sqliteTrue,
          currency: invoice.currency || DEFAULT_CURRENCY,
        };
      });
  }, [allInvoices, client?.id, clientName, isVatPayer]);

  /* Per currency — never summed across them. */
  const stats = useMemo(() => {
    const invoiced = new Map<string, number>();
    const unpaid = new Map<string, number>();
    for (const row of rows) {
      invoiced.set(row.currency, (invoiced.get(row.currency) ?? 0) + row.total);
      if (row.status !== "paid") {
        unpaid.set(row.currency, (unpaid.get(row.currency) ?? 0) + row.total);
      }
    }
    return { invoiced, unpaid, count: rows.length };
  }, [rows]);

  if (!client) {
    return (
      <div className="page-shell">
        <div className="page-container-lg">
          <div className="flex items-center justify-between mb-5">
            <h1 className="page-title">{t("clientDetail.title")}</h1>
            <button onClick={onBack} className="btn-secondary">
              <ArrowLeft />
              {t("common.backToList")}
            </button>
          </div>
          <div className="empty-state">{t("clientDetail.notFound")}</div>
        </div>
      </div>
    );
  }

  const toForm = (): ClientFormValues => ({
    name: client.name ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: client.addressLine2 ?? "",
    companyIdentificationNumber: client.companyIdentificationNumber ?? "",
    vatNumber: client.vatNumber ?? "",
    note: client.note ?? "",
  });

  const values = draft ?? toForm();

  const startEditing = () => {
    setDraft(toForm());
    setNameError(undefined);
    setIsEditing(true);
  };

  const cancelEditing = async () => {
    if (draft && JSON.stringify(draft) !== JSON.stringify(toForm())) {
      const ok = await confirmDialog({
        title: t("invoiceDetail.discardConfirm"),
        confirmLabel: t("invoiceDetail.cancelEdits"),
        tone: "danger",
      });
      if (!ok) return;
    }
    setDraft(null);
    setIsEditing(false);
  };

  const handleSave = () => {
    if (!values.name.trim()) {
      setNameError(t("alerts.clientNameRequired"));
      return;
    }
    setIsSaving(true);
    const toNull = (value: string) => value.trim() || null;
    const result = evolu.update("client", {
      id: client.id,
      name: values.name.trim(),
      email: toNull(values.email),
      phone: toNull(values.phone),
      addressLine1: toNull(values.addressLine1),
      addressLine2: toNull(values.addressLine2),
      companyIdentificationNumber: toNull(values.companyIdentificationNumber),
      vatNumber: toNull(values.vatNumber),
      note: toNull(values.note),
    });
    setIsSaving(false);
    if (!result.ok) {
      notify(t("alerts.clientSaveValidation"), "error");
      return;
    }
    setDraft(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: t("clientDetail.deleteConfirm"),
      confirmLabel: t("common.delete"),
      tone: "danger",
    });
    if (!ok) return;
    setIsDeleting(true);
    const result = evolu.update("client", {
      id: client.id,
      deleted: Evolu.sqliteTrue,
    });
    setIsDeleting(false);
    if (!result.ok) {
      notify(t("alerts.clientDeleteFailed"), "error");
      return;
    }
    onClientDeleted();
  };

  const address = [client.addressLine1, client.addressLine2]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <button onClick={onBack} className="btn-ghost mb-3">
          <ArrowLeft />
          {t("common.backToList")}
        </button>

        <div className="inv-head">
          <div className="inv-ident">
            <div className="client-title">{client.name}</div>
            <div className="inv-dates">
              {address || t("common.placeholderDash")}
            </div>
            <div className="client-ids mono">
              {client.companyIdentificationNumber
                ? `${t("clientsForm.companyIdLabel")} ${client.companyIdentificationNumber}`
                : null}
              {client.vatNumber
                ? `${client.companyIdentificationNumber ? " · " : ""}${t("clientsForm.vatLabel")} ${client.vatNumber}`
                : null}
            </div>
            {client.email || client.phone ? (
              <div className="client-contact">
                {client.email ? (
                  <a href={`mailto:${client.email}`}>
                    <Mail />
                    {client.email}
                  </a>
                ) : null}
                {client.phone ? (
                  <a href={`tel:${client.phone}`}>
                    <Phone />
                    {client.phone}
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="inv-money">
            <div className="stat-label">{t("clientDetail.invoicedTotal")}</div>
            {[...stats.invoiced.entries()].sort().map(([code, value]) => (
              <div key={code} className="inv-total num">
                {formatMoneyIn(value, code)}
              </div>
            ))}
            {stats.invoiced.size === 0 ? (
              <div className="inv-total num">{money(0)}</div>
            ) : null}
            <div className="settings-help-text">
              <span className="num">{stats.count}</span>{" "}
              {tp("invoicesList.invoiceCount", stats.count)}
              {[...stats.unpaid.entries()].sort().map(([code, value]) => (
                <span key={code}>
                  {" · "}
                  <span className="lstate" data-state="overdue">
                    {t("clientDetail.unpaidAmount", {
                      amount: formatMoneyIn(value, code),
                    })}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="inv-actions">
          <button
            className="btn-primary"
            onClick={() =>
              onCreateInvoice(
                new URLSearchParams({ clientName: client.name ?? "" }).toString(),
              )
            }
          >
            <Plus />
            {t("clientDetail.newInvoice")}
          </button>
          {!isEditing ? (
            <button className="btn-secondary" onClick={startEditing}>
              <Pencil />
              {t("common.edit")}
            </button>
          ) : null}
          <button
            className="btn-danger ml-auto"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 />
            {isDeleting ? t("clientDetail.deleting") : t("common.delete")}
          </button>
        </div>

        {isEditing ? (
          <>
            <div className="editing-bar">
              <span>{t("clientDetail.editingBanner")}</span>
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
            <ClientForm
              values={values}
              nameError={nameError}
              onChange={(patch) => {
                setNameError(undefined);
                setDraft((prev) => ({ ...(prev ?? toForm()), ...patch }));
              }}
            />
          </>
        ) : (
          <section>
            <h2 className="compose-heading mb-2">
              {t("clientDetail.invoicesTitle")}
            </h2>
            {rows.length === 0 ? (
              <div className="empty-state">
                {t("clientDetail.noInvoices")}
              </div>
            ) : (
              /* No sort props: this history is rendered in query order, and a
                 lit chip claiming an order the list does not have is worse
                 than no chips — on a phone they are the only affordance. */
              <LedgerTable
                rows={rows}
                onOpen={onViewInvoice}
                showClient={false}
                onRecordPayment={(row) => onViewInvoice(row.id)}
                onUndoPayment={(row) => onViewInvoice(row.id)}
                formatAmount={amount}
                formatMoney={formatMoneyIn}
                currencies={[...new Set(rows.map((row) => row.currency))]}
              />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
