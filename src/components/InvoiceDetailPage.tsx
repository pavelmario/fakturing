import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import {
  Document,
  Font,
  Image,
  Page,
  PDFDownloadLink,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import TrezorConnect from "@trezor/connect-web";
import QRCode from "qrcode";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
type InvoiceItemForm = {
  amount: string;
  unit: string;
  description: string;
  unitPrice: string;
  vat: string;
};

type InvoiceNumberRow = {
  id: string;
  invoiceNumber: string | null;
};

type ClientRow = {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  companyIdentificationNumber?: string | null;
  vatNumber?: string | null;
};

type UserProfileRow = {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  companyIdentificationNumber?: string | null;
  vatNumber?: string | null;
  vatPayer?: number | null;
  bankAccount?: string | null;
  iban?: string | null;
  swift?: string | null;
  invoiceFooterText?: string | null;
  poRequired?: number | null;
  mempoolUrl?: string | null;
};

type InvoiceDetailPageProps = {
  invoiceId: string;
  onBack: () => void;
};

const InvoiceId = Evolu.id("Invoice");

const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
  vat: "",
});

const parseItems = (raw: unknown): InvoiceItemForm[] => {
  if (!raw) return [emptyItem()];
  const source = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return [];
          }
        })()
      : [];

  if (!Array.isArray(source) || source.length === 0) return [emptyItem()];
  return source.map((item) => ({
    amount: item?.amount != null ? String(item.amount) : "",
    unit: item?.unit ?? "",
    description: item?.description ?? "",
    unitPrice: item?.unitPrice != null ? String(item.unitPrice) : "",
    vat: item?.vat != null ? String(item.vat) : "",
  }));
};

const toDateInputValue = (value?: string | null) => {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
};

Font.register({
  family: "NotoSans",
  src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf",
  fontWeight: 400,
});

Font.register({
  family: "NotoSans",
  src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf",
  fontWeight: 700,
});

const pdfStyles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "NotoSans",
    color: "#111827",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 700,
  },
  headerLine: {
    height: 2,
    backgroundColor: "#6b7280",
    marginBottom: 18,
  },
  columns: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 24,
  },
  column: {
    flexGrow: 1,
    flexBasis: 0,
  },
  label: {
    fontSize: 9,
    color: "#6b7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 600,
    marginBottom: 8,
  },
  textBold: {
    fontWeight: 700,
  },
  textMuted: {
    color: "#6b7280",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#d1d5db",
    paddingBottom: 6,
    marginTop: 16,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e5e7eb",
  },
  colQty: { width: "8%" },
  colUnit: { width: "6%" },
  colDesc: { width: "62%" },
  colUnitPrice: { width: "12%", textAlign: "right" },
  colTotal: { width: "12%", textAlign: "right" },
  colDescVat: { width: "60%" },
  // Adjusted widths for VAT payer columns ("Cena za MJ", "Cena bez DPH", "DPH (%)", "Cena s DPH")
  colUnitPriceVat: { width: "12%", textAlign: "right" },
  colTotalNoVat: { width: "12%", textAlign: "right" },
  colVatPercent: { width: "6%", textAlign: "right" },
  // colVatAmount is hidden for VAT payer
  colTotalVat: { width: "10%", textAlign: "right" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "baseline",
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: 700,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 700,
    marginLeft: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginTop: 18,
  },
  qrBlock: {
    width: 120,
    alignItems: "flex-start",
  },
  qrImage: {
    width: 110,
    height: 110,
    borderWidth: 1,
    borderColor: "#d1d5db",
    padding: 6,
  },
  qrLabel: {
    marginTop: 6,
    fontSize: 9,
    color: "#6b7280",
  },
  totalBlock: {
    width: "50%",
    alignItems: "flex-end",
  },
  btcNote: {
    marginTop: 10,
    alignItems: "flex-end",
    width: "100%",
  },
  btcNoteText: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "right",
    width: "100%",
  },
  btcNoteAddress: {
    fontSize: 11,
    color: "#6b7280",
    textAlign: "right",
    width: "100%",
    wordBreak: "break-all",
  },
  footerLine: {
    height: 2,
    backgroundColor: "#6b7280",
    width: "100%",
  },
  footer: {
    position: "absolute",
    left: 40,
    right: 40,
    bottom: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    color: "#6b7280",
  },
  footerLeft: {
    width: "50%",
    paddingRight: 8,
  },
  footerRight: {
    width: "50%",
    textAlign: "right",
  },
});

