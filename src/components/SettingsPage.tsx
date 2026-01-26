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
      console.error("Invalid relay URL:", error);
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
    setLastSyncTime(
      profile.updatedAt ? new Date(profile.updatedAt).toLocaleString() : "",
    );
  }, [profile]);
  const handleGenerateMnemonic = async () => {
    const confirmed = confirm(
      "This will reset local data and generate a new backup phrase. Continue?",
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
      setMnemonicError("Please enter a backup phrase");
      return;
    }
    if (!isValidMnemonic(trimmed)) {
      setMnemonicError("Invalid backup phrase format");
      return;
    }
    if (trimmed === currentMnemonic) {
      setMnemonicError("This phrase is already active");
      return;
    }

    try {
      await evolu.restoreAppOwner(trimmed as Evolu.Mnemonic);
    } catch (error) {
      console.error("Failed to restore owner:", error);
      setMnemonicError("Failed to restore from backup phrase");
    }
  };

  // Save data via Evolu (local-first + sync)
  const handleSave = async () => {
    if (!name.trim()) {
      alert("Please enter your name");
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
      };

      if (profile?.id) {
        const result = evolu.update("userProfile", {
          id: profile.id,
          ...payload,
        });
        if (!result.ok) {
          console.error("Validation error:", result.error);
          alert("Validation error while saving settings");
          return;
        }
      } else {
        const result = evolu.insert("userProfile", payload);
        if (!result.ok) {
          console.error("Validation error:", result.error);
          alert("Validation error while saving settings");
          return;
        }
      }

      alert("Settings saved successfully and synced via Evolu!");
    } catch (error) {
      console.error("Error saving settings:", error);
      alert("Error saving settings");
    } finally {
      setIsSaving(false);
    }
  };

  // Clear all local data
  const handleClearData = async () => {
    if (
      !confirm(
        "Are you sure you want to clear all local data? This will log you out and you'll need your backup phrase to restore your data.",
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
    alert("All local data has been cleared.");
  };

  // Save relay URL and reconnect
  const handleSaveRelayUrl = async () => {
    const trimmedUrl = relayUrl.trim();
    if (!trimmedUrl) {
      alert("Please enter a relay URL");
      return;
    }

    if (!trimmedUrl.startsWith("ws://") && !trimmedUrl.startsWith("wss://")) {
      alert("Relay URL must start with ws:// or wss://");
      return;
    }

    setIsReconnecting(true);
    try {
      saveRelayUrl(trimmedUrl);
      setConnectedRelayUrl(trimmedUrl);
      evolu.reloadApp();
    } catch (error) {
      console.error("Error updating relay URL:", error);
      alert("Error updating relay URL");
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          </div>

          {/* Relay Configuration Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Relay Configuration
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Configure the Evolu relay URL used for synchronization. Changing
              it will reconnect the app.
            </p>
            <div>
              <label
                htmlFor="relayUrl"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Relay Server URL
              </label>
              <input
                id="relayUrl"
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrlState(e.target.value)}
                placeholder="wss://your-relay-server.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
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
                    ? "✓ Relay connected"
                    : isRelayConnected === false
                      ? "⚠ Relay disconnected"
                      : "⟳ Connecting..."}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Current relay: {connectedRelayUrl || "Not connected"}
                </p>
                <p className="text-xs text-gray-500">
                  Last sync: {lastSyncTime || "Not synced yet"}
                </p>
                <p className="text-xs text-gray-500">
                  Default: wss://free.evoluhq.com
                </p>
              </div>

              <button
                onClick={handleSaveRelayUrl}
                disabled={isReconnecting || !relayUrl}
                className={`w-full font-semibold py-2 px-4 rounded-lg transition ${
                  isReconnecting || !relayUrl
                    ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                }`}
              >
                {isReconnecting
                  ? "Reconnecting..."
                  : "Save Relay URL & Reconnect"}
              </button>
            </div>
          </div>

          {/* Mnemonic Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Secure Backup Phrase
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Your backup phrase allows you to recover your account. Keep it
              safe and never share it.
            </p>

            {currentMnemonic ? (
              <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mb-4">
                <p className="text-sm text-amber-800 mb-2 font-semibold">
                  Your backup phrase:
                </p>
                <p className="text-gray-700 font-mono text-sm break-words bg-white p-3 rounded border border-amber-200">
                  {currentMnemonic}
                </p>
                <button
                  onClick={() => setShowMnemonicInput(true)}
                  className="mt-3 text-sm text-amber-700 hover:text-amber-900 underline"
                >
                  Use different phrase
                </button>
              </div>
            ) : null}

            {!currentMnemonic || showMnemonicInput ? (
              <div className="space-y-4">
                <button
                  onClick={handleGenerateMnemonic}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                >
                  Generate New Backup Phrase
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">or</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enter your existing backup phrase
                  </label>
                  <textarea
                    value={mnemonicInput}
                    onChange={handleMnemonicInput}
                    placeholder="Enter your 12 or 24 word backup phrase..."
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  {mnemonicError && (
                    <p className="text-red-600 text-sm mt-2">{mnemonicError}</p>
                  )}
                  {!mnemonicError &&
                    mnemonicInput &&
                    !isValidMnemonic(mnemonicInput) && (
                      <p className="text-red-600 text-sm mt-2">
                        Invalid backup phrase format
                      </p>
                    )}
                  <button
                    onClick={handleRestoreFromMnemonic}
                    className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition"
                  >
                    Restore from Backup Phrase
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Profile Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Profile Information
            </h2>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Your Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Contact Information */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Contact Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      E-mail
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Phone
                    </label>
                    <input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3">Address</h3>
                <div>
                  <label
                    htmlFor="addressLine1"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Address Line 1
                  </label>
                  <input
                    id="addressLine1"
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Street address"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="mt-2">
                  <label
                    htmlFor="addressLine2"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Address Line 2
                  </label>
                  <input
                    id="addressLine2"
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="City, state, postal code"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Company Information */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Company Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="companyId"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Company Identification Number
                    </label>
                    <input
                      id="companyId"
                      type="text"
                      value={companyIdentificationNumber}
                      onChange={(e) =>
                        setCompanyIdentificationNumber(e.target.value)
                      }
                      placeholder="Company ID"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    checked={vatPayer}
                    onChange={(e) => setVatPayer(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  VAT payer
                </label>
                {vatPayer && (
                  <div className="mt-3">
                    <label
                      htmlFor="vat"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      VAT Number
                    </label>
                    <input
                      id="vat"
                      type="text"
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      placeholder="VAT Number"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}
              </div>

              {/* Banking Information */}
              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Banking Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="bankAccount"
                      className="block text-sm font-medium text-gray-700 mb-2"
                    >
                      Bank Account
                    </label>
                    <input
                      id="bankAccount"
                      type="text"
                      value={bankAccount}
                      onChange={(e) => setBankAccount(e.target.value)}
                      placeholder="Bank account number"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label
                        htmlFor="swift"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        SWIFT
                      </label>
                      <input
                        id="swift"
                        type="text"
                        value={swift}
                        onChange={(e) => setSwift(e.target.value)}
                        placeholder="SWIFT code"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="iban"
                        className="block text-sm font-medium text-gray-700 mb-2"
                      >
                        IBAN
                      </label>
                      <input
                        id="iban"
                        type="text"
                        value={iban}
                        onChange={(e) => setIban(e.target.value)}
                        placeholder="IBAN"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h3 className="font-semibold text-gray-700 mb-3">
                  Invoice Footer
                </h3>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor="invoiceFooterText"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Invoice footer text
                    </label>
                  </div>
                  <textarea
                    id="invoiceFooterText"
                    value={invoiceFooterText}
                    onChange={(e) => setInvoiceFooterText(e.target.value)}
                    placeholder="Enter footer text for invoices"
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <details className="mt-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-semibold text-gray-700">
                      Example footer texts
                    </summary>
                    <div className="mt-2 text-sm text-gray-600 space-y-2">
                      <p>
                        <span className="font-semibold">- non-VAT payer:</span>{" "}
                        Fyzická osoba zapsaná v živnostenském rejstříku.
                      </p>
                      <p>
                        <span className="font-semibold">- VAT payer:</span>{" "}
                        Společnost je zapsána v obchodním rejstříku vedeném
                        Městským soudem v Praze oddíl B, vložka 012345.
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold text-gray-700 mb-3">Preferences</h3>
              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={discreteMode}
                  onChange={(e) => setDiscreteMode(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Discrete mode
              </label>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || !name}
            className={`w-full font-semibold py-3 px-4 rounded-lg transition mb-3 ${
              isSaving || !name
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 text-white"
            }`}
          >
            {isSaving ? "Saving..." : "Save Settings"}
          </button>

          <button
            onClick={handleExportCsv}
            className="w-full font-semibold py-3 px-4 rounded-lg transition mb-3 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Export invoices & clients (CSV)
          </button>

          {/* Clear Data Button */}
          {savedData && (
            <button
              onClick={handleClearData}
              className="w-full font-semibold py-3 px-4 rounded-lg transition bg-red-600 hover:bg-red-700 text-white"
            >
              Clear All Local Data
            </button>
          )}
        </div>
      </div>
      <p className="text-center">
        <small>v.0.2</small>
      </p>
    </div>
  );
}
