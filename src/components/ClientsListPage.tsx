import { use, useMemo } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

type ClientsListPageProps = {
  onViewDetails: (clientId: string) => void;
};

export function ClientsListPage({ onViewDetails }: ClientsListPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name", "email", "phone"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc")
      ),
    [evolu, owner.id]
  );

  const clients = useQuery(clientsQuery);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Clients</h1>

          {clients.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-gray-600">
              No clients yet.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {clients.map((client) => (
                <div key={client.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{client.name}</div>
                    <div className="text-sm text-gray-600 space-y-1 mt-1">
                      <div>{client.phone || "—"}</div>
                      <div>{client.email || "—"}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => onViewDetails(client.id)}
                    className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
                  >
                    View Details
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
