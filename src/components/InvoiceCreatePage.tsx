import { use, useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

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

const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
});

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
      }))
      .filter(
        (item) =>
          item.description || item.unit || item.amount || item.unitPrice,
      );
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

export function InvoiceCreatePage() {
  const searchParams =
    typeof window === "undefined"
      ? new URLSearchParams("")
      : new URLSearchParams(window.location.search);
  const getParam = (key: string) => searchParams.get(key);

  const initialInvoiceNumber =
    getParam("invoiceNumber") ?? getParam("number") ?? "";
  const initialClientName = getParam("clientName") ?? getParam("client") ?? "";
  const initialIssueDate = getParam("issueDate") ?? getParam("date") ?? "";
  const initialPaymentDays = getParam("paymentDays") ?? "";
  const initialPurchaseOrderNumber =
    getParam("purchaseOrderNumber") ?? getParam("po") ?? "";
  const initialBtcInvoice =
    parseBooleanParam(getParam("btcInvoice") ?? getParam("bitcoin")) ?? false;
  const initialBtcAddress = getParam("btcAddress") ?? "";
  const initialItems = parseItemsParam(getParam("items")) ?? [emptyItem()];

  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [clientName, setClientName] = useState(initialClientName);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [paymentDays, setPaymentDays] = useState(initialPaymentDays || "14");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(
    initialPurchaseOrderNumber,
  );
  const [btcInvoice, setBtcInvoice] = useState(initialBtcInvoice);
  const [btcAddress, setBtcAddress] = useState(initialBtcAddress);
  const [items, setItems] = useState<InvoiceItemForm[]>(initialItems);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profileRows = useQuery(profileQuery);
  const profile = profileRows[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;

  const currentYear = new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;
  const yearPrefixPattern = useMemo(
    () => Evolu.NonEmptyTrimmedString100.orThrow(`${yearPrefix}%`),
    [yearPrefix],
  );
  const latestInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .where("invoiceNumber", "like", yearPrefixPattern)
          .orderBy("invoiceNumber", "desc")
          .limit(1),
      ),
    [evolu, owner.id, yearPrefixPattern],
  );

  const latestInvoiceRows = useQuery(latestInvoiceQuery);
  const latestInvoiceNumber = latestInvoiceRows[0]?.invoiceNumber ?? "";

  const trimmedInvoiceNumber = invoiceNumber.trim();
  const invoiceNumberResult = useMemo(
    () => Evolu.NonEmptyTrimmedString100.from(trimmedInvoiceNumber),
    [trimmedInvoiceNumber],
  );
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
    invoiceNumberResult.ok &&
    duplicateInvoices.some((row) => row.invoiceNumber === trimmedInvoiceNumber),
  );

  useEffect(() => {
    if (issueDate) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    setIssueDate(todayIso);
  }, [issueDate]);

  useEffect(() => {
    if (invoiceNumber.trim()) return;

    let nextNumber = 1;
    if (latestInvoiceNumber.startsWith(yearPrefix)) {
      const parts = latestInvoiceNumber.split("-");
      const suffix = parts[parts.length - 1];
      const parsed = Number.parseInt(suffix, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        nextNumber = parsed + 1;
      }
    }

    const padded = String(nextNumber).padStart(4, "0");
    setInvoiceNumber(`${currentYear}-${padded}`);
  }, [currentYear, invoiceNumber, latestInvoiceNumber, yearPrefix]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

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
    setSaveMessage(null);

    if (!trimmedInvoiceNumber) {
      alert("Zadejte číslo faktury");
      return;
    }
    if (!clientName.trim()) {
      alert("Vyberte klienta");
      return;
    }
    if (!issueDate.trim()) {
      alert("Zadejte datum vystavení");
      return;
    }

    const paymentDaysNumber = Number(paymentDays);
    if (Number.isNaN(paymentDaysNumber) || paymentDaysNumber < 0) {
      alert("Počet dní splatnosti musí být kladné číslo");
      return;
    }

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(new Date(issueDate));
    if (!issueDateResult.ok) {
      console.error(
        "Issue date error:",
        formatTypeError(issueDateResult.error),
      );
      alert("Neplatné datum vystavení");
      return;
    }

    const paymentDaysResult = Evolu.NonNegativeNumber.from(paymentDaysNumber);
    if (!paymentDaysResult.ok) {
      console.error(
        "Payment days error:",
        formatTypeError(paymentDaysResult.error),
      );
      alert("Počet dní splatnosti musí být kladné číslo");
      return;
    }

    if (hasDuplicateInvoiceNumber) {
      const confirmed = confirm(
        "Toto číslo faktury již existuje. Přesto uložit?",
      );
      if (!confirmed) return;
    }

    setIsSaving(true);
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
        }))
        .filter(
          (item) =>
            item.description || item.unit || item.amount || item.unitPrice,
        );

      const itemsResult = Evolu.Json.from(JSON.stringify(normalizedItems));
      if (!itemsResult.ok) {
        console.error("Items error:", formatTypeError(itemsResult.error));
        alert("Položky faktury jsou neplatné");
        return;
      }

      const payload = {
        invoiceNumber: trimmedInvoiceNumber,
        clientName: clientName.trim(),
        issueDate: issueDateResult.value,
        duzp: isVatPayer ? issueDateResult.value : null,
        paymentDays: paymentDaysResult.value,
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
        btcInvoice: btcInvoice ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        btcAddress: toNullable(btcAddress),
        items: itemsResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, {
        onlyValidate: true,
      });
      if (!validation.ok) {
        console.error("Validation error:", formatTypeError(validation.error));
        console.error("Invoice payload:", payload);
        alert("Chyba validace při ukládání faktury");
        return;
      }

      const result = evolu.insert("invoice", payload);

      if (!result.ok) {
        console.error("Validation error:", formatTypeError(result.error));
        alert("Chyba validace při ukládání faktury");
        return;
      }

      setSaveMessage("Faktura úspěšně uložena!");
      setInvoiceNumber("");
      setClientName("");
      setIssueDate("");
      setPaymentDays("14");
      setPurchaseOrderNumber("");
      setBtcInvoice(false);
      setBtcAddress("");
      setItems([emptyItem()]);
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("Error saving invoice");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-card-lg">
          <div className="mb-6">
            <p className="section-title">Nová</p>
            <h1 className="page-title">Faktura</h1>
          </div>

          {saveMessage ? (
            <div className="mb-6 alert-success">{saveMessage}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="invoiceNumber" className="form-label">
                Číslo faktury *
              </label>
              <input
                id="invoiceNumber"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-2026-001"
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="clientName" className="form-label">
                Klient *
              </label>
              <select
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="form-select"
              >
                <option value="">Vyberte klienta</option>
                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.name ?? ""}
                    disabled={!client.name}
                  >
                    {client.name ?? "Nepojmenovaný klient"}
                  </option>
                ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-xs text-slate-500 mt-2">
                  Žádní klienti nejsou k dispozici.
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <input
                id="btcInvoice"
                type="checkbox"
                checked={btcInvoice}
                onChange={(e) => setBtcInvoice(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="btcInvoice"
                className="text-sm font-medium text-slate-700"
              >
                Fakturuji v bitcoinu
              </label>
            </div>

            {btcInvoice ? (
              <div>
                <label htmlFor="btcAddress" className="form-label">
                  Adresa příjemce
                </label>
                <input
                  id="btcAddress"
                  type="text"
                  value={btcAddress}
                  onChange={(e) => setBtcAddress(e.target.value)}
                  placeholder="bc1..."
                  className="form-input"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="issueDate" className="form-label">
                  Datum vystavení *
                </label>
                <input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label htmlFor="paymentDays" className="form-label">
                  Dní splatnosti *
                </label>
                <input
                  id="paymentDays"
                  type="number"
                  min={0}
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="purchaseOrderNumber" className="form-label">
                Číslo objednávky
              </label>
              <input
                id="purchaseOrderNumber"
                type="text"
                value={purchaseOrderNumber}
                onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                placeholder="Obj-12345"
                className="form-input"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  Fakturované položky
                </h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="btn-secondary"
                >
                  Přidat položku
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="panel-card space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`item-${index}-description`}
                          className="form-label"
                        >
                          Popis
                        </label>
                        <input
                          id={`item-${index}-description`}
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            updateItem(index, "description", e.target.value)
                          }
                          placeholder="Služba nebo produkt"
                          className="form-input"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`item-${index}-unit`}
                          className="form-label"
                        >
                          Jednotka
                        </label>
                        <input
                          id={`item-${index}-unit`}
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(index, "unit", e.target.value)
                          }
                          placeholder="hodiny, kusy"
                          className="form-input"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`item-${index}-amount`}
                          className="form-label"
                        >
                          Množství
                        </label>
                        <input
                          id={`item-${index}-amount`}
                          type="number"
                          min={0}
                          value={item.amount}
                          onChange={(e) =>
                            updateItem(index, "amount", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`item-${index}-unitPrice`}
                          className="form-label"
                        >
                          Cena za jednotku
                        </label>
                        <input
                          id={`item-${index}-unitPrice`}
                          type="number"
                          min={0}
                          step="0.1"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(index, "unitPrice", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="btn-danger"
                      >
                        Odstranit položku
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary mt-6 w-full"
          >
            {isSaving ? "Ukládám..." : "Uložit fakturu"}
          </button>
        </div>
      </div>
    </div>
  );
}
