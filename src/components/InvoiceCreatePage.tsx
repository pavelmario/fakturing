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

const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
});

export function InvoiceCreatePage() {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [paymentDays, setPaymentDays] = useState("14");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [items, setItems] = useState<InvoiceItemForm[]>([emptyItem()]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["name"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc")
      ),
    [evolu, owner.id]
  );

  const clients = useQuery(clientsQuery);

  const currentYear = new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;
  const latestInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .where("invoiceNumber", "like", `${yearPrefix}%`)
          .orderBy("invoiceNumber", "desc")
          .limit(1)
      ),
    [evolu, owner.id, yearPrefix]
  );

  const latestInvoiceRows = useQuery(latestInvoiceQuery);
  const latestInvoiceNumber = latestInvoiceRows[0]?.invoiceNumber ?? "";

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

  const updateItem = (index: number, field: keyof InvoiceItemForm, value: string) => {
    setItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, [field]: value } : item))
    );
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index)));
  };

  const handleSave = async () => {
    setSaveMessage(null);

    if (!invoiceNumber.trim()) {
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

    const paymentDaysResult = Evolu.NonNegativeNumber.from(paymentDaysNumber);
    if (!paymentDaysResult.ok) {
      console.error("Payment days error:", formatTypeError(paymentDaysResult.error));
      alert("Payment days must be a non-negative number");
      return;
    }

    setIsSaving(true);
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

      const payload = {
        invoiceNumber: invoiceNumber.trim(),
        clientName: clientName.trim(),
        issueDate: issueDateResult.value,
        paymentDays: paymentDaysResult.value,
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
        items: itemsResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, { onlyValidate: true });
      if (!validation.ok) {
        console.error("Validation error:", formatTypeError(validation.error));
        console.error("Invoice payload:", payload);
        alert("Validation error while saving invoice");
        return;
      }

      const result = evolu.insert("invoice", payload);

      if (!result.ok) {
        console.error("Validation error:", formatTypeError(result.error));
        alert("Validation error while saving invoice");
        return;
      }

      setSaveMessage("Invoice saved successfully!");
      setInvoiceNumber("");
      setClientName("");
      setIssueDate("");
      setPaymentDays("14");
      setPurchaseOrderNumber("");
      setItems([emptyItem()]);
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert("Error saving invoice");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Create Invoice</h1>

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
                placeholder="INV-2026-001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a client</option>
                {clients.map((client) => (
                  <option key={client.name} value={client.name}>
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label htmlFor="purchaseOrderNumber" className="block text-sm font-medium text-gray-700 mb-2">
                Purchase Order Number
              </label>
              <input
                id="purchaseOrderNumber"
                type="text"
                value={purchaseOrderNumber}
                onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                placeholder="PO-12345"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900">Invoice Items</h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200"
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
                          placeholder="Service or product"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                          placeholder="hours, pcs"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label htmlFor={`item-${index}-unitPrice`} className="block text-sm font-medium text-gray-700 mb-2">
                          Unit Price
                        </label>
                        <input
                          id={`item-${index}-unitPrice`}
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                          items.length === 1
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
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`mt-6 w-full font-semibold py-3 px-4 rounded-lg transition ${
              isSaving
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {isSaving ? "Saving..." : "Save Invoice"}
          </button>
        </div>
      </div>
    </div>
  );
}
