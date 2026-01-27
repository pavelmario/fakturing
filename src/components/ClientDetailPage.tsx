import { use, useEffect, useMemo, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { useEvolu } from "../evolu";

type ClientDetailPageProps = {
  clientId: string;
  onBack: () => void;
};

const ClientId = Evolu.id("Client");

export function ClientDetailPage({ clientId, onBack }: ClientDetailPageProps) {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const clientIdValue = useMemo(() => {
    const result = ClientId.from(clientId);
    return result.ok
      ? result.value
      : Evolu.createIdFromString<"Client">("invalid-client-id");
  }, [clientId]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [companyIdentificationNumber, setCompanyIdentificationNumber] =
    useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [note, setNote] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const clientQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .selectAll()
          .where("id", "=", clientIdValue)
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .limit(1),
      ),
    [evolu, clientIdValue, owner.id],
  );

  const clientRows = useQuery(clientQuery);
  const client = clientRows[0] ?? null;

  const hydrateForm = (source: typeof client) => {
    setName(source?.name ?? "");
    setEmail(source?.email ?? "");
    setPhone(source?.phone ?? "");
    setAddressLine1(source?.addressLine1 ?? "");
    setAddressLine2(source?.addressLine2 ?? "");
    setCompanyIdentificationNumber(source?.companyIdentificationNumber ?? "");
    setVatNumber(source?.vatNumber ?? "");
    setNote(source?.note ?? "");
  };

  useEffect(() => {
    hydrateForm(client);
    setIsEditing(false);
    setSaveMessage(null);
  }, [client]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const handleSave = async () => {
    if (!client?.id) return;
    if (!name.trim()) {
      alert("Vyplňte název klienta");
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const result = evolu.update("client", {
        id: client.id,
        name: name.trim(),
        email: toNullable(email),
        phone: toNullable(phone),
        addressLine1: toNullable(addressLine1),
        addressLine2: toNullable(addressLine2),
        companyIdentificationNumber: toNullable(companyIdentificationNumber),
        vatNumber: toNullable(vatNumber),
        note: toNullable(note),
      });

      if (!result.ok) {
        console.error("Validation error:", result.error);
        alert("Chyba validace při ukládání klienta");
        return;
      }

      setSaveMessage("Klient byl úspěšně uložen!");
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating client:", error);
      alert("Chyba při ukládání klienta");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    hydrateForm(client);
    setIsEditing(false);
    setSaveMessage(null);
  };

  const handleDelete = async () => {
    if (!client?.id) return;
    const confirmed = confirm(
      "Smazat tohoto klienta? Tuto akci nelze vrátit zpět.",
    );
    if (!confirmed) return;

    setIsDeleting(true);
    setSaveMessage(null);

    try {
      const result = evolu.update("client", {
        id: client.id,
        deleted: Evolu.sqliteTrue,
      });
      if (!result.ok) {
        console.error("Delete error:", result.error);
        alert("Chyba při mazání klienta");
        return;
      }
      onBack();
    } catch (error) {
      console.error("Error deleting client:", error);
      alert("Chyba při mazání klienta");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!client) {
    return (
      <div className="page-shell">
        <div className="page-container">
          <div className="page-card">
            <div className="flex items-center justify-between mb-6">
              <h1 className="page-title">Detail klienta</h1>
              <button onClick={onBack} className="btn-secondary">
                Zpět na seznam
              </button>
            </div>
            <div className="empty-state">Klient nenalezen.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="flex items-center justify-between mb-6">
            <h1 className="page-title">Detail klienta</h1>
            <button onClick={onBack} className="btn-secondary">
              Zpět na seznam
            </button>
          </div>

          {saveMessage ? (
            <div className="mb-6 alert-success">{saveMessage}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="clientName" className="form-label">
                Název klienta *
              </label>
              <input
                id="clientName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isEditing}
                className="form-input disabled:bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="clientEmail" className="form-label">
                  Kontaktní e-mail
                </label>
                <input
                  id="clientEmail"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="clientPhone" className="form-label">
                  Telefon
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clientAddress1" className="form-label">
                Ulice, číslo popisné
              </label>
              <input
                id="clientAddress1"
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                disabled={!isEditing}
                className="form-input disabled:bg-slate-100"
              />
            </div>

            <div>
              <label htmlFor="clientAddress2" className="form-label">
                PSČ, město
              </label>
              <input
                id="clientAddress2"
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                disabled={!isEditing}
                className="form-input disabled:bg-slate-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="clientCompanyId" className="form-label">
                  IČO
                </label>
                <input
                  id="clientCompanyId"
                  type="text"
                  value={companyIdentificationNumber}
                  onChange={(e) =>
                    setCompanyIdentificationNumber(e.target.value)
                  }
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
              <div>
                <label htmlFor="clientVat" className="form-label">
                  DIČ
                </label>
                <input
                  id="clientVat"
                  type="text"
                  value={vatNumber}
                  onChange={(e) => setVatNumber(e.target.value)}
                  disabled={!isEditing}
                  className="form-input disabled:bg-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="clientNote" className="form-label">
                Poznámka
              </label>
              <textarea
                id="clientNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!isEditing}
                rows={4}
                className="form-textarea disabled:bg-slate-100"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            {!isEditing ? (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-primary w-full sm:w-auto"
                >
                  Upravit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting ? "Mažu..." : "Smazat"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving || isDeleting}
                  className="btn-primary w-full sm:w-auto"
                >
                  {isSaving ? "Ukládám..." : "Uložit"}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isSaving || isDeleting}
                  className="btn-secondary w-full sm:w-auto"
                >
                  Zrušit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="btn-danger w-full sm:w-auto"
                >
                  {isDeleting ? "Mažu..." : "Smazat"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
