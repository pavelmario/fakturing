import { Suspense, useState, useEffect } from "react";
import { ClientDetailPage } from "./components/ClientDetailPage";
import { ClientsListPage } from "./components/ClientsListPage";
import { ClientsPage } from "./components/ClientsPage";
import { InvoiceCreatePage } from "./components/InvoiceCreatePage";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { InvoiceListPage } from "./components/InvoiceListPage";
import { SettingsPage } from "./components/SettingsPage";
import { useI18n } from "./i18n";
import "./index.css";

function App() {
  const { t } = useI18n();
  const [page, setPage] = useState<
    | "settings"
    | "clients"
    | "clients-list"
    | "client-detail"
    | "invoice-create"
    | "invoice-list"
    | "invoice-detail"
  >("invoice-list");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );

  const navigate = (
    newPage: typeof page,
    clientId: string | null = null,
    invoiceId: string | null = null,
    replace = false,
  ) => {
    setPage(newPage);
    setSelectedClientId(clientId);
    setSelectedInvoiceId(invoiceId);
    const state = {
      page: newPage,
      selectedClientId: clientId,
      selectedInvoiceId: invoiceId,
    };
    try {
      if (replace) window.history.replaceState(state, "");
      else window.history.pushState(state, "");
    } catch {
      /* ignore (some environments may restrict history) */
    }
  };

  // Restore state from history on mount and listen for back/forward
  useEffect(() => {
    const s = window.history.state as {
      page?: typeof page;
      selectedClientId?: string | null;
      selectedInvoiceId?: string | null;
    } | null;
    if (s && s.page) {
      setPage(s.page as any);
      setSelectedClientId(s.selectedClientId ?? null);
      setSelectedInvoiceId(s.selectedInvoiceId ?? null);
    } else {
      // ensure there's at least one history entry representing current app state
      navigate(page, selectedClientId, selectedInvoiceId, true);
    }

    const onPop = (ev: PopStateEvent) => {
      const state = ev.state as {
        page?: typeof page;
        selectedClientId?: string | null;
        selectedInvoiceId?: string | null;
      } | null;
      if (state && state.page) {
        setPage(state.page as any);
        setSelectedClientId(state.selectedClientId ?? null);
        setSelectedInvoiceId(state.selectedInvoiceId ?? null);
      } else {
        setPage("invoice-list");
        setSelectedClientId(null);
        setSelectedInvoiceId(null);
      }
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Suspense fallback={<div className="app-loading">{t("app.loading")}</div>}>
      <div className="app-shell">
        <div className="app-nav">
          <div className="app-tabs">
            <button
              onClick={() => navigate("invoice-list", null, null)}
              className={`tab-button ${
                page === "invoice-list"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              {t("app.nav.invoices")}
            </button>
            <button
              onClick={() => navigate("clients-list", null, null)}
              className={`tab-button ${
                page === "clients-list" || page === "client-detail"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              {t("app.nav.clients")}
            </button>
            <button
              onClick={() => navigate("settings", null, null)}
              className={`tab-button ${
                page === "settings"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              {t("app.nav.settings")}
            </button>
          </div>
        </div>

        <div className="mt-6">
          {page === "settings" ? (
            <SettingsPage />
          ) : page === "clients" ? (
            <ClientsPage />
          ) : page === "invoice-create" ? (
            <InvoiceCreatePage />
          ) : page === "invoice-list" ? (
            <InvoiceListPage
              onCreateInvoice={() => navigate("invoice-create", null, null)}
              onViewDetails={(invoiceId) =>
                navigate("invoice-detail", null, invoiceId)
              }
            />
          ) : page === "invoice-detail" && selectedInvoiceId ? (
            <InvoiceDetailPage
              invoiceId={selectedInvoiceId}
              onBack={() => navigate("invoice-list", null, null)}
            />
          ) : page === "clients-list" ? (
            <ClientsListPage
              onViewDetails={(clientId) =>
                navigate("client-detail", clientId, null)
              }
              onCreateClient={() => navigate("clients", null, null)}
            />
          ) : selectedClientId ? (
            <ClientDetailPage
              clientId={selectedClientId}
              onBack={() => navigate("clients-list", null, null)}
            />
          ) : (
            <ClientsListPage
              onViewDetails={(clientId) =>
                navigate("client-detail", clientId, null)
              }
              onCreateClient={() => navigate("clients", null, null)}
            />
          )}
          <p className="text-center text-slate-500">
            {t("app.donate.title")}
            <br></br>
            <small>
              poorjames425@walletofsatoshi.com
              <br></br>
              bc1q5jl6nyavkkl37gqkjuh307ckmlh3merh6lp4ua
            </small>
          </p>
        </div>
      </div>
    </Suspense>
  );
}

export default App;
