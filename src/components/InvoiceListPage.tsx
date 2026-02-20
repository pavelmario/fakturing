import { useEffect, useMemo, useState } from "react";
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
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
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

const formatDate = (
  iso: string | null,
  locale: string,
  placeholder: string,
): string => {
  if (!iso) return placeholder;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString(locale);
};

const formatTotal = (
  value: number,
  locale: string,
  fallback: string,
): string => {
  if (!Number.isFinite(value)) return fallback;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const getInvoiceStatus = (
  invoice: InvoiceRow,
): "paid" | "overdue" | "unpaid" => {
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

export function InvoiceListPage({
  onCreateInvoice,
  onViewDetails,
  t,
  locale,
}: InvoiceListPageProps) {
  const evolu = useEvolu();

  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [statusFilters, setStatusFilters] = useState({
    unpaid: true,
    overdue: true,
    paid: true,
  });
  const [typeFilters, setTypeFilters] = useState({
    bitcoin: true,
    nonBitcoin: true,
  });

  const handleMarkPayment = (invoiceId: string) => {
    const paymentDateResult = Evolu.dateToDateIso(new Date());
    if (!paymentDateResult.ok) {
      console.error("Payment date error:", paymentDateResult.error);
      alert(t("invoicesList.alertPaymentDateError"));
      return;
    }

    const result = evolu.update("invoice", {
      id: invoiceId,
      paymentDate: paymentDateResult.value,
    });

    if (!result.ok) {
      console.error("Payment update error:", result.error);
      alert(t("invoicesList.alertPaymentUpdateError"));
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
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "desc"),
      ),
    [evolu],
  );

  const invoices =
    ((useQuery(invoicesQuery) ?? []) as readonly InvoiceRow[]) || [];

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
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu],
  );

  const profileRows = useQuery(profileQuery) ?? [];
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
    },
  );

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const status = getInvoiceStatus(invoice);
      if (status === "paid" && !statusFilters.paid) return false;
      if (
        status === "overdue" &&
        !(statusFilters.overdue || statusFilters.unpaid)
      )
        return false;
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
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-card-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <p className="section-title">{t("invoicesList.sectionTitle")}</p>
              <h1 className="page-title">{t("invoicesList.title")}</h1>
            </div>
            <button
              onClick={onCreateInvoice}
              className="btn-primary w-full sm:w-auto"
            >
              {t("invoicesList.create")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="stat-card">
              <div className="section-title">{t("invoicesList.statYear")}</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.year.count}
              </div>
              <div className="text-sm text-slate-700">
                {t("invoicesList.statPrefix")}{" "}
                {isDiscreteMode
                  ? t("common.discreteMask")
                  : formatTotal(
                      stats.year.total,
                      locale,
                      t("invoicesList.currencyFallback"),
                    )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">
                {t("invoicesList.statUnpaid")}
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.unpaid.count}
              </div>
              <div className="text-sm text-slate-700">
                {t("invoicesList.statPrefix")}{" "}
                {isDiscreteMode
                  ? t("common.discreteMask")
                  : formatTotal(
                      stats.unpaid.total,
                      locale,
                      t("invoicesList.currencyFallback"),
                    )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">
                {t("invoicesList.statOverdue")}
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.overdue.count}
              </div>
              <div className="text-sm text-slate-700">
                {t("invoicesList.statPrefix")}{" "}
                {isDiscreteMode
                  ? t("common.discreteMask")
                  : formatTotal(
                      stats.overdue.total,
                      locale,
                      t("invoicesList.currencyFallback"),
                    )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">
                {t("invoicesList.statPaidYear")}
              </div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {stats.paidYear.count}
              </div>
              <div className="text-sm text-slate-700">
                {t("invoicesList.statPrefix")}{" "}
                {isDiscreteMode
                  ? t("common.discreteMask")
                  : formatTotal(
                      stats.paidYear.total,
                      locale,
                      t("invoicesList.currencyFallback"),
                    )}
              </div>
            </div>
          </div>

          <details className="panel-card mb-6">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {t("invoicesList.filters")}
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <label className="flex flex-col gap-2 text-sm text-gray-700">
                <span className="font-semibold text-slate-900">
                  {t("invoicesList.year")}
                </span>
                <select
                  value={selectedYear ?? ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSelectedYear(value ? Number(value) : null);
                  }}
                  className="form-select"
                  disabled={availableYears.length === 0}
                >
                  {availableYears.length === 0 ? (
                    <option value="">{t("invoicesList.yearEmpty")}</option>
                  ) : (
                    availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <div className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">
                  {t("invoicesList.status")}
                </span>
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
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>
                        {status === "paid"
                          ? t("invoicesList.statusPaid")
                          : status === "overdue"
                            ? t("invoicesList.statusOverdue")
                            : t("invoicesList.statusUnpaid")}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">
                  {t("invoicesList.paymentType")}
                </span>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      {
                        key: "nonBitcoin",
                        label: t("invoicesList.paymentTypeFiat"),
                      },
                      {
                        key: "bitcoin",
                        label: t("invoicesList.paymentTypeBitcoin"),
                      },
                    ] as const
                  ).map((type) => (
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
                        className="h-4 w-4 rounded border-slate-300 text-blue-600"
                      />
                      <span>{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </details>

          {filteredInvoices.length === 0 ? (
            <div className="empty-state">
              {invoices.length === 0
                ? t("invoicesList.emptyNone")
                : t("invoicesList.emptyNoMatch")}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvoices.map((invoice) => {
                const items = parseItems(invoice.items);
                const total = items.reduce((sum, item) => {
                  const amount = Number(item.amount ?? 0);
                  const unitPrice = Number(item.unitPrice ?? 0);
                  if (!Number.isFinite(amount) || !Number.isFinite(unitPrice))
                    return sum;
                  return sum + amount * unitPrice;
                }, 0);
                const status = getInvoiceStatus(invoice);
                const isBtcInvoice = invoice.btcInvoice === Evolu.sqliteTrue;
                const statusStyles =
                  status === "paid"
                    ? "status-badge status-paid"
                    : status === "overdue"
                      ? "status-badge status-overdue"
                      : "status-badge status-unpaid";

                return (
                  <div
                    key={invoice.id}
                    className="list-card flex flex-col gap-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-lg font-semibold text-slate-900">
                            {invoice.invoiceNumber ??
                              t("common.placeholderDash")}
                            &nbsp;
                          </div>
                          <span className={statusStyles}>
                            {status === "paid"
                              ? t("invoicesList.statusPaid")
                              : status === "overdue"
                                ? t("invoicesList.statusOverdue")
                                : t("invoicesList.statusUnpaid")}
                            {isBtcInvoice && (
                              <span className="ml-1 text-[#f7931a]">₿</span>
                            )}
                          </span>
                        </div>
                        <div className="text-sm text-slate-600">
                          {invoice.clientName ?? t("common.placeholderDash")}
                        </div>
                      </div>
                      <div className="text-sm text-slate-600">
                        {formatDate(
                          invoice.issueDate,
                          locale,
                          t("common.placeholderDash"),
                        )}
                      </div>
                    </div>
                    {/* Description removed as requested */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-900">
                        {isDiscreteMode
                          ? t("common.discreteMask")
                          : formatTotal(
                              total,
                              locale,
                              t("invoicesList.currencyFallback"),
                            )}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        {!invoice.paymentDate ? (
                          <button
                            onClick={() => handleMarkPayment(invoice.id)}
                            className="btn-success w-full sm:w-auto"
                          >
                            {t("invoicesList.markPaid")}
                          </button>
                        ) : null}
                        <button
                          onClick={() => onViewDetails(invoice.id)}
                          className="btn-secondary w-full sm:w-auto"
                        >
                          {t("invoicesList.detail")}
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
