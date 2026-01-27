import { use, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

type ClientsListPageProps = {
  onViewDetails: (clientId: string) => void;
  onCreateClient: () => void;
};

export function ClientsListPage({
  onViewDetails,
  onCreateClient,
}: ClientsListPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const [search, setSearch] = useState("");

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name", "email", "phone"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredClients = normalizedSearch
    ? clients.filter((client) =>
        (client.name ?? "").toLowerCase().includes(normalizedSearch),
      )
    : clients;

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div>
              <p className="section-title">Adresář</p>
              <h1 className="page-title">Klienti</h1>
            </div>
            <button
              onClick={onCreateClient}
              className="btn-primary w-full sm:w-auto"
            >
              Založit nového klienta
            </button>
          </div>

          <div className="mb-4">
            <label htmlFor="clientSearch" className="form-label">
              Hledání
            </label>
            <input
              id="clientSearch"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Hledat podle názvu subjektu"
              className="form-input"
            />
          </div>

          {filteredClients.length === 0 ? (
            <div className="empty-state">
              {clients.length === 0
                ? "Zatím nebyl založen ani jeden klient."
                : "Žádný klient neodpovídá vašemu hledání."}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredClients.map((client) => (
                <div
                  key={client.id}
                  className="list-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div>
                    <div className="text-lg font-semibold text-slate-900">
                      {client.name ?? "Nepojmenovaný klient"}
                    </div>
                    <div className="text-sm text-slate-600 space-y-1 mt-1">
                      <div>{client.phone || ""}</div>
                      <div>{client.email || ""}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => onViewDetails(client.id)}
                    className="btn-secondary w-full sm:w-auto"
                  >
                    Zobrazit detail
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
