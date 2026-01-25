import { use, useEffect, useMemo, useState } from "react";
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
  invoiceNumber: string | null;
  clientName: string | null;
  issueDate: string | null;
  paymentDate?: string | null;
  paymentDays: number | null;
  btcInvoice?: number | null;
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

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString();
};

const formatTotal = (value: number): string => {
  if (!Number.isFinite(value)) return "0,00 Kč";
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getInvoiceStatus = (invoice: InvoiceRow): "paid" | "overdue" | "unpaid" => {
  if (invoice.paymentDate) return "paid";
  if (!invoice.issueDate) return "unpaid";
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

const getYear = (iso: string | null): number | null => {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear();
};

export function InvoiceListPage({ onCreateInvoice, onViewDetails }: InvoiceListPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [statusFilters, setStatusFilters] = useState({ unpaid: true, overdue: true, paid: true });
  const [typeFilters, setTypeFilters] = useState({ bitcoin: true, nonBitcoin: true });

  const handleMarkPayment = (invoiceId: string) => {
    const paymentDateResult = Evolu.dateToDateIso(new Date());
    if (!paymentDateResult.ok) {
      console.error("Payment date error:", paymentDateResult.error);
      alert("Unable to set payment date");
      return;
    }

    const result = evolu.update("invoice", {
      id: invoiceId,
      paymentDate: paymentDateResult.value,
    });

    if (!result.ok) {
      console.error("Payment update error:", result.error);
      alert("Error updating payment date");
    }
  };

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
            "paymentDate",
            "paymentDays",
            "btcInvoice",
            "items",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc")
      ),
    [evolu, owner.id]
  );

  const invoices = useQuery(invoicesQuery) as readonly InvoiceRow[];

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const invoice of invoices) {
      const year = getYear(invoice.issueDate);
      if (year) years.add(year);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

  useEffect(() => {
    if (availableYears.length === 0) {
      setSelectedYear(null);
      return;
    }
    if (!selectedYear || !availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["discreteMode"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1)
      ),
    [evolu, owner.id]
  );

  const profileRows = useQuery(profileQuery);
  const isDiscreteMode = profileRows[0]?.discreteMode === Evolu.sqliteTrue;

  const currentYear = new Date().getFullYear();
  const stats = invoices.reduce(
    (acc, invoice) => {
      const items = parseItems(invoice.items);
      const total = items.reduce((sum, item) => {
        const amount = Number(item.amount ?? 0);
        const unitPrice = Number(item.unitPrice ?? 0);
        if (!Number.isFinite(amount) || !Number.isFinite(unitPrice)) return sum;
        return sum + amount * unitPrice;
      }, 0);

      const status = getInvoiceStatus(invoice);
      const year = getYear(invoice.issueDate);

      if (year === currentYear) {
        acc.year.count += 1;
        acc.year.total += total;
        if (status === "paid") {
          acc.paidYear.count += 1;
          acc.paidYear.total += total;
        }
      }

      if (status === "unpaid") {
        acc.unpaid.count += 1;
        acc.unpaid.total += total;
      } else if (status === "overdue") {
        acc.unpaid.count += 1;
        acc.unpaid.total += total;
        acc.overdue.count += 1;
        acc.overdue.total += total;
      }

      return acc;
    },
    {
      year: { count: 0, total: 0 },
      unpaid: { count: 0, total: 0 },
      overdue: { count: 0, total: 0 },
      paidYear: { count: 0, total: 0 },
    }
  );

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const status = getInvoiceStatus(invoice);
      if (status === "paid" && !statusFilters.paid) return false;
      if (status === "overdue" && !(statusFilters.overdue || statusFilters.unpaid)) return false;
      if (status === "unpaid" && !statusFilters.unpaid) return false;

      const isBtcInvoice = invoice.btcInvoice === Evolu.sqliteTrue;
      if (isBtcInvoice && !typeFilters.bitcoin) return false;
      if (!isBtcInvoice && !typeFilters.nonBitcoin) return false;

      if (selectedYear) {
        const year = getYear(invoice.issueDate);
        if (year !== selectedYear) return false;
      }

      return true;
    });
  }, [invoices, selectedYear, statusFilters, typeFilters]);

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs uppercase text-gray-500">Issued this year</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {stats.year.count} invoices
              </div>
              <div className="text-sm text-gray-700">
                Total: {isDiscreteMode ? "#####" : formatTotal(stats.year.total)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs uppercase text-gray-500">Unpaid</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {stats.unpaid.count} invoices
              </div>
              <div className="text-sm text-gray-700">
                Total: {isDiscreteMode ? "#####" : formatTotal(stats.unpaid.total)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs uppercase text-gray-500">Overdue</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {stats.overdue.count} invoices
              </div>
              <div className="text-sm text-gray-700">
                Total: {isDiscreteMode ? "#####" : formatTotal(stats.overdue.total)}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs uppercase text-gray-500">Paid this year</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">
                {stats.paidYear.count} invoices
              </div>
              <div className="text-sm text-gray-700">
                Total: {isDiscreteMode ? "#####" : formatTotal(stats.paidYear.total)}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex flex-col gap-2 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Year</span>
                <select
                  value={selectedYear ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedYear(value ? Number(value) : null);
                  }}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 ? (
                    <option value="">No years</option>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="flex flex-col gap-2 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Status</span>
                <div className="flex flex-wrap gap-3">
                  {(["unpaid", "overdue", "paid"] as const).map((status) => (
                    <label key={status} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={statusFilters[status]}
                        onChange={(event) =>
                          setStatusFilters((prev) => ({
                            ...prev,
                            [status]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span className="capitalize">{status}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Type</span>
                <div className="flex flex-wrap gap-3">
                  {([
                    { key: "nonBitcoin", label: "Fiat" },
                    { key: "bitcoin", label: "Bitcoin" },
                  ] as const).map((type) => (
                    <label key={type.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={typeFilters[type.key]}
                        onChange={(event) =>
                          setTypeFilters((prev) => ({
                            ...prev,
                            [type.key]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <span>{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-600">
              No invoices match the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => {
                const items = parseItems(invoice.items);
                const firstDescription = items.find((item) => item.description?.trim())?.description ?? "—";
                const total = items.reduce((sum, item) => {
                  const amount = Number(item.amount ?? 0);
                  const unitPrice = Number(item.unitPrice ?? 0);
                  if (!Number.isFinite(amount) || !Number.isFinite(unitPrice)) return sum;
                  return sum + amount * unitPrice;
                }, 0);
                const status = getInvoiceStatus(invoice);
                const isBtcInvoice = invoice.btcInvoice === Evolu.sqliteTrue;
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
                          <div className="text-lg font-semibold text-gray-900">
                            {invoice.invoiceNumber ?? "—"}&nbsp;
                          </div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${statusStyles}`}>
                            ({status})
                            {isBtcInvoice && <span className="ml-1 text-[#f7931a]">₿</span>}
                          </span>
                        </div>
                        <div className="text-sm text-gray-600">{invoice.clientName ?? "—"}</div>
                      </div>
                      <div className="text-sm text-gray-600">{formatDate(invoice.issueDate)}</div>
                    </div>
                    <div className="text-sm text-gray-700">{firstDescription}</div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm font-semibold text-gray-900">
                        Total: {isDiscreteMode ? "#####" : formatTotal(total)}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        {!invoice.paymentDate ? (
                          <button
                            onClick={() => handleMarkPayment(invoice.id)}
                            className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold transition bg-emerald-600 text-white hover:bg-emerald-700"
                          >
                            Mark Payment
                          </button>
                        ) : null}
                        <button
                          onClick={() => onViewDetails(invoice.id)}
                          className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                        >
                          View Details
                        </button>
                      </div>
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
