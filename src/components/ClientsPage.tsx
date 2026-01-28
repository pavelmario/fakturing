import { useState } from "react";
import * as Evolu from "@evolu/common";
import { useEvolu } from "../evolu";

type AresSidlo = {
  textovaAdresa?: string | null;
  ulice?: string | null;
  nazevUlice?: string | null;
  cisloDomovni?: string | number | null;
  cisloOrientacni?: string | number | null;
  cisloOrientacniPismeno?: string | null;
  nazevCastiObce?: string | null;
  nazevObce?: string | null;
  psc?: string | number | null;
};

type AresResponse = {
  ico?: string | null;
  dic?: string | null;
  obchodniJmeno?: string | null;
  sidlo?: AresSidlo | null;
};

const formatAresAddressLines = (sidlo?: AresSidlo | null) => {
  const text = sidlo?.textovaAdresa?.trim();
  if (text) {
    const parts = text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      return {
        line1: parts[0],
        line2: parts.slice(1).join(", "),
      };
    }
    return { line1: text, line2: "" };
  }

  const street = (sidlo?.ulice ?? sidlo?.nazevUlice)?.trim();
  const cisloDomovni = sidlo?.cisloDomovni ?? "";
  const cisloOrientacni = sidlo?.cisloOrientacni ?? "";
  const orientacniPismeno = sidlo?.cisloOrientacniPismeno ?? "";
  const houseNumber =
    `${cisloDomovni}${cisloOrientacni ? `/${cisloOrientacni}` : ""}${orientacniPismeno ? orientacniPismeno : ""}`.trim();
  const line1 = [street, houseNumber].filter(Boolean).join(" ");

  const pscValue = sidlo?.psc ?? "";
  const psc = pscValue ? String(pscValue).padStart(5, "0") : "";
  const city = sidlo?.nazevObce?.trim() || sidlo?.nazevCastiObce?.trim() || "";
  const line2 = [psc, city].filter(Boolean).join(" ");

  return { line1, line2 };
};

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
  const [isAresLoading, setIsAresLoading] = useState(false);
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

  const handleLoadFromAres = async () => {
    const ico = companyIdentificationNumber.replace(/\s+/g, "").trim();
    if (!ico) {
      alert("Vyplňte IČO");
      return;
    }

    setIsAresLoading(true);
    try {
      const response = await fetch(
        `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${encodeURIComponent(ico)}`,
        {
          headers: { Accept: "application/json" },
        },
      );

      if (!response.ok) {
        alert("Nepodařilo se načíst data z ARES.");
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        alert("ARES vrátil neočekávanou odpověď.");
        return;
      }

      const data = (await response.json()) as AresResponse;
      if (!data?.obchodniJmeno && !data?.sidlo) {
        alert("ARES nevrátil žádná data pro zadané IČO.");
        return;
      }

      if (data.obchodniJmeno) setName(data.obchodniJmeno);
      if (data.dic) setVatNumber(data.dic);

      const { line1, line2 } = formatAresAddressLines(data.sidlo);
      if (line1) setAddressLine1(line1);
      if (line2) setAddressLine2(line2);
    } catch (error) {
      console.error("Error loading ARES data:", error);
      alert("Chyba při načítání dat z ARES.");
    } finally {
      setIsAresLoading(false);
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
                <button
                  type="button"
                  onClick={handleLoadFromAres}
                  disabled={isAresLoading}
                  className="btn-secondary mt-2 w-full"
                >
                  {isAresLoading ? "Načítám..." : "Načíst data z ARES"}
                </button>
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
