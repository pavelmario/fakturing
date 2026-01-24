import { use, useMemo } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

type InvoiceItem = {
  amount?: number;
  unitPrice?: number;
  description?: string;
};

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  paymentDate?: string | null;
  paymentDays: number;
  items: unknown;
};

type InvoiceListPageProps = {
  onCreateInvoice: () => void;
  onViewDetails: (invoiceId: string) => void;
};

const parseItems = (raw: unknown): InvoiceItem[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as InvoiceItem[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as InvoiceItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const formatDate = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString();
};

const formatTotal = (value: number): string => {
  if (!Number.isFinite(value)) return "0.00";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getInvoiceStatus = (invoice: InvoiceRow): "paid" | "overdue" | "unpaid" => {
  if (invoice.paymentDate) return "paid";
  const issueDate = new Date(invoice.issueDate);
  if (!Number.isNaN(issueDate.getTime())) {
    const dueDate = new Date(issueDate);
    const days = Number(invoice.paymentDays ?? 0);
    if (Number.isFinite(days)) {
      dueDate.setDate(dueDate.getDate() + days);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dueDate < today) return "overdue";
    }
  }
  return "unpaid";
};

export function InvoiceListPage({ onCreateInvoice, onViewDetails }: InvoiceListPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["id", "invoiceNumber", "clientName", "issueDate", "paymentDate", "paymentDays", "items"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc")
      ),
    [evolu, owner.id]
  );

  const invoices = useQuery(invoicesQuery) as InvoiceRow[];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <button
              onClick={onCreateInvoice}
              className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              Create Invoice
            </button>
          </div>

          {invoices.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-600">
              No invoices yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {invoices.map((invoice) => {
                const items = parseItems(invoice.items);
                const firstDescription = items.find((item) => item.description?.trim())?.description ?? "—";
                const total = items.reduce((sum, item) => {
                  const amount = Number(item.amount ?? 0);
                  const unitPrice = Number(item.unitPrice ?? 0);
                  if (!Number.isFinite(amount) || !Number.isFinite(unitPrice)) return sum;
                  return sum + amount * unitPrice;
                }, 0);
                const status = getInvoiceStatus(invoice);
                const statusStyles =
                  status === "paid"
                    ? "bg-emerald-100 text-emerald-800"
                    : status === "overdue"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800";

                return (
                  <div key={invoice.id} className="py-4 flex flex-col gap-2">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-gray-900">{invoice.invoiceNumber}</div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusStyles}`}>
                            {status}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">{invoice.clientName}</div>
                      </div>
                      <div className="text-sm text-gray-600">{formatDate(invoice.issueDate)}</div>
                    </div>
                    <div className="text-sm text-gray-700">{firstDescription}</div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">Total: {formatTotal(total)}</div>
                      <button
                        onClick={() => onViewDetails(invoice.id)}
                        className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
