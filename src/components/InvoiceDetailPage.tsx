import { use, useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
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

export function InvoiceDetailPage({ invoiceId, onBack }: InvoiceDetailPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [clientName, setClientName] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentDays, setPaymentDays] = useState("14");
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState("");
  const [items, setItems] = useState<InvoiceItemForm[]>([emptyItem()]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
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

  const invoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .selectAll()
          .where("id", "=", invoiceId)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1)
      ),
    [evolu, invoiceId, owner.id]
  );

  const invoiceRows = useQuery(invoiceQuery);
  const invoice = invoiceRows[0] ?? null;

  const hydrateForm = (source: typeof invoice) => {
    setInvoiceNumber(source?.invoiceNumber ?? "");
    setClientName(source?.clientName ?? "");
    setIssueDate(toDateInputValue(source?.issueDate ?? ""));
    setPaymentDate(toDateInputValue(source?.paymentDate ?? ""));
    setPaymentDays(source?.paymentDays != null ? String(source.paymentDays) : "14");
    setPurchaseOrderNumber(source?.purchaseOrderNumber ?? "");
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
        invoiceNumber: invoiceNumber.trim(),
        clientName: clientName.trim(),
        issueDate: issueDateResult.value,
        paymentDate: paymentDateValue,
        paymentDays: paymentDaysResult.value,
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
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
                Payment Date
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
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
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
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
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {!isEditing ? (
              <>
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