export function InvoiceDetailPage({
  invoiceId,
  onBack,
}: InvoiceDetailPageProps) {
  const { t, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const invoiceIdValue = useMemo(() => {
    const result = InvoiceId.from(invoiceId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Invoice">("invalid-invoice-id");
  }, [invoiceId]);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [duzp, setDuzp] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentDays, setPaymentDays] = useState("14");
  const [paymentMethod, setPaymentMethod] = useState("bank");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [btcInvoice, setBtcInvoice] = useState(false);
  const [btcAddress, setBtcAddress] = useState("");
  const [isTrezorLoading, setIsTrezorLoading] = useState(false);
  const [items, setItems] = useState<InvoiceItemForm[]>([emptyItem()]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const trezorInitializedRef = useRef(false);

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

  const clients = useQuery(clientsQuery) as readonly ClientRow[];

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

  const profileRows = useQuery(profileQuery) as readonly UserProfileRow[];
  const profile = profileRows[0] ?? null;
  const showVat = profile?.vatPayer === Evolu.sqliteTrue;
  const isPoRequired = profile?.poRequired === Evolu.sqliteTrue;
  const mempoolBaseUrl = (profile?.mempoolUrl ?? "").trim().replace(/\/+$/, "");
  const mempoolAddressUrl =
    mempoolBaseUrl && btcAddress.trim()
      ? `${mempoolBaseUrl}/address/${btcAddress.trim()}`
      : "";

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

  const invoiceRows = useQuery(invoiceQuery);
  const invoice = invoiceRows[0] ?? null;
  const invoiceNumberValue = invoice?.invoiceNumber ?? "";
  const sanitizedInvoiceNumber = invoiceNumberValue.replace(/-/g, "");

  const trimmedInvoiceNumber = invoiceNumber.trim();
  const duplicateInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["id", "invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );

  const duplicateInvoices = useQuery(
    duplicateInvoiceQuery,
  ) as readonly InvoiceNumberRow[];
  const hasDuplicateInvoiceNumber = Boolean(
    trimmedInvoiceNumber &&
    duplicateInvoices.some(
      (row) =>
        row.id !== invoice?.id && row.invoiceNumber === trimmedInvoiceNumber,
    ),
  );

  const selectedClient =
    clients.find(
      (client) =>
        client.name && client.name === (invoice?.clientName ?? clientName),
    ) ?? null;
  const displayClientName =
    (selectedClient?.name ?? invoice?.clientName ?? clientName) ||
    t("common.placeholderDash");

  const latestInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const latestInvoiceRows = useQuery(latestInvoiceQuery);
  const latestInvoiceNumber = latestInvoiceRows[0]?.invoiceNumber ?? "";

  const getNextInvoiceNumber = (latest: string) => {
    if (!latest) {
      const year = new Date().getFullYear();
      return `${year}-0001`;
    }

    const parts = latest.split("-");
    const lastPart = parts[parts.length - 1];
    const parsed = Number.parseInt(lastPart, 10);
    if (!Number.isNaN(parsed)) {
      const prefix = parts.slice(0, -1).join("-");
      const padded = String(parsed + 1).padStart(lastPart.length, "0");
      return prefix ? `${prefix}-${padded}` : padded;
    }

    return `${latest}-1`;
  };

  const normalizedItems = items
    .map((item) => ({
      amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
      unit: item.unit.trim(),
      description: item.description.trim(),
      unitPrice: Number.isFinite(Number(item.unitPrice))
        ? Number(item.unitPrice)
        : 0,
      vat: Number.isFinite(Number(item.vat)) ? Number(item.vat) : 0,
    }))
    .filter(
      (item) => item.description || item.unit || item.amount || item.unitPrice,
    );

  const formatNumber = (value: number, maxFraction = 2) =>
    new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFraction,
    }).format(value);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);

  const invoiceTotal = normalizedItems.reduce(
    (sum, item) =>
      sum + (Number(item.amount) || 0) * (Number(item.unitPrice) || 0),
    0,
  );

  const invoiceTotalWithVat = normalizedItems.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const vatPercent = Number(item.vat) || 0;
    const lineTotal = amount * unitPrice;
    const vatAmount = lineTotal * (vatPercent / 100);
    return sum + lineTotal + vatAmount;
  }, 0);

  // Calculate total VAT amount for all items
  const totalVatAmount = normalizedItems.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    const vatPercent = Number(item.vat) || 0;
    const lineTotal = amount * unitPrice;
    const vatAmount = lineTotal * (vatPercent / 100);
    return sum + vatAmount;
  }, 0);

  const formatUiTotal = (value: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const invoiceIssueDate = invoice?.issueDate
    ? new Date(invoice.issueDate).toLocaleDateString(locale).replace(/\s/g, "")
    : "";
  const invoiceDuzpDate = invoice?.duzp
    ? new Date(invoice.duzp).toLocaleDateString(locale).replace(/\s/g, "")
    : "";
  const invoiceDueDate = (() => {
    if (!invoice?.issueDate) return "";
    const issue = new Date(invoice.issueDate);
    const paymentDaysValue = invoice.paymentDays ?? 0;
    if (Number.isNaN(paymentDaysValue)) return "";
    const due = new Date(issue);
    due.setDate(issue.getDate() + paymentDaysValue);
    return due.toLocaleDateString(locale).replace(/\s/g, "");
  })();

  const invoiceDueDateQr = (() => {
    if (!invoice?.issueDate) return "";
    const issue = new Date(invoice.issueDate);
    const paymentDaysValue = invoice.paymentDays ?? 0;
    if (Number.isNaN(paymentDaysValue)) return "";
    const due = new Date(issue);
    due.setDate(issue.getDate() + paymentDaysValue);
    const yyyy = String(due.getFullYear());
    const mm = String(due.getMonth() + 1).padStart(2, "0");
    const dd = String(due.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  })();

  useEffect(() => {
    const buildQr = async () => {
      if (!invoice) {
        setQrCodeDataUrl(null);
        return;
      }

      // If the invoice is a BTC invoice, build a bitcoin: URI QR
      if (invoice.btcInvoice === Evolu.sqliteTrue) {
        const address = (invoice.btcAddress ?? "").trim();
        if (!address) {
          setQrCodeDataUrl(null);
          return;
        }

        const label = sanitizedInvoiceNumber
          ? `?label=${encodeURIComponent(sanitizedInvoiceNumber)}`
          : "";
        const uri = `bitcoin:${address}${label}`;
        try {
          const dataUrl = await QRCode.toDataURL(uri, {
            margin: 0,
            width: 256,
          });
          setQrCodeDataUrl(dataUrl);
          return;
        } catch (error) {
          console.error("Failed to generate BTC QR code:", error);
          setQrCodeDataUrl(null);
          return;
        }
      }

      // For non-BTC invoices, do not show QR for cash payments
      if (invoice.paymentMethod === "cash") {
        setQrCodeDataUrl(null);
        return;
      }

      const ibanCandidate = (
        profile?.iban ??
        profile?.bankAccount ??
        ""
      ).replace(/\s/g, "");
      if (!ibanCandidate) {
        setQrCodeDataUrl(null);
        return;
      }

      const totalForQr = showVat ? invoiceTotalWithVat : invoiceTotal;
      const amount = Number.isFinite(totalForQr) ? totalForQr : 0;
      if (!amount || amount <= 0) {
        setQrCodeDataUrl(null);
        return;
      }

      const variableSymbol = sanitizedInvoiceNumber;
      const formattedAmount = Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2);
      const accountValue = profile?.swift
        ? `${ibanCandidate}+${profile.swift}`
        : ibanCandidate;
      const parts = [
        "SPD*1.0",
        `ACC:${accountValue}`,
        "PT:IP",
        `AM:${formattedAmount}`,
        variableSymbol ? `X-VS:${variableSymbol}` : "",
        invoiceDueDateQr ? `DT:${invoiceDueDateQr}` : "",
        "MSG:QRPLATBA",
        "",
      ].filter((value) => value !== undefined);

      try {
        const dataUrl = await QRCode.toDataURL(parts.join("*"), {
          margin: 0,
          width: 256,
        });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error("Failed to generate QR code:", error);
        setQrCodeDataUrl(null);
      }
    };

    buildQr();
  }, [
    invoice,
    invoice?.btcInvoice,
    invoice?.btcAddress,
    invoice?.paymentMethod,
    invoiceTotal,
    invoiceTotalWithVat,
    invoiceDueDateQr,
    profile?.iban,
    profile?.bankAccount,
    profile?.swift,
    showVat,
    sanitizedInvoiceNumber,
  ]);

  const pdfDocument = invoice ? (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow}>
          <Text />
          <Text style={pdfStyles.headerTitle}>
            {t("pdf.invoiceTitle", {
              number: invoiceNumberValue || t("common.placeholderDash"),
            })}
          </Text>
        </View>
        <View style={pdfStyles.headerLine} />

        <View style={pdfStyles.columns}>
          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>{t("pdf.supplier")}</Text>
            <Text style={pdfStyles.textBold}>{profile?.name ?? ""}</Text>
            <Text style={pdfStyles.textMuted}>
              {profile?.addressLine1 ?? ""}
            </Text>
            <Text style={pdfStyles.textMuted}>
              {profile?.addressLine2 ?? ""}
            </Text>
            <View style={{ marginTop: 6 }}>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.companyId")}</Text>
                <Text>{profile?.companyIdentificationNumber ?? ""}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {profile?.vatNumber
                    ? t("pdf.vatIdOrNonVat")
                    : t("pdf.nonVatPayer")}
                </Text>
                <Text>{profile?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>

          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>{t("pdf.customer")}</Text>
            <Text style={pdfStyles.textBold}>{displayClientName}</Text>
            <Text style={pdfStyles.textMuted}>
              {selectedClient?.addressLine1 ?? ""}
            </Text>
            <Text style={pdfStyles.textMuted}>
              {selectedClient?.addressLine2 ?? ""}
            </Text>
            <View style={{ marginTop: 6 }}>
              {selectedClient?.companyIdentificationNumber ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>{t("pdf.companyId")}</Text>
                  <Text>{selectedClient.companyIdentificationNumber}</Text>
                </View>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {selectedClient?.vatNumber
                    ? t("pdf.vatIdOrNonVat")
                    : t("pdf.nonVatPayer")}
                </Text>
                <Text>{selectedClient?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={pdfStyles.columns}>
            <View style={pdfStyles.column}>
              {invoice?.paymentMethod !== "cash" ? (
                <>
                  <View style={pdfStyles.detailRow}>
                    <Text style={pdfStyles.textMuted}>
                      {t("pdf.bankAccount")}
                    </Text>
                    <Text>{profile?.bankAccount ?? ""}</Text>
                  </View>
                  <View style={pdfStyles.detailRow}>
                    <Text style={pdfStyles.textMuted}>
                      {t("pdf.variableSymbol")}
                    </Text>
                    <Text>{sanitizedInvoiceNumber}</Text>
                  </View>
                </>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {t("pdf.paymentMethod")}
                </Text>
                <Text>
                  {invoice?.paymentMethod === "cash"
                    ? t("pdf.paymentCash")
                    : t("pdf.paymentBank")}
                </Text>
              </View>
            </View>
            <View style={pdfStyles.column}>
              {invoice?.purchaseOrderNumber?.trim() ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>
                    {t("pdf.purchaseOrderNumber")}
                  </Text>
                  <Text>{invoice.purchaseOrderNumber}</Text>
                </View>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.issueDate")}</Text>
                <Text>{invoiceIssueDate}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>{t("pdf.dueDate")}</Text>
                <Text>{invoiceDueDate}</Text>
              </View>
              {invoiceDuzpDate ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>{t("pdf.duzpDate")}</Text>
                  <Text>{invoiceDuzpDate}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={pdfStyles.tableHeader}>
          <Text style={[pdfStyles.colQty, pdfStyles.textMuted]}>
            {t("pdf.tableQty")}
          </Text>
          <Text style={[pdfStyles.colUnit, pdfStyles.textMuted]}>
            {t("pdf.tableUnit")}
          </Text>
          <Text
            style={[
              showVat ? pdfStyles.colDescVat : pdfStyles.colDesc,
              pdfStyles.textMuted,
            ]}
          >
            {t("pdf.tableDescription")}
          </Text>
          <Text
            style={[
              showVat ? pdfStyles.colUnitPriceVat : pdfStyles.colUnitPrice,
              pdfStyles.textMuted,
            ]}
          >
            {t("pdf.tableUnitPrice")}
          </Text>
          {showVat ? (
            <>
              <Text style={[pdfStyles.colTotalNoVat, pdfStyles.textMuted]}>
                {t("pdf.tableTotalNoVat")}
              </Text>
              <Text style={[pdfStyles.colVatPercent, pdfStyles.textMuted]}>
                {t("pdf.tableVat")}
              </Text>
              {/* DPH column hidden for VAT payer */}
              <Text style={[pdfStyles.colTotalVat, pdfStyles.textMuted]}>
                {t("pdf.tableTotalVat")}
              </Text>
            </>
          ) : (
            <Text style={[pdfStyles.colTotal, pdfStyles.textMuted]}>
              {t("pdf.tableTotal")}
            </Text>
          )}
        </View>

        {normalizedItems.map((item, index) => {
          const amount = Number(item.amount) || 0;
          const unitPrice = Number(item.unitPrice) || 0;
          const vatPercent = Number(item.vat) || 0;
          const lineTotal = amount * unitPrice;
          const vatAmount = lineTotal * (vatPercent / 100);
          const lineTotalWithVat = lineTotal + vatAmount;

          return (
            <View
              style={pdfStyles.tableRow}
              key={`${item.description}-${index}`}
            >
              <Text style={pdfStyles.colQty}>
                {item.amount ? formatNumber(Number(item.amount)) : ""}
              </Text>
              <Text style={pdfStyles.colUnit}>{item.unit}</Text>
              <Text style={showVat ? pdfStyles.colDescVat : pdfStyles.colDesc}>
                {item.description}
              </Text>
              <Text
                style={
                  showVat ? pdfStyles.colUnitPriceVat : pdfStyles.colUnitPrice
                }
              >
                {formatCurrency(unitPrice)}
              </Text>
              {showVat ? (
                <>
                  <Text style={pdfStyles.colTotalNoVat}>
                    {formatCurrency(lineTotal)}
                  </Text>
                  <Text style={pdfStyles.colVatPercent}>
                    {vatPercent ? formatNumber(vatPercent, 2) : ""}
                  </Text>
                  {/* DPH column hidden for VAT payer */}
                  <Text style={pdfStyles.colTotalVat}>
                    {formatCurrency(lineTotalWithVat)}
                  </Text>
                </>
              ) : (
                <Text style={pdfStyles.colTotal}>
                  {formatCurrency(lineTotal)}
                </Text>
              )}
            </View>
          );
        })}

        <View style={pdfStyles.summaryRow}>
          {qrCodeDataUrl ? (
            <View style={pdfStyles.qrBlock}>
              <Image style={pdfStyles.qrImage} src={qrCodeDataUrl} />
              <Text style={pdfStyles.qrLabel}>
                {invoice.btcInvoice === Evolu.sqliteTrue
                  ? t("pdf.qrPaymentBtc")
                  : t("pdf.qrPayment")}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View style={pdfStyles.totalBlock}>
            <View style={pdfStyles.totalRow}>
              <View style={{ alignItems: "flex-end" }}>
                {showVat ? (
                  <>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <Text style={pdfStyles.textMuted}>
                        {t("pdf.totalNoVat")}
                      </Text>
                      <Text style={pdfStyles.textMuted}>
                        {formatCurrency(invoiceTotal)}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        gap: 6,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={pdfStyles.textMuted}>
                        {t("pdf.totalVat")}
                      </Text>
                      <Text style={pdfStyles.textMuted}>
                        {formatCurrency(totalVatAmount)}
                      </Text>
                    </View>
                  </>
                ) : null}
              </View>
            </View>
            <View style={pdfStyles.footerLine} />
            <View style={pdfStyles.totalRow}>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={pdfStyles.totalValue}>
                  {t("pdf.total")}{" "}
                  {formatCurrency(showVat ? invoiceTotalWithVat : invoiceTotal)}
                </Text>
              </View>
            </View>
          </View>
        </View>
        {invoice.btcInvoice === Evolu.sqliteTrue ? (
          <View style={pdfStyles.btcNote}>
            <Text style={pdfStyles.btcNoteText}>{t("pdf.btcNote")}</Text>
            <Text
              style={pdfStyles.btcNoteAddress}
              hyphenationCallback={(word) => [word]}
            >
              {invoice.btcAddress ?? ""}
            </Text>
          </View>
        ) : null}
        <View style={pdfStyles.footer}>
          <View style={pdfStyles.footerLeft}>
            <Text>{profile?.invoiceFooterText ?? ""}</Text>
          </View>
          <Text style={pdfStyles.footerRight}>
            {[profile?.email, profile?.phone].filter(Boolean).join(" | ")}
          </Text>
        </View>
      </Page>
    </Document>
  ) : null;

  const hydrateForm = (source: typeof invoice) => {
    setInvoiceNumber(source?.invoiceNumber ?? "");
    setClientName(source?.clientName ?? "");
    setIssueDate(toDateInputValue(source?.issueDate ?? ""));
    setDuzp(toDateInputValue(source?.duzp ?? ""));
    setPaymentDate(toDateInputValue(source?.paymentDate ?? ""));
    setPaymentDays(
      source?.paymentDays != null ? String(source.paymentDays) : "14",
    );
    setPaymentMethod(
      source?.paymentMethod === "cash" || source?.paymentMethod === "bank"
        ? source.paymentMethod
        : "bank",
    );
    setPurchaseOrderNumber(source?.purchaseOrderNumber ?? "");
    setBtcInvoice(source?.btcInvoice === Evolu.sqliteTrue);
    setBtcAddress(source?.btcAddress ?? "");
    setItems(parseItems(source?.items));
  };

  useEffect(() => {
    hydrateForm(invoice);
    setIsEditing(false);
    setSaveMessage(null);
  }, [invoice]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const getTrezorErrorKey = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";

    if (normalized.includes("thpstate.deserialize invalid state")) {
      return "invoiceDetail.trezorThpInvalid";
    }

    if (
      normalized.includes("transport is missing") ||
      normalized.includes("desktop_connectionmissing") ||
      normalized.includes("browser_localnetworkpermissionmissing") ||
      normalized.includes("connect-ws")
    ) {
      return "invoiceDetail.trezorTransportMissing";
    }

    return "invoiceDetail.trezorRequestError";
  };

  const shouldFallbackToPopupMode = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";
    return (
      normalized.includes("desktop_connectionmissing") ||
      normalized.includes("browser_localnetworkpermissionmissing") ||
      normalized.includes("connect-ws")
    );
  };

  const ensureTrezorInit = useCallback(
    async (coreMode: "auto" | "popup") => {
      if (trezorInitializedRef.current) return true;
      try {
        const appUrl =
          typeof window === "undefined" || !window.location.origin
            ? "http://localhost"
            : window.location.origin;
        await TrezorConnect.init({
          connectSrc: "https://connect.trezor.io/9/",
          lazyLoad: true,
          coreMode,
          manifest: {
            email: "pavel.mario43@gmail.com",
            appName: "Fakturing",
            appUrl,
          },
        });
        trezorInitializedRef.current = true;
        return true;
      } catch (error) {
        console.error("Trezor init failed", error);
        alert(t("invoiceDetail.trezorInitError"));
        return false;
      }
    },
    [t],
  );

  const handleLoadFromTrezor = useCallback(async () => {
    const requestAccountInfo = () =>
      TrezorConnect.getAccountInfo({
        coin: "btc",
        details: "tokens",
        tokens: "derived",
      });

    setIsTrezorLoading(true);
    try {
      const ready = await ensureTrezorInit("auto");
      if (!ready) return;

      let result = await requestAccountInfo();

      if (!result.success && shouldFallbackToPopupMode(result.payload?.error)) {
        trezorInitializedRef.current = false;
        await TrezorConnect.dispose();

        const fallbackReady = await ensureTrezorInit("popup");
        if (!fallbackReady) return;

        result = await requestAccountInfo();
      }

      if (!result.success) {
        console.error("Trezor getAccountInfo error", result.payload?.error);
        alert(t(getTrezorErrorKey(result.payload?.error)));
        return;
      }

      const unused = result.payload.addresses?.unused ?? [];
      const address = unused.find((entry) => entry?.address)?.address ?? "";
      if (!address) {
        alert(t("invoiceDetail.trezorNoUnused"));
        return;
      }

      setBtcAddress(address);
    } catch (error) {
      console.error("Trezor request failed", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "";
      alert(t(getTrezorErrorKey(message)));
    } finally {
      setIsTrezorLoading(false);
    }
  }, [ensureTrezorInit, t]);

  const updateItem = (
    index: number,
    field: keyof InvoiceItemForm,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index),
    );
  };

  const handleSave = async () => {
    if (!invoice?.id) return;
    if (!trimmedInvoiceNumber) {
      alert(t("alerts.invoiceNumberRequired"));
      return;
    }
    if (!clientName.trim()) {
      alert(t("alerts.invoiceClientRequired"));
      return;
    }
    if (!issueDate.trim()) {
      alert(t("alerts.issueDateRequired"));
      return;
    }

    const paymentDaysNumber = Number(paymentDays);
    if (Number.isNaN(paymentDaysNumber) || paymentDaysNumber < 0) {
      alert(t("alerts.paymentDaysInvalid"));
      return;
    }

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(new Date(issueDate));
    if (!issueDateResult.ok) {
      console.error(
        "Issue date error:",
        formatTypeError(issueDateResult.error),
      );
      alert(t("alerts.issueDateInvalid"));
      return;
    }

    let duzpValue: typeof issueDateResult.value | null = null;
    if (duzp.trim()) {
      const duzpResult = Evolu.dateToDateIso(new Date(duzp));
      if (!duzpResult.ok) {
        console.error("DUZP date error:", formatTypeError(duzpResult.error));
        alert(t("alerts.duzpInvalid"));
        return;
      }
      duzpValue = duzpResult.value;
    }

    let paymentDateValue: typeof issueDateResult.value | null = null;
    if (paymentDate.trim()) {
      const paymentDateResult = Evolu.dateToDateIso(new Date(paymentDate));
      if (!paymentDateResult.ok) {
        console.error(
          "Payment date error:",
          formatTypeError(paymentDateResult.error),
        );
        alert(t("alerts.paymentDateInvalid"));
        return;
      }
      paymentDateValue = paymentDateResult.value;
    }

    const paymentDaysResult = Evolu.NonNegativeNumber.from(paymentDaysNumber);
    if (!paymentDaysResult.ok) {
      console.error(
        "Payment days error:",
        formatTypeError(paymentDaysResult.error),
      );
      alert(t("alerts.paymentDaysInvalid"));
      return;
    }

    if (hasDuplicateInvoiceNumber) {
      const confirmed = confirm(t("alerts.duplicateInvoiceConfirm"));
      if (!confirmed) return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const normalizedItems = items
        .map((item) => ({
          amount: Number.isFinite(Number(item.amount))
            ? Number(item.amount)
            : 0,
          unit: item.unit.trim(),
          description: item.description.trim(),
          unitPrice: Number.isFinite(Number(item.unitPrice))
            ? Number(item.unitPrice)
            : 0,
          vat: Number.isFinite(Number(item.vat)) ? Number(item.vat) : 0,
        }))
        .filter(
          (item) =>
            item.description || item.unit || item.amount || item.unitPrice,
        );

      const itemsResult = Evolu.Json.from(JSON.stringify(normalizedItems));
      if (!itemsResult.ok) {
        console.error("Items error:", formatTypeError(itemsResult.error));
        alert(t("alerts.invoiceItemsInvalid"));
        return;
      }

      const result = evolu.update("invoice", {
        id: invoice.id,
        invoiceNumber: trimmedInvoiceNumber,
        clientName: clientName.trim(),
        issueDate: issueDateResult.value,
        duzp: duzpValue,
        paymentDate: paymentDateValue,
        paymentDays: paymentDaysResult.value,
        paymentMethod,
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
        btcInvoice: btcInvoice ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        btcAddress: toNullable(btcAddress),
        items: itemsResult.value,
      });

      if (!result.ok) {
        console.error("Validation error:", formatTypeError(result.error));
        alert(t("alerts.invoiceSaveValidation"));
        return;
      }

      setSaveMessage(t("alerts.invoiceUpdateSaved"));
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating invoice:", error);
      alert(t("alerts.invoiceSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    hydrateForm(invoice);
    setIsEditing(false);
    setSaveMessage(null);
  };

  const handleCancelPayment = () => {
    if (!invoice?.id) return;

    const result = evolu.update("invoice", {
      id: invoice.id,
      paymentDate: null,
    });

    if (!result.ok) {
      console.error("Payment cancel error:", result.error);
      alert(t("alerts.paymentCancelFailed"));
      return;
    }

    setPaymentDate("");
  };

  const handleDelete = async () => {
    if (!invoice?.id) return;
    const confirmed = confirm(t("alerts.invoiceDeleteConfirm"));
    if (!confirmed) return;

    setIsDeleting(true);
    setSaveMessage(null);

    try {
      const result = evolu.update("invoice", {
        id: invoice.id,
        deleted: Evolu.sqliteTrue,
      });
      if (!result.ok) {
        console.error("Delete error:", result.error);
        alert(t("alerts.invoiceDeleteFailed"));
        return;
      }
      onBack();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      alert(t("alerts.invoiceDeleteFailed"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!invoice) return;

    setIsDuplicating(true);
    setSaveMessage(null);
    try {
      const nextInvoiceNumber = getNextInvoiceNumber(latestInvoiceNumber ?? "");
      const safeClientName = invoice.clientName ?? clientName.trim();
      if (!safeClientName) {
        alert(t("alerts.invoiceClientMissing"));
        return;
      }
      if (!invoice.issueDate) {
        alert(t("alerts.invoiceIssueDateMissing"));
        return;
      }
      if (invoice.paymentDays == null) {
        alert(t("alerts.invoicePaymentDaysMissing"));
        return;
      }

      const todayResult = Evolu.dateToDateIso(new Date());
      if (!todayResult.ok) {
        console.error("Today date error:", todayResult.error);
        alert(t("alerts.todayDateFailed"));
        return;
      }
      const todayIso = todayResult.value;

      const payload = {
        invoiceNumber: nextInvoiceNumber,
        clientName: safeClientName,
        issueDate: todayIso,
        duzp: todayIso,
        paymentDate: null,
        paymentDays: invoice.paymentDays,
        paymentMethod: invoice.paymentMethod ?? "bank",
        purchaseOrderNumber: invoice.purchaseOrderNumber,
        btcInvoice: invoice.btcInvoice ?? Evolu.sqliteFalse,
        btcAddress: invoice.btcAddress,
        items: invoice.items ?? Evolu.Json.orThrow("[]"),
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, {
        onlyValidate: true,
      });
      if (!validation.ok) {
        console.error("Validation error:", validation.error);
        alert(t("alerts.invoiceDuplicateValidation"));
        return;
      }

      const result = evolu.insert("invoice", payload);
      if (!result.ok) {
        console.error("Insert error:", result.error);
        alert(t("alerts.invoiceDuplicateFailed"));
        return;
      }

      setSaveMessage(t("alerts.invoiceDuplicated"));
    } catch (error) {
      console.error("Error duplicating invoice:", error);
      alert(t("alerts.invoiceDuplicateFailed"));
    } finally {
      setIsDuplicating(false);
    }
  };

  if (!invoice) {
    return (
      <div className="page-shell">
        <div className="page-container-lg">
          <div className="page-card-lg">
            <div className="flex items-center justify-between mb-6">
              <h1 className="page-title">{t("invoiceDetail.title")}</h1>
              <button onClick={onBack} className="btn-secondary">
                {t("common.backToList")}
              </button>
            </div>
            <div className="empty-state">{t("invoiceDetail.notFound")}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-card-lg">
          <div className="flex items-center justify-between mb-6">
            <h1 className="page-title">{t("invoiceDetail.title")}</h1>
            <button onClick={onBack} className="btn-secondary">
              {t("common.backToList")}
            </button>
          </div>

          {saveMessage ? (
            <div className="mb-6 alert-success">{saveMessage}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="invoiceNumber" className="form-label">
                {t("invoiceDetail.invoiceNumberLabel")}
              </label>
              <input
                id="invoiceNumber"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                disabled={!isEditing}
                className="form-input disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="clientName" className="form-label">
                {t("invoiceDetail.clientLabel")}
              </label>
              <select
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={!isEditing}
                className="form-select disabled:bg-slate-100"
              >
                <option value="">{t("invoiceDetail.clientPlaceholder")}</option>
                {clients
                  .filter((client): client is { id: string; name: string } =>
                    Boolean(client.name),
                  )
                  .map((client) => (
                    <option key={client.id} value={client.name}>
                      {client.name}
                    </option>
                  ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-xs text-gray-500 mt-2">
                  {t("invoiceDetail.clientsEmpty")}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="issueDate" className="form-label">
                  {t("invoiceDetail.issueDateLabel")}
                </label>
                <input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="paymentDays" className="form-label">
                  {t("invoiceDetail.paymentDaysLabel")}
                </label>
                <input
                  id="paymentDays"
                  type="number"
                  min={0}
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="paymentDate" className="form-label">
                {t("invoiceDetail.paymentDateLabel")}
              </label>
              <input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={!isEditing}
                className="form-input disabled:bg-slate-100"
              />
            </div>

            {profile?.vatPayer === Evolu.sqliteTrue ? (
              <div>
                <label htmlFor="duzp" className="form-label">
                  {t("invoiceDetail.duzpLabel")}
                </label>
                <input
                  id="duzp"
                  type="date"
                  value={duzp}
                  onChange={(e) => setDuzp(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="paymentMethod" className="form-label">
                {t("invoiceDetail.paymentMethodLabel")}
              </label>
              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                disabled={!isEditing}
                className="form-select disabled:bg-slate-100"
              >
                <option value="bank">
                  {t("invoiceDetail.paymentMethodBank")}
                </option>
                <option value="cash">
                  {t("invoiceDetail.paymentMethodCash")}
                </option>
              </select>
            </div>

            {isPoRequired ? (
              <div>
                <label htmlFor="purchaseOrderNumber" className="form-label">
                  {t("invoiceDetail.purchaseOrderLabel")}
                </label>
                <input
                  id="purchaseOrderNumber"
                  type="text"
                  value={purchaseOrderNumber}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  disabled={!isEditing}
                  placeholder={t("invoiceDetail.purchaseOrderPlaceholder")}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
            ) : null}

            <div className="flex items-center gap-3 mt-6">
              <input
                id="btcInvoice"
                type="checkbox"
                checked={btcInvoice}
                onChange={(e) => setBtcInvoice(e.target.checked)}
                disabled={!isEditing}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="btcInvoice"
                className="text-sm font-medium text-slate-700"
              >
                {t("invoiceDetail.btcInvoiceLabel")}
              </label>
            </div>

            {btcInvoice ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label
                    htmlFor="btcAddress"
                    className="form-label gap-3 mt-3 mb-3"
                  >
                    {t("invoiceDetail.btcAddressLabel")}
                  </label>
                  {isEditing && !btcAddress.trim() ? (
                    <button
                      type="button"
                      onClick={handleLoadFromTrezor}
                      disabled={isTrezorLoading}
                      className="btn-secondary hidden sm:inline-flex"
                    >
                      {isTrezorLoading
                        ? t("invoiceDetail.trezorLoading")
                        : t("invoiceDetail.trezorLoad")}
                    </button>
                  ) : null}
                </div>
                <input
                  id="btcAddress"
                  type="text"
                  value={btcAddress}
                  onChange={(e) => setBtcAddress(e.target.value)}
                  disabled={!isEditing}
                  placeholder={t("invoiceDetail.btcAddressPlaceholder")}
                  className="form-input disabled:bg-slate-100"
                />
                {mempoolAddressUrl ? (
                  <a
                    href={mempoolAddressUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary mt-3 inline-flex w-full sm:w-auto justify-center"
                  >
                    {t("invoiceDetail.mempoolCheck")}
                  </a>
                ) : null}
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("invoiceDetail.itemsTitle")}
                </h2>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!isEditing}
                  className="btn-secondary"
                >
                  {t("invoiceDetail.addItem")}
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="panel-card space-y-3">
                    <div>
                      <label
                        htmlFor={`item-${index}-description`}
                        className="form-label"
                      >
                        {t("invoiceDetail.itemDescription")}
                      </label>
                      <input
                        id={`item-${index}-description`}
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                        disabled={!isEditing}
                        className="form-input disabled:bg-slate-100"
                      />
                    </div>

                    <div
                      className={`grid grid-cols-1 ${
                        showVat ? "md:grid-cols-4" : "md:grid-cols-3"
                      } gap-3`}
                    >
                      <div>
                        <label
                          htmlFor={`item-${index}-amount`}
                          className="form-label"
                        >
                          {t("invoiceDetail.itemAmount")}
                        </label>
                        <input
                          id={`item-${index}-amount`}
                          type="number"
                          min={0}
                          value={item.amount}
                          onChange={(e) =>
                            updateItem(index, "amount", e.target.value)
                          }
                          disabled={!isEditing}
                          className="form-input disabled:bg-slate-100"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`item-${index}-unit`}
                          className="form-label"
                        >
                          {t("invoiceDetail.itemUnit")}
                        </label>
                        <input
                          id={`item-${index}-unit`}
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(index, "unit", e.target.value)
                          }
                          disabled={!isEditing}
                          className="form-input disabled:bg-slate-100"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`item-${index}-unitPrice`}
                          className="form-label"
                        >
                          {t("invoiceDetail.itemUnitPrice")}
                        </label>
                        <input
                          id={`item-${index}-unitPrice`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(index, "unitPrice", e.target.value)
                          }
                          disabled={!isEditing}
                          className="form-input disabled:bg-slate-100"
                        />
                      </div>

                      {showVat ? (
                        <div>
                          <label
                            htmlFor={`item-${index}-vat`}
                            className="form-label"
                          >
                            {t("invoiceDetail.itemVat")}
                          </label>
                          <input
                            id={`item-${index}-vat`}
                            type="number"
                            min={0}
                            step="0.1"
                            value={item.vat}
                            onChange={(e) =>
                              updateItem(index, "vat", e.target.value)
                            }
                            disabled={!isEditing}
                            className="form-input disabled:bg-slate-100"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={!isEditing || items.length === 1}
                        className="btn-danger"
                      >
                        {t("invoiceDetail.itemRemove")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-card text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                {t("invoiceDetail.totalLabel")}
              </span>{" "}
              {formatUiTotal(invoiceTotal)}
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {pdfDocument ? (
              <PDFDownloadLink
                document={pdfDocument}
                fileName={t("invoiceDetail.pdfFileName", {
                  number: invoiceNumberValue || invoice.id,
                })}
                className="btn-secondary w-full sm:w-auto text-center"
              >
                {({ loading }) =>
                  loading
                    ? t("invoiceDetail.pdfPreparing")
                    : t("invoiceDetail.pdfExport")
                }
              </PDFDownloadLink>
            ) : null}
            {!isEditing ? (
              <>
                <button
                  onClick={handleDuplicate}
                  disabled={isDuplicating}
                  className="btn-success w-full sm:w-auto"
                >
                  {isDuplicating
                    ? t("invoiceDetail.duplicating")
                    : t("invoiceDetail.duplicate")}
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-primary w-full sm:w-auto"
                >
                  {t("common.edit")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting
                    ? t("invoiceDetail.deleting")
                    : t("common.delete")}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                  className="btn-primary w-full sm:w-auto"
                >
                  {isSaving ? t("common.saving") : t("common.save")}
                </button>
                <button
                  onClick={handleCancelPayment}
                  disabled={isSaving || isDeleting}
                  className="btn-secondary w-full sm:w-auto"
                >
                  {t("invoiceDetail.cancelPayment")}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving || isDeleting}
                  className="btn-secondary w-full sm:w-auto"
                >
                  {t("invoiceDetail.cancelEdits")}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting
                    ? t("invoiceDetail.deleting")
                    : t("common.delete")}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
