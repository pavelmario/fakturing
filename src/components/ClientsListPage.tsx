import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { ArrowDown, ArrowUp, Plus, Search } from "lucide-react";
import { SortChips } from "./invoices/SortChips";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";
import { clientTotals, emptyTotals, type ClientInvoice } from "../lib/clientStats";
import { formatDate } from "../lib/invoice";
import { formatAmount } from "../lib/money";

type ClientsListPageProps = {
  onViewDetails: (clientId: string) => void;
  onCreateClient: () => void;
};

type SortKey = "name" | "invoiced" | "unpaid" | "lastIssue";

/* One row can hold more than one currency; each is shown on its own line
   rather than summed into a meaningless figure. */
const lines = (amounts: Map<string, number>) =>
  [...amounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

/* Only for ordering rows — never displayed, so mixing currencies is fine. */
const sum = (amounts: Map<string, number>) =>
  [...amounts.values()].reduce((total, value) => total + value, 0);

export function ClientsListPage({
  onViewDetails,
  onCreateClient,
}: ClientsListPageProps) {
  const { t, tp, locale } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastIssue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer", "discreteMode"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );
  const profile = useQuery(profileQuery)[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isDiscreteMode = profile?.discreteMode === Evolu.sqliteTrue;

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name", "email", "phone", "companyIdentificationNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );
  const clients = useQuery(clientsQuery);

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select([
            "clientName",
            "clientId",
            "currency",
            "issueDate",
            "paymentDate",
            "paymentDays",
            "items",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );
  const invoices = useQuery(invoicesQuery) as readonly ClientInvoice[];

  /* Renamed clients keep their history: totals join by id where an invoice
     has one, falling back to the stored name for older rows. */
  const nameById = useMemo(
    () =>
      new Map(
        clients
          .filter((client) => client.name)
          .map((client) => [client.id, client.name as string]),
      ),
    [clients],
  );

  const totals = useMemo(
    () => clientTotals(invoices, isVatPayer, nameById),
    [invoices, isVatPayer, nameById],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = clients
      .map((client) => ({
        ...client,
        stats: totals.get(client.name ?? "") ?? emptyTotals(),
      }))
      .filter((client) => {
        if (!needle) return true;
        return [client.name, client.email, client.companyIdentificationNumber]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      });

    const dir = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "invoiced":
          return dir * (sum(a.stats.invoiced) - sum(b.stats.invoiced));
        case "unpaid":
          return dir * (sum(a.stats.unpaid) - sum(b.stats.unpaid));
        case "lastIssue":
          return dir * (a.stats.lastIssue - b.stats.lastIssue);
        default:
          return dir * (a.name ?? "").localeCompare(b.name ?? "", locale);
      }
    });
    return list;
  }, [clients, locale, search, sortDir, sortKey, totals]);

  const amount = (value: number) =>
    isDiscreteMode ? t("common.discreteMask") : formatAmount(value, locale);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const header = (label: string, key: SortKey, align?: "right") => (
    <th style={align === "right" ? { textAlign: "right" } : undefined}>
      <button
        type="button"
        className="ledger-sort"
        data-active={sortKey === key}
        onClick={() => toggleSort(key)}
      >
        {align === "right" ? null : label}
        {sortKey === key && sortDir === "asc" ? <ArrowUp /> : <ArrowDown />}
        {align === "right" ? label : null}
      </button>
    </th>
  );

  const sortKeys: readonly { key: SortKey; label: string }[] = [
    { key: "name", label: t("clientsList.colName") },
    { key: "lastIssue", label: t("clientsList.colLast") },
    { key: "invoiced", label: t("clientsList.colInvoiced") },
    { key: "unpaid", label: t("clientsList.colUnpaid") },
  ];

  /* The rail flags clients who owe you money. */
  const railStatus = (stats: (typeof rows)[number]["stats"]) =>
    stats.overdueCount > 0
      ? "overdue"
      : stats.unpaid.size > 0
        ? "unpaid"
        : "paid";

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-head">
          <h1 className="page-title">{t("clientsList.title")}</h1>
          <button onClick={onCreateClient} className="btn-primary">
            <Plus />
            {t("clientsList.create")}
          </button>
        </div>

        <div className="filter-bar">
          <div className="search-field">
            <Search />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("clientsList.searchPlaceholder")}
              aria-label={t("clientsList.searchLabel")}
            />
          </div>
          <div className="filter-bar-tail">
            <span className="filter-count">
              {rows.length} {tp("clientsList.clientCount", rows.length)}
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="empty-state">
            {clients.length === 0
              ? t("clientsList.emptyNone")
              : t("clientsList.emptyNoMatch")}
          </div>
        ) : (
          <>
            <SortChips
              keys={sortKeys}
              activeKey={sortKey}
              dir={sortDir}
              onPick={toggleSort}
            />

            <div className="ledger-wrap">
            <table className="ledger">
              <thead>
                <tr>
                  <th className="ledger-rail" style={{ borderBottom: 0 }} />
                  {header(t("clientsList.colName"), "name")}
                  <th>{t("clientsForm.companyIdLabel")}</th>
                  {header(t("clientsList.colLast"), "lastIssue")}
                  <th className="num-col">{t("clientsList.colCount")}</th>
                  {header(t("clientsList.colInvoiced"), "invoiced", "right")}
                  {header(t("clientsList.colUnpaid"), "unpaid", "right")}
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => (
                  <tr
                    key={client.id}
                    data-status={railStatus(client.stats)}
                    onClick={() => onViewDetails(client.id)}
                  >
                    <td className="ledger-rail">
                      <span />
                    </td>
                    <td className="ledger-client">
                      {client.name ?? t("clientsList.unnamed")}
                    </td>
                    <td className="ledger-date">
                      {client.companyIdentificationNumber ??
                        t("common.placeholderDash")}
                    </td>
                    <td className="ledger-date">
                      {client.stats.lastIssue
                        ? formatDate(
                            new Date(client.stats.lastIssue).toISOString(),
                            locale,
                          )
                        : t("common.placeholderDash")}
                    </td>
                    <td className="ledger-amount">{client.stats.count}</td>
                    <td className="ledger-amount">
                      {lines(client.stats.invoiced).map(([code, value]) => (
                        <div key={code}>
                          {amount(value)}
                          <span className="cur">{code}</span>
                        </div>
                      ))}
                    </td>
                    <td className="ledger-amount">
                      {lines(client.stats.unpaid).length ? (
                        lines(client.stats.unpaid).map(([code, value]) => (
                          <div
                            key={code}
                            className="lstate"
                            data-state={
                              client.stats.overdueCount > 0
                                ? "overdue"
                                : "unpaid"
                            }
                          >
                            {amount(value)}
                            <span className="cur">{code}</span>
                          </div>
                        ))
                      ) : (
                        <span className="ink-faint">
                          {t("common.placeholderDash")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>

            {/* Seven columns do not survive a phone; the same three facts —
                who, how much, how much still owed — become one card. */}
            <ul className="lcards">
              {rows.map((client) => (
                <li
                  key={client.id}
                  className="lcard"
                  data-status={railStatus(client.stats)}
                >
                  <button
                    type="button"
                    className="lcard-open"
                    onClick={() => onViewDetails(client.id)}
                  >
                    <span className="lcard-line">
                      <span className="lcard-client">
                        {client.name ?? t("clientsList.unnamed")}
                      </span>
                      <span className="lcard-amount num">
                        {lines(client.stats.invoiced).length
                          ? lines(client.stats.invoiced).map(([code, value]) => (
                              <span key={code} className="lcard-money">
                                {amount(value)}
                                <span className="cur">{code}</span>
                              </span>
                            ))
                          : t("common.placeholderDash")}
                      </span>
                    </span>
                    <span className="lcard-line lcard-meta">
                      <span className="ledger-date">
                        {client.companyIdentificationNumber
                          ? `${t("clientsForm.companyIdLabel")} ${client.companyIdentificationNumber} · `
                          : ""}
                        {client.stats.count}{" "}
                        {tp("invoicesList.invoiceCount", client.stats.count)}
                      </span>
                      {/* The list's default order is by last invoice, so the
                          card has to show the date it is sorted on. */}
                      <span className="ledger-date">
                        {client.stats.lastIssue
                          ? formatDate(
                              new Date(client.stats.lastIssue).toISOString(),
                              locale,
                            )
                          : t("common.placeholderDash")}
                      </span>
                    </span>
                    {lines(client.stats.unpaid).length ? (
                      <span className="lcard-line lcard-meta">
                        <span
                          className="lstate"
                          data-state={
                            client.stats.overdueCount > 0 ? "overdue" : "unpaid"
                          }
                        >
                          {t("clientsList.colUnpaid")}{" "}
                          {lines(client.stats.unpaid)
                            .map(([code, value]) => `${amount(value)} ${code}`)
                            .join(" · ")}
                        </span>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
