import { use, useEffect, useMemo, useRef } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

/**
 * Attaches existing invoices to their client record, once.
 *
 * Invoices used to reference a client only by name, so renaming a client
 * silently detached its whole history. New invoices store `clientId`; this
 * fills it in for the ones written before, matching on the name they already
 * carry. `clientName` is kept as the historical snapshot either way.
 */
export const useClientIdBackfill = () => {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const done = useRef(false);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["id", "clientName", "clientId"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);
  const invoices = useQuery(invoicesQuery);

  useEffect(() => {
    if (done.current) return;
    if (clients.length === 0 || invoices.length === 0) return;

    const idByName = new Map(
      clients
        .filter((client) => client.name)
        .map((client) => [client.name as string, client.id]),
    );

    const pending = invoices.filter(
      (invoice) => !invoice.clientId && idByName.has(invoice.clientName ?? ""),
    );
    if (pending.length === 0) {
      done.current = true;
      return;
    }

    done.current = true;
    for (const invoice of pending) {
      evolu.update("invoice", {
        id: invoice.id,
        clientId: idByName.get(invoice.clientName ?? ""),
      });
    }
  }, [clients, evolu, invoices]);
};
