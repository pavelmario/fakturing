import { useState } from "react";
import * as Evolu from "@evolu/common";
import { useEvolu } from "../evolu";

export function ClientsPage() {
  const evolu = useEvolu();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [companyIdentificationNumber, setCompanyIdentificationNumber] =
    useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [note, setNote] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const handleSave = async () => {
    setSaveMessage(null);

    if (!name.trim()) {
      alert("Vyplňte název klienta");
      return;
    }

    setIsSaving(true);
    try {
      const result = evolu.insert("client", {
        name: name.trim(),
        email: toNullable(email),
        phone: toNullable(phone),
        addressLine1: toNullable(addressLine1),
        addressLine2: toNullable(addressLine2),
        companyIdentificationNumber: toNullable(companyIdentificationNumber),
        vatNumber: toNullable(vatNumber),
        note: toNullable(note),
        deleted: Evolu.sqliteFalse,
      });

      if (!result.ok) {
        console.error("Validation error:", result.error);
        alert("Chyba validace při ukládání klienta");
        return;
      }

      setSaveMessage("Klient byl úspěšně uložen!");
      setName("");
      setEmail("");
      setPhone("");
      setAddressLine1("");
      setAddressLine2("");
      setCompanyIdentificationNumber("");
      setVatNumber("");
      setNote("");
    } catch (error) {
      console.error("Error saving client:", error);
      alert("Chyba při ukládání klienta");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="mb-6">
            <p className="section-title">Vytvořit záznam</p>
            <h1 className="page-title">Klient</h1>
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
                placeholder=""
                className="form-input"
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
                  placeholder=""
                  className="form-input"
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
                  placeholder=""
                  className="form-input"
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
                placeholder=""
                className="form-input"
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
                placeholder=""
                className="form-input"
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
                  placeholder=""
                  className="form-input"
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
                  placeholder=""
                  className="form-input"
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
                placeholder=""
                rows={4}
                className="form-textarea"
              />
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="btn-primary mt-6 w-full"
          >
            {isSaving ? "Saving..." : "Save Client"}
          </button>
        </div>
      </div>
    </div>
  );
}
