import { use, useEffect, useMemo, useState } from "react";
import * as bip39 from "bip39";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { getRelayUrl, setRelayUrl as saveRelayUrl, useEvolu } from "../evolu";

export function SettingsPage() {
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const currentMnemonic = owner.mnemonic ?? "";

  const [mnemonicInput, setMnemonicInput] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [addressLine1, setAddressLine1] = useState<string>("");
  const [addressLine2, setAddressLine2] = useState<string>("");
  const [companyIdentificationNumber, setCompanyIdentificationNumber] =
    useState<string>("");
  const [vatNumber, setVatNumber] = useState<string>("");
  const [vatPayer, setVatPayer] = useState<boolean>(false);
  const [bankAccount, setBankAccount] = useState<string>("");
  const [swift, setSwift] = useState<string>("");
  const [iban, setIban] = useState<string>("");
  const [invoiceFooterText, setInvoiceFooterText] = useState<string>("");
  const [discreteMode, setDiscreteMode] = useState<boolean>(false);
  const [poRequired, setPoRequired] = useState<boolean>(false);
  const [mempoolUrl, setMempoolUrl] = useState<string>(
    "https://mempool.space/",
  );
  const [savedData, setSavedData] = useState<{
    name: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    companyIdentificationNumber?: string;
    vatNumber?: string;
    vatPayer?: boolean;
    bankAccount?: string;
    swift?: string;
    iban?: string;
    invoiceFooterText?: string;
    discreteMode?: boolean;
    poRequired?: boolean;
    mempoolUrl?: string;
  } | null>(null);
  const [showMnemonicInput, setShowMnemonicInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRelayConnected, setIsRelayConnected] = useState<boolean | null>(
    null,
  );
  const [lastSyncTime, setLastSyncTime] = useState<string>("");
  const [relayUrl, setRelayUrlState] = useState<string>("");
  const [connectedRelayUrl, setConnectedRelayUrl] = useState<string>("");
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [mnemonicError, setMnemonicError] = useState<string>("");

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .selectAll()
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profileRows = useQuery(profileQuery);
  const profile = profileRows[0] ?? null;

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select([
            "id",
            "name",
            "email",
            "phone",
            "addressLine1",
            "addressLine2",
            "companyIdentificationNumber",
            "vatNumber",
            "note",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );

  const invoicesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select([
            "id",
            "invoiceNumber",
            "clientName",
            "issueDate",
            "paymentDate",
            "paymentDays",
            "purchaseOrderNumber",
            "btcInvoice",
            "btcAddress",
            "items",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("invoiceNumber", "asc"),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);
  const invoices = useQuery(invoicesQuery);

  useEffect(() => {
    const currentUrl = getRelayUrl();
    setRelayUrlState(currentUrl);
    setConnectedRelayUrl(currentUrl);
  }, []);

  useEffect(() => {
    if (!connectedRelayUrl) {
      setIsRelayConnected(null);
      return;
    }

    let ws: WebSocket | null = null;
    let didSettle = false;

    setIsRelayConnected(null);

    try {
      ws = new WebSocket(connectedRelayUrl);
    } catch (error) {
      console.error("Neplatná URL relay adresa:", error);
      setIsRelayConnected(false);
      return;
    }

    ws.onopen = () => {
      didSettle = true;
      setIsRelayConnected(true);
    };

    ws.onerror = () => {
      didSettle = true;
      setIsRelayConnected(false);
    };

    ws.onclose = () => {
      if (!didSettle) {
        setIsRelayConnected(false);
      } else {
        setIsRelayConnected(false);
      }
    };

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [connectedRelayUrl]);

  useEffect(() => {
    if (!profile) {
      setSavedData(null);
      setLastSyncTime("");
      return;
    }
    setSavedData({
      name: profile.name ?? "",
      email: profile.email ?? undefined,
      phone: profile.phone ?? undefined,
      addressLine1: profile.addressLine1 ?? undefined,
      addressLine2: profile.addressLine2 ?? undefined,
      companyIdentificationNumber:
        profile.companyIdentificationNumber ?? undefined,
      vatNumber: profile.vatNumber ?? undefined,
      vatPayer: profile.vatPayer === Evolu.sqliteTrue,
      bankAccount: profile.bankAccount ?? undefined,
      swift: profile.swift ?? undefined,
      iban: profile.iban ?? undefined,
      invoiceFooterText: profile.invoiceFooterText ?? undefined,
      discreteMode: profile.discreteMode === Evolu.sqliteTrue,
      poRequired: profile.poRequired === Evolu.sqliteTrue,
      mempoolUrl: profile.mempoolUrl ?? "https://mempool.space/",
    });
    setName(profile.name ?? "");
    setEmail(profile.email ?? "");
    setPhone(profile.phone ?? "");
    setAddressLine1(profile.addressLine1 ?? "");
    setAddressLine2(profile.addressLine2 ?? "");
    setCompanyIdentificationNumber(profile.companyIdentificationNumber ?? "");
    setVatNumber(profile.vatNumber ?? "");
    setVatPayer(profile.vatPayer === Evolu.sqliteTrue);
    setBankAccount(profile.bankAccount ?? "");
    setSwift(profile.swift ?? "");
    setIban(profile.iban ?? "");
    setInvoiceFooterText(profile.invoiceFooterText ?? "");
    setDiscreteMode(profile.discreteMode === Evolu.sqliteTrue);
    setPoRequired(profile.poRequired === Evolu.sqliteTrue);
    setMempoolUrl(profile.mempoolUrl ?? "https://mempool.space/");
    setLastSyncTime(
      profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : "",
    );
  }, [profile]);
  const handleGenerateMnemonic = async () => {
    const confirmed = confirm(
      "Chystáte se resetovat lokální data a vygenerovat nový seed zálohy. Chcete pokračovat?",
    );
    if (!confirmed) return;
    await evolu.resetAppOwner();
    setShowMnemonicInput(false);
    setMnemonicInput("");
  };

  const handleMnemonicInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setMnemonicInput(value);
    setMnemonicError("");
  };

  const isValidMnemonic = (m: string): boolean => {
    if (!m.trim()) return false;
    return bip39.validateMnemonic(m.trim());
  };

  const handleRestoreFromMnemonic = async () => {
    const trimmed = mnemonicInput.trim();
    if (!trimmed) {
      setMnemonicError("Zadejte seed zálohy");
      return;
    }
    if (!isValidMnemonic(trimmed)) {
      setMnemonicError("Neplatný formát seedu zálohy");
      return;
    }
    if (trimmed === currentMnemonic) {
      setMnemonicError("Tento seed zálohy je již aktivní");
      return;
    }

    try {
      await evolu.restoreAppOwner(trimmed as Evolu.Mnemonic);
    } catch (error) {
      console.error("Failed to restore owner:", error);
      setMnemonicError("Nepodařilo se obnovit data ze seedu zálohy");
    }
  };

  // Save data via Evolu (local-first + sync)
  const handleSave = async () => {
    if (!name.trim()) {
      alert("Zadejte jméno");
      return;
    }

    setIsSaving(true);
    try {
      const toNullable = (value: string) => {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      };

      const payload = {
        name: name.trim(),
        email: toNullable(email),
        phone: toNullable(phone),
        addressLine1: toNullable(addressLine1),
        addressLine2: toNullable(addressLine2),
        companyIdentificationNumber: toNullable(companyIdentificationNumber),
        vatNumber: toNullable(vatNumber),
        vatPayer: vatPayer ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        bankAccount: toNullable(bankAccount),
        swift: toNullable(swift),
        iban: toNullable(iban),
        invoiceFooterText: toNullable(invoiceFooterText),
        discreteMode: discreteMode ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        poRequired: poRequired ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        mempoolUrl: toNullable(mempoolUrl),
      };

      if (profile?.id) {
        const result = evolu.update("userProfile", {
          id: profile.id,
          ...payload,
        });
        if (!result.ok) {
          console.error("Validation error:", result.error);
          alert("Chyba validace při ukládání nastavení");
          return;
        }
      } else {
        const result = evolu.insert("userProfile", payload);
        if (!result.ok) {
          console.error("Validation error:", result.error);
          alert("Chyba validace při ukládání nastavení");
          return;
        }
      }

      alert("Nastavení bylo úspěšně uloženo a synchronizováno přes Evolu!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Chyba při ukládání nastavení");
    } finally {
      setIsSaving(false);
    }
  };

  // Clear all local data
  const handleClearData = async () => {
    if (
      !confirm(
        "Opravdu chcete vymazat všechna lokální data? Tím se odhlásíte a k obnovení dat budete potřebovat seed zálohy.",
      )
    ) {
      return;
    }

    const deleteDatabase = (dbName: string) =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(dbName);
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });

    try {
      evolu.resetAppOwner();
      await deleteDatabase("invoice-manager");
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("invoiceApp_relayUrl");
      }
    } catch (error) {
      console.error("Failed to clear local data:", error);
    }

    // Reset all form fields
    setMnemonicInput("");
    setName("");
    setEmail("");
    setPhone("");
    setAddressLine1("");
    setAddressLine2("");
    setCompanyIdentificationNumber("");
    setVatNumber("");
    setBankAccount("");
    setSwift("");
    setIban("");
    setSavedData(null);
    setLastSyncTime("");
    alert("Všechna lokální data byla smazána.");
  };

  // Save relay URL and reconnect
  const handleSaveRelayUrl = async () => {
    const trimmedUrl = relayUrl.trim();
    if (!trimmedUrl) {
      alert("Zadejte URL relay serveru");
      return;
    }

    if (!trimmedUrl.startsWith("ws://") && !trimmedUrl.startsWith("wss://")) {
      alert("URL relay serveru musí začínat ws:// nebo wss://");
      return;
    }

    setIsReconnecting(true);
    try {
      saveRelayUrl(trimmedUrl);
      setConnectedRelayUrl(trimmedUrl);
      evolu.reloadApp();
    } catch (error) {
      console.error("Error updating relay URL:", error);
      alert("Chyba při aktualizaci URL relay serveru");
    } finally {
      setIsReconnecting(false);
    }
  };

  const downloadCsv = (
    filename: string,
    headers: string[],
    rows: ReadonlyArray<Record<string, unknown>>,
  ) => {
    const escapeValue = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const raw = typeof value === "string" ? value : JSON.stringify(value);
      const escaped = raw.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    };

    const lines = [headers.join(",")];
    for (const row of rows) {
      lines.push(headers.map((key) => escapeValue(row[key])).join(","));
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const clientHeaders = [
      "id",
      "name",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "companyIdentificationNumber",
      "vatNumber",
      "note",
    ];

    const invoiceHeaders = [
      "id",
      "invoiceNumber",
      "clientName",
      "issueDate",
      "paymentDate",
      "paymentDays",
      "purchaseOrderNumber",
      "btcInvoice",
      "btcAddress",
      "items",
    ];

    downloadCsv(
      "clients.csv",
      clientHeaders,
      clients as ReadonlyArray<Record<string, unknown>>,
    );
    downloadCsv(
      "invoices.csv",
      invoiceHeaders,
      invoices as ReadonlyArray<Record<string, unknown>>,
    );
  };

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-card">
          <div className="mb-8">
            <p className="section-title">Předvolby</p>
            <h1 className="page-title">Nastavení</h1>
          </div>

          {/* Relay Configuration Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Nastavení Relay serveru
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Nastavte URL adresu Evolu relay serveru pro synchronizaci dat.
              Změna způsobí opětovné připojení aplikace.
            </p>
            <div>
              <label htmlFor="relayUrl" className="form-label">
                URL adresa relay serveru
              </label>
              <input
                id="relayUrl"
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrlState(e.target.value)}
                placeholder="wss://your-relay-server.com"
                className="form-input font-mono text-sm"
              />
              <div className="space-y-3">
                <div
                  className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                    isRelayConnected === true
                      ? "bg-green-100 text-green-800"
                      : isRelayConnected === false
                        ? "bg-red-100 text-red-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}
                >
                  {isRelayConnected === true
                    ? "✓ Relay je připojen"
                    : isRelayConnected === false
                      ? "⚠ Relay je odpojen"
                      : "⟳ Připojování..."}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Aktuální relay: {connectedRelayUrl || "odpojen"}
                </p>
                <p className="text-xs text-slate-500">
                  Poslední synchronizace: {lastSyncTime || "zatím neproběhla"}
                </p>
                <p className="text-xs text-slate-500">
                  Výchozí: wss://free.evoluhq.com
                </p>
                <p></p>
              </div>

              <button
                onClick={handleSaveRelayUrl}
                disabled={isReconnecting || !relayUrl}
                className="btn-primary w-full"
              >
                {isReconnecting
                  ? "Připojování..."
                  : "Uložit URL relay serveru & Znovu připojit"}
              </button>
            </div>
          </div>

          {/* Mnemonic Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Seed zálohy
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              Váš seed zálohy vám umožňuje obnovit vaše data. Uchovejte jej
              bezpečně uložený a nikdy jej s nikým nesdílejte.
            </p>

            {currentMnemonic ? (
              <div className="alert-warning mb-4">
                <p className="text-sm font-semibold text-amber-900">
                  Váš seed zálohy:
                </p>
                <p className="mt-2 rounded-2xl border border-amber-200/70 bg-white/80 p-3 text-sm font-mono text-slate-700 break-words">
                  {currentMnemonic}
                </p>
                <button
                  onClick={() => setShowMnemonicInput(true)}
                  className="btn-ghost mt-3"
                >
                  Použít jiný seed zálohy
                </button>
              </div>
            ) : null}

            {!currentMnemonic || showMnemonicInput ? (
              <div className="space-y-4">
                <button
                  onClick={handleGenerateMnemonic}
                  className="btn-primary w-full"
                >
                  Vygenerovat nový seed zálohy
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200/70"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 py-1 rounded-full bg-white/80 text-slate-500">
                      nebo
                    </span>
                  </div>
                </div>

                <div>
                  <label className="form-label">
                    Zadejte existující seed zálohy
                  </label>
                  <textarea
                    value={mnemonicInput}
                    onChange={handleMnemonicInput}
                    placeholder="Zadejte váš 12 nebo 24slovný seed zálohy..."
                    rows={3}
                    className="form-textarea font-mono text-sm"
                  />
                  {mnemonicError && (
                    <p className="text-red-600 text-sm mt-2">{mnemonicError}</p>
                  )}
                  {!mnemonicError &&
                    mnemonicInput &&
                    !isValidMnemonic(mnemonicInput) && (
                      <p className="text-red-600 text-sm mt-2">
                        Neplatný formát seedu zálohy
                      </p>
                    )}
                  <button
                    onClick={handleRestoreFromMnemonic}
                    className="btn-success mt-3 w-full"
                  >
                    Obnovit data ze seedu zálohy
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Profile Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              Vaše údaje
            </h2>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="form-label">
                  Jméno a příjmení *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder=""
                  className="form-input"
                />
              </div>

              {/* Contact Information */}
              <div className="border-t border-slate-200/70 pt-4 mt-4">
                <h3 className="font-semibold text-slate-700 mb-3">
                  Kontaktní údaje
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email" className="form-label">
                      E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder=""
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="form-label">
                      Telefon
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder=""
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border-t border-slate-200/70 pt-4 mt-4">
                <h3 className="font-semibold text-slate-700 mb-3">Adresa</h3>
                <div>
                  <label htmlFor="addressLine1" className="form-label">
                    Ulice, číslo popisné
                  </label>
                  <input
                    id="addressLine1"
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder=""
                    className="form-input"
                  />
                </div>
                <div className="mt-2">
                  <label htmlFor="addressLine2" className="form-label">
                    PSČ, město
                  </label>
                  <input
                    id="addressLine2"
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder=""
                    className="form-input"
                  />
                </div>
              </div>

              {/* Company Information */}
              <div className="border-t border-slate-200/70 pt-4 mt-4">
                <h3 className="font-semibold text-slate-700 mb-3">
                  Fakturační údaje
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="companyId" className="form-label">
                      IČO
                    </label>
                    <input
                      id="companyId"
                      type="text"
                      value={companyIdentificationNumber}
                      onChange={(e) =>
                        setCompanyIdentificationNumber(e.target.value)
                      }
                      placeholder=""
                      className="form-input"
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={vatPayer}
                    onChange={(e) => setVatPayer(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Jsem plátce DPH
                </label>
                {vatPayer && (
                  <div className="mt-3">
                    <label htmlFor="vat" className="form-label">
                      DIČ
                    </label>
                    <input
                      id="vat"
                      type="text"
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      placeholder=""
                      className="form-input"
                    />
                  </div>
                )}
              </div>

              {/* Banking Information */}
              <div className="border-t border-slate-200/70 pt-4 mt-4">
                <h3 className="font-semibold text-slate-700 mb-3">
                  Bankovní spojení
                </h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="bankAccount" className="form-label">
                      Bankovní účet
                    </label>
                    <input
                      id="bankAccount"
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder=""
                      className="form-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="swift" className="form-label">
                        SWIFT
                      </label>
                      <input
                        id="swift"
                        type="text"
                        value={swift}
                        onChange={(e) => setSwift(e.target.value)}
                        placeholder=""
                        className="form-input"
                      />
                    </div>
                    <div>
                      <label htmlFor="iban" className="form-label">
                        IBAN
                      </label>
                      <input
                        id="iban"
                        type="text"
                        value={iban}
                        onChange={(e) => setIban(e.target.value)}
                        placeholder=""
                        className="form-input"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200/70 pt-4 mt-4">
                <h3 className="font-semibold text-slate-700 mb-3">
                  Patička faktury
                </h3>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor="invoiceFooterText"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Text patičky faktury
                    </label>
                  </div>
                  <textarea
                    id="invoiceFooterText"
                    value={invoiceFooterText}
                    onChange={(e) => setInvoiceFooterText(e.target.value)}
                    placeholder="Daně jsou krádež."
                    rows={3}
                    className="form-textarea"
                  />
                  <details className="mt-3 panel-card">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      Příklady textu patičky faktury
                    </summary>
                    <div className="mt-2 text-sm text-slate-600 space-y-2">
                      <p>
                        <span className="font-semibold">- Neplátce DPH:</span>{" "}
                        Fyzická osoba zapsaná v živnostenském rejstříku.
                      </p>
                      <p>
                        <span className="font-semibold">- Plátce DPH:</span>{" "}
                        Společnost je zapsána v obchodním rejstříku vedeném
                        Městským soudem v Praze oddíl B, vložka 012345.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200/70 pt-4 mt-4">
              <h3 className="font-semibold text-slate-700 mb-3">
                Další předvolby
              </h3>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={discreteMode}
                    onChange={(e) => setDiscreteMode(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Diskrétní režim
                </label>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={poRequired}
                    onChange={(e) => setPoRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Číslo objednávky na faktuře
                </label>
                <div>
                  <label htmlFor="mempoolUrl" className="form-label">
                    Mempool URL
                  </label>
                  <input
                    id="mempoolUrl"
                    type="text"
                    value={mempoolUrl}
                    onChange={(e) => setMempoolUrl(e.target.value)}
                    placeholder="https://mempool.space/"
                    className="form-input"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || !name}
            className="btn-success w-full mb-3"
          >
            {isSaving ? "Ukládání..." : "Uložit nastavení"}
          </button>

          <button onClick={handleExportCsv} className="btn-primary w-full mb-3">
            Exportovat faktury a klienty (CSV)
          </button>

          {/* Clear Data Button */}
          {savedData && (
            <button onClick={handleClearData} className="btn-danger w-full">
              Smazat všechna lokální data
            </button>
          )}
        </div>
      </div>
      <p className="text-center text-slate-500">
        <small>v.0.4</small>
      </p>
    </div>
  );
}
