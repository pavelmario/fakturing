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
  amount: number | null;
  expenseType: string | null;
  paymentMethod: string | null;
  receiptNumber: string | null;
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

const getPaymentMethodLabel = (
  value: string | null,
  t: (key: string) => string,
): string => {
  if (value === "cash") return t("expenses.paymentMethodCash");
  if (value === "bank") return t("expenses.paymentMethodBank");
  if (value === "card") return t("expenses.paymentMethodCard");
  return value || t("common.placeholderDash");
};

export function ExpensesListPage({
  onCreateExpense,
  onViewDetails,
}: ExpensesListPageProps) {
  const { t, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");

  const expensesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .select([
            "id",
            "amount",
            "expenseType",
            "paymentMethod",
            "receiptNumber",
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

  const availableExpenseTypes = useMemo(() => {
    const types = new Set<string>();
    for (const expense of expenses) {
      const type = expense.expenseType?.trim();
      if (type) types.add(type);
    }
    return Array.from(types).sort((a, b) => a.localeCompare(b, locale));
  }, [expenses, locale]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const type = expense.expenseType ?? "";
      const method = expense.paymentMethod ?? "";
      const receipt = expense.receiptNumber ?? "";

      if (typeFilter !== "all" && type !== typeFilter) return false;
      if (paymentMethodFilter !== "all" && method !== paymentMethodFilter)
        return false;

      if (!normalizedSearch) return true;

      const searchTarget = `${type} ${method} ${receipt}`.toLowerCase();
      return searchTarget.includes(normalizedSearch);
    });
  }, [expenses, normalizedSearch, paymentMethodFilter, typeFilter]);

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

          <details className="panel-card mb-6" open>
            <summary className="cursor-pointer text-sm font-semibold filters-summary">
              {t("expensesList.filters")} 🔎
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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

              <div>
                <label htmlFor="expenseTypeFilter" className="form-label">
                  {t("expensesList.typeFilterLabel")}
                </label>
                <select
                  id="expenseTypeFilter"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="form-select"
                >
                  <option value="all">{t("expensesList.typeFilterAll")}</option>
                  {availableExpenseTypes.map((expenseType) => (
                    <option key={expenseType} value={expenseType}>
                      {expenseType}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="expensePaymentMethodFilter" className="form-label">
                  {t("expensesList.paymentMethodFilterLabel")}
                </label>
                <select
                  id="expensePaymentMethodFilter"
                  value={paymentMethodFilter}
                  onChange={(event) => setPaymentMethodFilter(event.target.value)}
                  className="form-select"
                >
                  <option value="all">
                    {t("expensesList.paymentMethodFilterAll")}
                  </option>
                  <option value="cash">{t("expenses.paymentMethodCash")}</option>
                  <option value="bank">{t("expenses.paymentMethodBank")}</option>
                  <option value="card">{t("expenses.paymentMethodCard")}</option>
                </select>
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
                    <div className="text-lg font-semibold invoice-row-number">
                      {expense.expenseType ?? t("expensesList.unknownType")}
                    </div>
                    <div className="text-sm invoice-row-client mt-1">
                      {getPaymentMethodLabel(expense.paymentMethod, t)}
                    </div>
                    {expense.receiptNumber ? (
                      <div className="text-xs invoice-row-date mt-1">
                        {expense.receiptNumber}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col sm:items-end gap-2">
                    <div className="text-sm invoice-row-date">
                      {formatDate(expense.expenseDate, locale, t("common.placeholderDash"))}
                    </div>
                    <div className="text-sm font-semibold invoice-row-amount">
                      {formatAmount(expense.amount, locale)}
                    </div>
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
