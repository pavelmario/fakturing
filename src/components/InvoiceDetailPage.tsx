import { use, useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { Document, Font, Image, Page, PDFDownloadLink, StyleSheet, Text, View } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { useEvolu } from "../evolu";

type InvoiceDetailPageProps = {
  invoiceId: string;
  onBack: () => void;
};

type InvoiceItemForm = {
  amount: string;
  unit: string;
  description: string;
  unitPrice: string;
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
};

const InvoiceId = Evolu.id("Invoice");

const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
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
  colQty: { width: "10%" },
  colUnit: { width: "10%" },
  colDesc: { width: "45%" },
  colUnitPrice: { width: "17%", textAlign: "right" },
  colTotal: { width: "18%", textAlign: "right" },
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
  },
  btcNoteText: {
    fontSize: 11,
    color: "#6b7280",
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
});

export function InvoiceDetailPage({ invoiceId, onBack }: InvoiceDetailPageProps) {
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
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [btcInvoice, setBtcInvoice] = useState(false);
  const [btcAddress, setBtcAddress] = useState("");
  const [items, setItems] = useState<InvoiceItemForm[]>([emptyItem()]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc")
      ),
    [evolu, owner.id]
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
          .limit(1)
      ),
    [evolu, owner.id]
  );

  const profileRows = useQuery(profileQuery) as readonly UserProfileRow[];
  const profile = profileRows[0] ?? null;

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
          .limit(1)
      ),
    [evolu, invoiceIdValue, owner.id]
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
          .where("deleted", "is not", Evolu.sqliteTrue)
      ),
    [evolu, owner.id]
  );

  const duplicateInvoices = useQuery(duplicateInvoiceQuery) as readonly InvoiceNumberRow[];
  const hasDuplicateInvoiceNumber = Boolean(
    trimmedInvoiceNumber &&
      duplicateInvoices.some((row) => row.id !== invoice?.id && row.invoiceNumber === trimmedInvoiceNumber)
  );

  const selectedClient =
    clients.find(
      (client) =>
        client.name && client.name === (invoice?.clientName ?? clientName)
    ) ?? null;
  const displayClientName =
    (selectedClient?.name ?? invoice?.clientName ?? clientName) || "—";

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
          .limit(1)
      ),
    [evolu, owner.id]
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
      unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
    }))
    .filter((item) => item.description || item.unit || item.amount || item.unitPrice);

  const formatNumber = (value: number, maxFraction = 2) =>
    new Intl.NumberFormat("cs-CZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxFraction,
    }).format(value);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
    }).format(value);

  const invoiceTotal = normalizedItems.reduce(
    (sum, item) => sum + (Number(item.amount) || 0) * (Number(item.unitPrice) || 0),
    0
  );

  const formatUiTotal = (value: number) =>
    new Intl.NumberFormat("cs-CZ", {
      style: "currency",
      currency: "CZK",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);

  const invoiceIssueDate = invoice?.issueDate
    ? new Date(invoice.issueDate).toLocaleDateString("cs-CZ").replace(/\s/g, "")
    : "";
  const invoiceDuzpDate = invoice?.duzp
    ? new Date(invoice.duzp).toLocaleDateString("cs-CZ").replace(/\s/g, "")
    : "";
  const invoiceDueDate = (() => {
    if (!invoice?.issueDate) return "";
    const issue = new Date(invoice.issueDate);
    const paymentDaysValue = invoice.paymentDays ?? 0;
    if (Number.isNaN(paymentDaysValue)) return "";
    const due = new Date(issue);
    due.setDate(issue.getDate() + paymentDaysValue);
    return due.toLocaleDateString("cs-CZ").replace(/\s/g, "");
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
      if (!invoice || invoice.btcInvoice === Evolu.sqliteTrue) {
        setQrCodeDataUrl(null);
        return;
      }

      const ibanCandidate = (profile?.iban ?? profile?.bankAccount ?? "").replace(/\s/g, "");
      if (!ibanCandidate) {
        setQrCodeDataUrl(null);
        return;
      }

      const amount = Number.isFinite(invoiceTotal) ? invoiceTotal : 0;
      if (!amount || amount <= 0) {
        setQrCodeDataUrl(null);
        return;
      }

      const variableSymbol = sanitizedInvoiceNumber;
      const formattedAmount = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
      const accountValue = profile?.swift ? `${ibanCandidate}+${profile.swift}` : ibanCandidate;
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
        const dataUrl = await QRCode.toDataURL(parts.join("*"), { margin: 0, width: 256 });
        setQrCodeDataUrl(dataUrl);
      } catch (error) {
        console.error("Failed to generate QR code:", error);
        setQrCodeDataUrl(null);
      }
    };

    buildQr();
  }, [invoice, invoiceTotal, invoiceDueDateQr, profile?.iban, profile?.bankAccount, profile?.swift]);

  const pdfDocument = invoice ? (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.headerRow}>
          <Text />
          <Text style={pdfStyles.headerTitle}>{`Faktura ${invoiceNumberValue || "—"}`}</Text>
        </View>
        <View style={pdfStyles.headerLine} />

        <View style={pdfStyles.columns}>
          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>Dodavatel</Text>
            <Text style={pdfStyles.textBold}>{profile?.name ?? ""}</Text>
            <Text style={pdfStyles.textMuted}>{profile?.addressLine1 ?? ""}</Text>
            <Text style={pdfStyles.textMuted}>{profile?.addressLine2 ?? ""}</Text>
            <View style={{ marginTop: 6 }}>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>IČO</Text>
                <Text>{profile?.companyIdentificationNumber ?? ""}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {profile?.vatNumber ? "DIČ" : "Neplátce DPH"}
                </Text>
                <Text>{profile?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>

          <View style={pdfStyles.column}>
            <Text style={pdfStyles.label}>Odběratel</Text>
            <Text style={pdfStyles.textBold}>{displayClientName}</Text>
            <Text style={pdfStyles.textMuted}>{selectedClient?.addressLine1 ?? ""}</Text>
            <Text style={pdfStyles.textMuted}>{selectedClient?.addressLine2 ?? ""}</Text>
            <View style={{ marginTop: 6 }}>
              {selectedClient?.companyIdentificationNumber ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>IČO</Text>
                  <Text>{selectedClient.companyIdentificationNumber}</Text>
                </View>
              ) : null}
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>
                  {selectedClient?.vatNumber ? "DIČ" : "Neplátce DPH"}
                </Text>
                <Text>{selectedClient?.vatNumber ?? ""}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={pdfStyles.columns}>
            <View style={pdfStyles.column}>
               <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>Bankovní účet</Text>
                <Text>{profile?.bankAccount ?? ""}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>Variabilní symbol</Text>
                <Text>{sanitizedInvoiceNumber}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>Způsob platby</Text>
                <Text>Převodem</Text>
              </View>
            </View>
            <View style={pdfStyles.column}>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>Datum vystavení</Text>
                <Text>{invoiceIssueDate}</Text>
              </View>
              <View style={pdfStyles.detailRow}>
                <Text style={pdfStyles.textMuted}>Datum splatnosti</Text>
                <Text>{invoiceDueDate}</Text>
              </View>
              {invoiceDuzpDate ? (
                <View style={pdfStyles.detailRow}>
                  <Text style={pdfStyles.textMuted}>Datum zdan. plnění</Text>
                  <Text>{invoiceDuzpDate}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={pdfStyles.tableHeader}>
          <Text style={[pdfStyles.colQty, pdfStyles.textMuted]}>Počet</Text>
          <Text style={[pdfStyles.colUnit, pdfStyles.textMuted]}>MJ</Text>
          <Text style={[pdfStyles.colDesc, pdfStyles.textMuted]}>Popis</Text>
          <Text style={[pdfStyles.colUnitPrice, pdfStyles.textMuted]}>Cena za MJ</Text>
          <Text style={[pdfStyles.colTotal, pdfStyles.textMuted]}>Cena</Text>
        </View>

        {normalizedItems.map((item, index) => {
          const lineTotal = (Number(item.amount) || 0) * (Number(item.unitPrice) || 0);
          return (
            <View style={pdfStyles.tableRow} key={`${item.description}-${index}`}>
              <Text style={pdfStyles.colQty}>
                {item.amount ? formatNumber(Number(item.amount)) : ""}
              </Text>
              <Text style={pdfStyles.colUnit}>{item.unit}</Text>
              <Text style={pdfStyles.colDesc}>{item.description}</Text>
              <Text style={pdfStyles.colUnitPrice}>{formatCurrency(item.unitPrice)}</Text>
              <Text style={pdfStyles.colTotal}>{formatCurrency(lineTotal)}</Text>
            </View>
          );
        })}

        <View style={pdfStyles.summaryRow}>
          {qrCodeDataUrl ? (
            <View style={pdfStyles.qrBlock}>
              <Image style={pdfStyles.qrImage} src={qrCodeDataUrl} />
              <Text style={pdfStyles.qrLabel}>QR Platba</Text>
            </View>
          ) : (
            <View />
          )}
          <View style={pdfStyles.totalBlock}>
            <View style={pdfStyles.footerLine} />
            <View style={pdfStyles.totalRow}>
              <Text style={pdfStyles.totalValue}>{formatCurrency(invoiceTotal)}</Text>
            </View>
            {invoice.btcInvoice === Evolu.sqliteTrue ? (
              <View style={pdfStyles.btcNote}>
                <Text style={pdfStyles.btcNoteText}>Platbu je možné provést v BTC na adresu</Text>
                <Text style={pdfStyles.btcNoteText}>{invoice.btcAddress ?? ""}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={pdfStyles.footer}>
          <Text>Fyzická osoba zapsaná v živnostenském rejstříku.</Text>
          <Text>{[profile?.email, profile?.phone].filter(Boolean).join(" | ")}</Text>
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
    setPaymentDays(source?.paymentDays != null ? String(source.paymentDays) : "14");
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

  const updateItem = (index: number, field: keyof InvoiceItemForm, value: string) => {
    setItems((prev) => prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleSave = async () => {
    if (!invoice?.id) return;
    if (!trimmedInvoiceNumber) {
      alert("Please enter an invoice number");
      return;
    }
    if (!clientName.trim()) {
      alert("Please select a client");
      return;
    }
    if (!issueDate.trim()) {
      alert("Please select an issue date");
      return;
    }

    const paymentDaysNumber = Number(paymentDays);
    if (Number.isNaN(paymentDaysNumber) || paymentDaysNumber < 0) {
      alert("Payment days must be a non-negative number");
      return;
    }

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(new Date(issueDate));
    if (!issueDateResult.ok) {
      console.error("Issue date error:", formatTypeError(issueDateResult.error));
      alert("Invalid issue date");
      return;
    }

    let duzpValue: (typeof issueDateResult.value) | null = null;
    if (duzp.trim()) {
      const duzpResult = Evolu.dateToDateIso(new Date(duzp));
      if (!duzpResult.ok) {
        console.error("DUZP date error:", formatTypeError(duzpResult.error));
        alert("Invalid DUZP date");
        return;
      }
      duzpValue = duzpResult.value;
    }

    let paymentDateValue: (typeof issueDateResult.value) | null = null;
    if (paymentDate.trim()) {
      const paymentDateResult = Evolu.dateToDateIso(new Date(paymentDate));
      if (!paymentDateResult.ok) {
        console.error("Payment date error:", formatTypeError(paymentDateResult.error));
        alert("Invalid payment date");
        return;
      }
      paymentDateValue = paymentDateResult.value;
    }

    const paymentDaysResult = Evolu.NonNegativeNumber.from(paymentDaysNumber);
    if (!paymentDaysResult.ok) {
      console.error("Payment days error:", formatTypeError(paymentDaysResult.error));
      alert("Payment days must be a non-negative number");
      return;
    }

    if (hasDuplicateInvoiceNumber) {
      const confirmed = confirm("This invoice number already exists. Update anyway?");
      if (!confirmed) return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const normalizedItems = items
        .map((item) => ({
          amount: Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0,
          unit: item.unit.trim(),
          description: item.description.trim(),
          unitPrice: Number.isFinite(Number(item.unitPrice)) ? Number(item.unitPrice) : 0,
        }))
        .filter((item) => item.description || item.unit || item.amount || item.unitPrice);

      const itemsResult = Evolu.Json.from(JSON.stringify(normalizedItems));
      if (!itemsResult.ok) {
        console.error("Items error:", formatTypeError(itemsResult.error));
        alert("Invoice items are invalid");
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
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
        btcInvoice: btcInvoice ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        btcAddress: toNullable(btcAddress),
        items: itemsResult.value,
      });

      if (!result.ok) {
        console.error("Validation error:", formatTypeError(result.error));
        alert("Validation error while saving invoice");
        return;
      }

      setSaveMessage("Invoice updated successfully!");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating invoice:", error);
      alert("Error updating invoice");
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
      alert("Error clearing payment date");
      return;
    }

    setPaymentDate("");
  };

  const handleDelete = async () => {
    if (!invoice?.id) return;
    const confirmed = confirm("Delete this invoice? This action cannot be undone.");
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
        alert("Error deleting invoice");
        return;
      }
      onBack();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      alert("Error deleting invoice");
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
        alert("Invoice is missing a client name");
        return;
      }
      if (!invoice.issueDate) {
        alert("Invoice is missing an issue date");
        return;
      }
      if (invoice.paymentDays == null) {
        alert("Invoice is missing payment terms");
        return;
      }

      const payload = {
        invoiceNumber: nextInvoiceNumber,
        clientName: safeClientName,
        issueDate: invoice.issueDate,
        duzp: invoice.duzp ?? null,
        paymentDate: invoice.paymentDate,
        paymentDays: invoice.paymentDays,
        purchaseOrderNumber: invoice.purchaseOrderNumber,
        btcInvoice: invoice.btcInvoice ?? Evolu.sqliteFalse,
        btcAddress: invoice.btcAddress,
        items: invoice.items ?? Evolu.Json.orThrow("[]"),
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, { onlyValidate: true });
      if (!validation.ok) {
        console.error("Validation error:", validation.error);
        alert("Validation error while duplicating invoice");
        return;
      }

      const result = evolu.insert("invoice", payload);
      if (!result.ok) {
        console.error("Insert error:", result.error);
        alert("Error duplicating invoice");
        return;
      }

      setSaveMessage("Invoice duplicated successfully!");
    } catch (error) {
      console.error("Error duplicating invoice:", error);
      alert("Error duplicating invoice");
    } finally {
      setIsDuplicating(false);
    }
  };

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="max-w-3xl mx-auto px-4 py-12">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-gray-900">Invoice Details</h1>
              <button
                onClick={onBack}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                Back to list
              </button>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-600">
              Invoice not found.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Invoice Details</h1>
            <button
              onClick={onBack}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Back to list
            </button>
          </div>

          {saveMessage ? (
            <div className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800">
              {saveMessage}
            </div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="invoiceNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Invoice Number *
              </label>
              <input
                id="invoiceNumber"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 mb-2">
                Client *
              </label>
              <select
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              >
                <option value="">Select a client</option>
                {clients
                  .filter((client): client is { id: string; name: string } => Boolean(client.name))
                  .map((client) => (
                    <option key={client.id} value={client.name}>
                      {client.name}
                    </option>
                  ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-xs text-gray-500 mt-2">No active clients available.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="issueDate" className="block text-sm font-medium text-gray-700 mb-2">
                  Issue Date *
                </label>
                <input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
              </div>
              <div>
                <label htmlFor="paymentDays" className="block text-sm font-medium text-gray-700 mb-2">
                  Payment Days *
                </label>
                <input
                  id="paymentDays"
                  type="number"
                  min={0}
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
              </div>
            </div>

            <div>
              <label htmlFor="paymentDate" className="block text-sm font-medium text-gray-700 mb-2">
                Paid on
              </label>
              <input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            {profile?.vatPayer === Evolu.sqliteTrue ? (
              <div>
                <label htmlFor="duzp" className="block text-sm font-medium text-gray-700 mb-2">
                  DUZP
                </label>
                <input
                  id="duzp"
                  type="date"
                  value={duzp}
                  onChange={(e) => setDuzp(e.target.value)}
                  disabled={!isEditing}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="purchaseOrderNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Order Number
              </label>
              <input
                id="purchaseOrderNumber"
                type="text"
                value={purchaseOrderNumber}
                onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                disabled={!isEditing}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="btcInvoice"
                type="checkbox"
                checked={btcInvoice}
                onChange={(e) => setBtcInvoice(e.target.checked)}
                disabled={!isEditing}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:bg-gray-50"
              />
              <label htmlFor="btcInvoice" className="text-sm font-medium text-gray-700">
                Bitcoin invoice
              </label>
            </div>

            {btcInvoice ? (
              <div>
                <label htmlFor="btcAddress" className="block text-sm font-medium text-gray-700 mb-2">
                  BTC address
                </label>
                <input
                  id="btcAddress"
                  type="text"
                  value={btcAddress}
                  onChange={(e) => setBtcAddress(e.target.value)}
                  disabled={!isEditing}
                  placeholder="bc1..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                />
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Invoice Items</h2>
                <button
                  type="button"
                  onClick={addItem}
                  disabled={!isEditing}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                    !isEditing ? "bg-gray-200 text-gray-500" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Add Item
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`item-${index}-description`}
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          Description
                        </label>
                        <input
                          id={`item-${index}-description`}
                          type="text"
                          value={item.description}
                          onChange={(e) => updateItem(index, "description", e.target.value)}
                          disabled={!isEditing}
                          className="w-[455px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        />
                      </div>
                      <div>
                        <label htmlFor={`item-${index}-unit`} className="block text-sm font-medium text-gray-700 mb-2">
                          Unit
                        </label>
                        <input
                          id={`item-${index}-unit`}
                          type="text"
                          value={item.unit}
                          onChange={(e) => updateItem(index, "unit", e.target.value)}
                          disabled={!isEditing}
                          className="w-[455px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor={`item-${index}-amount`} className="block text-sm font-medium text-gray-700 mb-2">
                          Amount
                        </label>
                        <input
                          id={`item-${index}-amount`}
                          type="number"
                          min={0}
                          value={item.amount}
                          onChange={(e) => updateItem(index, "amount", e.target.value)}
                          disabled={!isEditing}
                          className="w-[455px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`item-${index}-unitPrice`}
                          className="block text-sm font-medium text-gray-700 mb-2"
                        >
                          Unit Price
                        </label>
                        <input
                          id={`item-${index}-unitPrice`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                          disabled={!isEditing}
                          className="w-[455px] px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={!isEditing || items.length === 1}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                          !isEditing || items.length === 1
                            ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                            : "bg-red-600 text-white hover:bg-red-700"
                        }`}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Total:</span>{" "}
              {formatUiTotal(invoiceTotal)}
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {pdfDocument ? (
              <PDFDownloadLink
                document={pdfDocument}
                fileName={`invoice-${invoiceNumberValue || invoice.id}.pdf`}
                className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold bg-gray-900 text-white hover:bg-gray-800 text-center"
              >
                {({ loading }) => (loading ? "Preparing PDF..." : "Export to PDF")}
              </PDFDownloadLink>
            ) : null}
            {!isEditing ? (
              <>
                <button
                  onClick={handleDuplicate}
                  disabled={isDuplicating}
                  className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition ${
                    isDuplicating
                      ? "bg-gray-300 text-gray-600"
                      : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
                >
                  {isDuplicating ? "Duplicating..." : "Duplicate"}
                </button>
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold bg-blue-600 text-white hover:bg-blue-700"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition ${
                    isDeleting ? "bg-gray-300 text-gray-600" : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                  className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition ${
                    isSaving ? "bg-gray-300 text-gray-600" : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleCancelPayment}
                  disabled={isSaving || isDeleting}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200"
                >
                  Cancel Payment
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving || isDeleting}
                  className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className={`w-full sm:w-auto px-6 py-3 rounded-lg font-semibold transition ${
                    isDeleting ? "bg-gray-300 text-gray-600" : "bg-red-600 text-white hover:bg-red-700"
                  }`}
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
