import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

type ExpensesListPageProps = {
  onCreateExpense: () => void;
  onViewDetails: (expenseId: string) => void;
};

type ExpenseRow = {
  id: string;
  amountWithoutVat: number | null;
  amountWithVat: number | null;
  description: string | null;
  expenseDate: string | null;
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

const formatAmount = (value: number | null, locale: string): string => {
  if (value == null || !Number.isFinite(value)) return "";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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

export function ExpensesListPage({
  onCreateExpense,
  onViewDetails,
}: ExpensesListPageProps) {
  const { t, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const resetDateFilters = () => {
    setDateFrom("");
    setDateTo("");
  };

  const expensesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .select([
            "id",
            "amountWithoutVat",
            "amountWithVat",
            "description",
            "expenseDate",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("expenseDate", "desc"),
      ),
    [evolu, owner.id],
  );

  const expenses = useQuery(expensesQuery) as readonly ExpenseRow[];

  const normalizedSearch = search.trim().toLowerCase();

  const toDateOnly = (value: string | null): string | null => {
    if (!value) return null;
    return value.includes("T") ? value.slice(0, 10) : value;
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const expenseDateOnly = toDateOnly(expense.expenseDate);

      if (dateFrom && (!expenseDateOnly || expenseDateOnly < dateFrom)) {
        return false;
      }

      if (dateTo && (!expenseDateOnly || expenseDateOnly > dateTo)) {
        return false;
      }

      if (!normalizedSearch) return true;

      const description = expense.description ?? "";
      return description.toLowerCase().includes(normalizedSearch);
    });
  }, [dateFrom, dateTo, expenses, normalizedSearch]);

  const monthStats = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (
          parsedDate.getFullYear() !== currentYear ||
          parsedDate.getMonth() !== currentMonth
        ) {
          return acc;
        }

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  const lastMonthStats = useMemo(() => {
    const now = new Date();
    const reference = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthYear = reference.getFullYear();
    const lastMonth = reference.getMonth();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (
          parsedDate.getFullYear() !== lastMonthYear ||
          parsedDate.getMonth() !== lastMonth
        ) {
          return acc;
        }

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  const yearStats = useMemo(() => {
    const currentYear = new Date().getFullYear();

    return expenses.reduce(
      (acc, expense) => {
        if (!expense.expenseDate) return acc;

        const parsedDate = new Date(expense.expenseDate);
        if (Number.isNaN(parsedDate.getTime())) return acc;
        if (parsedDate.getFullYear() !== currentYear) return acc;

        acc.count += 1;
        const amountWithVat = Number(expense.amountWithVat ?? 0);
        if (Number.isFinite(amountWithVat)) {
          acc.total += amountWithVat;
        }

        return acc;
      },
      { count: 0, total: 0 },
    );
  }, [expenses]);

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-card-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <p className="section-title">{t("expensesList.sectionTitle")}</p>
              <h1 className="page-title">{t("expensesList.title")}</h1>
            </div>
            <button
              onClick={onCreateExpense}
              className="btn-primary w-full sm:w-auto"
            >
              {t("expensesList.create")}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="stat-card">
              <div className="section-title">{t("expensesList.statMonth")}</div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  monthStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">
                {t("expensesList.statLastMonth")}
              </div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  lastMonthStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="section-title">{t("expensesList.statYear")}</div>
              <div className="mt-2 text-lg font-semibold stat-count">
                {formatTotal(
                  yearStats.total,
                  locale,
                  t("expensesList.currencyFallback"),
                )}
              </div>
            </div>
          </div>

          <details className="panel-card mb-6">
            <summary className="cursor-pointer text-sm font-semibold filters-summary">
              {t("expensesList.filters")} 🔎
            </summary>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="expenseSearch" className="form-label">
                  {t("expensesList.searchLabel")}
                </label>
                <input
                  id="expenseSearch"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("expensesList.searchPlaceholder")}
                  className="form-input"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="expenseDateFrom" className="form-label">
                    {t("expensesList.dateFromLabel")}
                  </label>
                  <input
                    id="expenseDateFrom"
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <label htmlFor="expenseDateTo" className="form-label">
                    {t("expensesList.dateToLabel")}
                  </label>
                  <input
                    id="expenseDateTo"
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="form-input"
                  />
                </div>

                <div>
                  <div
                    className="hidden md:block form-label invisible"
                    aria-hidden="true"
                  >
                    {t("expensesList.dateToLabel")}
                  </div>
                  <button
                    type="button"
                    onClick={resetDateFilters}
                    disabled={!dateFrom && !dateTo}
                    className="mt-3 w-full text-left text-sm font-medium text-blue-600 underline underline-offset-2 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                  >
                    {t("expensesList.resetDateFilters")}
                  </button>
                </div>
              </div>
            </div>
          </details>

          {filteredExpenses.length === 0 ? (
            <div className="empty-state">
              {expenses.length === 0
                ? t("expensesList.emptyNone")
                : t("expensesList.emptyNoMatch")}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className="list-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <div className="text-sm invoice-row-date mb-1">
                      {formatDate(
                        expense.expenseDate,
                        locale,
                        t("common.placeholderDash"),
                      )}
                    </div>
                    <div className="text-lg font-semibold invoice-row-number">
                      {expense.description ?? t("expensesList.unknownType")}
                    </div>
                    <div className="text-sm font-semibold invoice-row-amount">
                      {formatAmount(expense.amountWithVat, locale)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end gap-2">
                    <button
                      onClick={() => onViewDetails(expense.id)}
                      className="btn-secondary w-full sm:w-auto"
                    >
                      {t("expensesList.detail")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
