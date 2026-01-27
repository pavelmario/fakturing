import { Suspense, useState } from "react";
import { ClientDetailPage } from "./components/ClientDetailPage";
import { ClientsListPage } from "./components/ClientsListPage";
import { ClientsPage } from "./components/ClientsPage";
import { InvoiceCreatePage } from "./components/InvoiceCreatePage";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { InvoiceListPage } from "./components/InvoiceListPage";
import { SettingsPage } from "./components/SettingsPage";
import "./index.css";

function App() {
  const [page, setPage] = useState<
    | "settings"
    | "clients"
    | "clients-list"
    | "client-detail"
    | "invoice-create"
    | "invoice-list"
    | "invoice-detail"
  >("settings");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );

  return (
    <Suspense fallback={<div className="app-loading">Načítání...</div>}>
      <div className="app-shell">
        <div className="app-nav">
          <div className="app-tabs">
            <button
              onClick={() => {
                setPage("invoice-list");
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
              }}
              className={`tab-button ${
                page === "invoice-list"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              Faktury
            </button>
            <button
              onClick={() => {
                setPage("clients-list");
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
              }}
              className={`tab-button ${
                page === "clients-list" || page === "client-detail"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              Klienti
            </button>
            <button
              onClick={() => {
                setPage("settings");
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
              }}
              className={`tab-button ${
                page === "settings"
                  ? "tab-button-active"
                  : "tab-button-inactive"
              }`}
            >
              Nastavení
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
              onCreateInvoice={() => {
                setPage("invoice-create");
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
              }}
              onViewDetails={(invoiceId) => {
                setSelectedInvoiceId(invoiceId);
                setSelectedClientId(null);
                setPage("invoice-detail");
              }}
            />
          ) : page === "invoice-detail" && selectedInvoiceId ? (
            <InvoiceDetailPage
              invoiceId={selectedInvoiceId}
              onBack={() => {
                setPage("invoice-list");
                setSelectedInvoiceId(null);
              }}
            />
          ) : page === "clients-list" ? (
            <ClientsListPage
              onViewDetails={(clientId) => {
                setSelectedClientId(clientId);
                setSelectedInvoiceId(null);
                setPage("client-detail");
              }}
              onCreateClient={() => {
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
                setPage("clients");
              }}
            />
          ) : selectedClientId ? (
            <ClientDetailPage
              clientId={selectedClientId}
              onBack={() => {
                setPage("clients-list");
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
              }}
            />
          ) : (
            <ClientsListPage
              onViewDetails={(clientId) => {
                setSelectedClientId(clientId);
                setSelectedInvoiceId(null);
                setPage("client-detail");
              }}
              onCreateClient={() => {
                setSelectedClientId(null);
                setSelectedInvoiceId(null);
                setPage("clients");
              }}
            />
          )}
        </div>
      </div>
    </Suspense>
  );
}

export default App;
