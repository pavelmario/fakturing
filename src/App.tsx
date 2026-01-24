import { Suspense, useState } from "react";
import { ClientDetailPage } from "./components/ClientDetailPage";
import { ClientsListPage } from "./components/ClientsListPage";
import { ClientsPage } from "./components/ClientsPage";
import { InvoiceCreatePage } from "./components/InvoiceCreatePage";
import { SettingsPage } from "./components/SettingsPage";
import "./index.css";

function App() {
  const [page, setPage] = useState<
    "settings" | "clients" | "clients-list" | "client-detail" | "invoice-create"
  >("settings");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-gray-600">
          Loading...
        </div>
      }
    >
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => {
              setPage("settings");
              setSelectedClientId(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              page === "settings"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Settings
          </button>
          <button
            onClick={() => {
              setPage("clients-list");
              setSelectedClientId(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              page === "clients-list" || page === "client-detail"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Clients List
          </button>
          <button
            onClick={() => {
              setPage("invoice-create");
              setSelectedClientId(null);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
              page === "invoice-create"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Create Invoice
          </button>
        </div>
      </div>

      {page === "settings" ? (
        <SettingsPage />
      ) : page === "clients" ? (
        <ClientsPage />
      ) : page === "invoice-create" ? (
        <InvoiceCreatePage />
      ) : page === "clients-list" ? (
        <ClientsListPage
          onViewDetails={(clientId) => {
            setSelectedClientId(clientId);
            setPage("client-detail");
          }}
          onCreateClient={() => {
            setSelectedClientId(null);
            setPage("clients");
          }}
        />
      ) : selectedClientId ? (
        <ClientDetailPage
          clientId={selectedClientId}
          onBack={() => {
            setPage("clients-list");
            setSelectedClientId(null);
          }}
        />
      ) : (
        <ClientsListPage
          onViewDetails={(clientId) => {
            setSelectedClientId(clientId);
            setPage("client-detail");
          }}
          onCreateClient={() => {
            setSelectedClientId(null);
            setPage("clients");
          }}
        />
      )}
    </Suspense>
  );
}

export default App;
