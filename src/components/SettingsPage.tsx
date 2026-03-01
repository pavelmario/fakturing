import { use, useEffect, useMemo, useRef, useState } from "react";
import * as bip39 from "bip39";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { getRelayUrl, setRelayUrl as saveRelayUrl, useEvolu } from "../evolu";
import { useI18n } from "../i18n";

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
  const [language, setLanguage] = useState<"cz" | "en">("cz");
  const { t, locale } = useI18n(language);
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
    language?: string;
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
  const importSettingsInputRef = useRef<HTMLInputElement | null>(null);
  const importClientsInputRef = useRef<HTMLInputElement | null>(null);
  const importInvoicesInputRef = useRef<HTMLInputElement | null>(null);

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
            "duzp",
            "paymentDate",
            "paymentDays",
            "paymentMethod",
            "purchaseOrderNumber",
            "invoicingNote",
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
      language: profile.language ?? "cz",
    });
    const normalizedLanguage =
      profile.language?.toString().trim().toLowerCase() === "en" ? "en" : "cz";
    setLanguage(normalizedLanguage);
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
  }, [profile]);

  useEffect(() => {
    if (!profile?.updatedAt) {
      setLastSyncTime("");
      return;
    }
    setLastSyncTime(new Date(profile.updatedAt).toLocaleString(locale));
  }, [profile?.updatedAt, locale]);
  const handleGenerateMnemonic = async () => {
    const confirmed = confirm(t("alerts.confirmResetSeed"));
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
      setMnemonicError(t("alerts.seedRequired"));
      return;
    }
    if (!isValidMnemonic(trimmed)) {
      setMnemonicError(t("alerts.seedInvalid"));
      return;
    }
    if (trimmed === currentMnemonic) {
      setMnemonicError(t("alerts.seedAlreadyActive"));
      return;
    }

    try {
      await evolu.restoreAppOwner(trimmed as Evolu.Mnemonic);
    } catch (error) {
      console.error("Failed to restore owner:", error);
      setMnemonicError(t("alerts.seedRestoreFailed"));
    }
  };

  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  };

  const parseCsvBoolean = (value: string | undefined): boolean => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  };

  const handleImportSettingsCsv = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          alert(t("alerts.csvNoData"));
          return;
        }

        const headers = parseCsvLine(lines[0]);
        const values = parseCsvLine(lines[1]);
        const row = headers.reduce<Record<string, string>>(
          (acc, key, index) => {
            acc[key] = values[index] ?? "";
            return acc;
          },
          {},
        );

        const importedName = row.name?.trim() ?? "";
        if (!importedName) {
          alert(t("alerts.csvInvalidName"));
          return;
        }

        const toNullable = (value: string | undefined) => {
          const trimmed = (value ?? "").trim();
          return trimmed ? trimmed : null;
        };

        const payload = {
          name: importedName,
          email: toNullable(row.email),
          phone: toNullable(row.phone),
          addressLine1: toNullable(row.addressLine1),
          addressLine2: toNullable(row.addressLine2),
          companyIdentificationNumber: toNullable(
            row.companyIdentificationNumber,
          ),
          vatNumber: toNullable(row.vatNumber),
          vatPayer: parseCsvBoolean(row.vatPayer)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          bankAccount: toNullable(row.bankAccount),
          swift: toNullable(row.swift),
          iban: toNullable(row.iban),
          invoiceFooterText: toNullable(row.invoiceFooterText),
          discreteMode: parseCsvBoolean(row.discreteMode)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          poRequired: parseCsvBoolean(row.poRequired)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          mempoolUrl: toNullable(row.mempoolUrl) ?? "https://mempool.space/",
          language: row.language?.trim().toLowerCase() === "en" ? "en" : "cz",
        };

        if (profile?.id) {
          const result = evolu.update("userProfile", {
            id: profile.id,
            ...payload,
          });
          if (!result.ok) {
            console.error("Validation error:", result.error);
            alert(t("alerts.settingsImportValidation"));
            return;
          }
        } else {
          const result = evolu.insert("userProfile", payload);
          if (!result.ok) {
            console.error("Validation error:", result.error);
            alert(t("alerts.settingsImportValidation"));
            return;
          }
        }

        setName(payload.name);
        setEmail(row.email ?? "");
        setPhone(row.phone ?? "");
        setAddressLine1(row.addressLine1 ?? "");
        setAddressLine2(row.addressLine2 ?? "");
        setCompanyIdentificationNumber(row.companyIdentificationNumber ?? "");
        setVatNumber(row.vatNumber ?? "");
        setVatPayer(parseCsvBoolean(row.vatPayer));
        setBankAccount(row.bankAccount ?? "");
        setSwift(row.swift ?? "");
        setIban(row.iban ?? "");
        setInvoiceFooterText(row.invoiceFooterText ?? "");
        setDiscreteMode(parseCsvBoolean(row.discreteMode));
        setPoRequired(parseCsvBoolean(row.poRequired));
        setMempoolUrl(row.mempoolUrl?.trim() || "https://mempool.space/");
        setLanguage(row.language?.trim().toLowerCase() === "en" ? "en" : "cz");

        alert(t("alerts.settingsImported"));
      } catch (error) {
        console.error("CSV import error:", error);
        alert(t("alerts.csvImportFailed"));
      } finally {
        if (importSettingsInputRef.current) {
          importSettingsInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  const handleImportClientsCsv = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          alert(t("alerts.csvNoData"));
          return;
        }

        const headers = parseCsvLine(lines[0]);
        const dataRows = lines.slice(1).map((line) => parseCsvLine(line));

        const toNullable = (value: string | undefined) => {
          const trimmed = (value ?? "").trim();
          return trimmed ? trimmed : null;
        };

        for (const values of dataRows) {
          const row = headers.reduce<Record<string, string>>(
            (acc, key, index) => {
              acc[key] = values[index] ?? "";
              return acc;
            },
            {},
          );

          const clientName = row.name?.trim();
          if (!clientName) continue;

          const payload = {
            name: clientName,
            email: toNullable(row.email),
            phone: toNullable(row.phone),
            addressLine1: toNullable(row.addressLine1),
            addressLine2: toNullable(row.addressLine2),
            companyIdentificationNumber: toNullable(
              row.companyIdentificationNumber,
            ),
            vatNumber: toNullable(row.vatNumber),
            note: toNullable(row.note),
            deleted: Evolu.sqliteFalse,
          };

          const result = evolu.insert("client", payload);
          if (!result.ok) {
            console.error("Validation error:", result.error);
            alert(t("alerts.clientsImportValidation"));
            return;
          }
        }

        alert(t("alerts.clientsImported"));
      } catch (error) {
        console.error("CSV import error:", error);
        alert(t("alerts.clientsImportFailed"));
      } finally {
        if (importClientsInputRef.current) {
          importClientsInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  const handleImportInvoicesCsv = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = String(reader.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          alert(t("alerts.csvNoData"));
          return;
        }

        const headers = parseCsvLine(lines[0]);
        const dataRows = lines.slice(1).map((line) => parseCsvLine(line));
        const formatTypeError = Evolu.createFormatTypeError();

        const toNullable = (value: string | undefined) => {
          const trimmed = (value ?? "").trim();
          return trimmed ? trimmed : null;
        };

        for (const values of dataRows) {
          const row = headers.reduce<Record<string, string>>(
            (acc, key, index) => {
              acc[key] = values[index] ?? "";
              return acc;
            },
            {},
          );

          const invoiceNumber = row.invoiceNumber?.trim();
          const clientName = row.clientName?.trim();
          const issueDateRaw = row.issueDate?.trim();
          if (!invoiceNumber || !clientName || !issueDateRaw) continue;

          const issueDateResult = Evolu.dateToDateIso(new Date(issueDateRaw));
          if (!issueDateResult.ok) {
            console.error(
              "Issue date error:",
              formatTypeError(issueDateResult.error),
            );
            alert(t("alerts.invoicesImportInvalidIssueDate"));
            return;
          }

          const duzpValue = row.duzp?.trim();
          const duzpResult = duzpValue
            ? Evolu.dateToDateIso(new Date(duzpValue))
            : null;
          if (duzpValue && duzpResult && !duzpResult.ok) {
            console.error("Duzp error:", formatTypeError(duzpResult.error));
            alert(t("alerts.invoicesImportInvalidDuzp"));
            return;
          }

          const paymentDateValue = row.paymentDate?.trim();
          const paymentDateResult = paymentDateValue
            ? Evolu.dateToDateIso(new Date(paymentDateValue))
            : null;
          if (paymentDateValue && paymentDateResult && !paymentDateResult.ok) {
            console.error(
              "Payment date error:",
              formatTypeError(paymentDateResult.error),
            );
            alert(t("alerts.invoicesImportInvalidPaymentDate"));
            return;
          }

          const paymentDaysNumber = Number(row.paymentDays ?? "");
          const paymentDaysResult = Evolu.NonNegativeNumber.from(
            Number.isFinite(paymentDaysNumber) ? paymentDaysNumber : 0,
          );
          if (!paymentDaysResult.ok) {
            console.error(
              "Payment days error:",
              formatTypeError(paymentDaysResult.error),
            );
            alert(t("alerts.invoicesImportInvalidPaymentDays"));
            return;
          }

          const itemsRaw = row.items?.trim() ?? "[]";
          const itemsResult = Evolu.Json.from(itemsRaw);
          if (!itemsResult.ok) {
            console.error("Items error:", formatTypeError(itemsResult.error));
            alert(t("alerts.invoicesImportInvalidItems"));
            return;
          }

          const payload = {
            invoiceNumber,
            clientName,
            issueDate: issueDateResult.value,
            duzp: duzpResult?.ok ? duzpResult.value : null,
            paymentDate: paymentDateResult?.ok ? paymentDateResult.value : null,
            paymentDays: paymentDaysResult.value,
            paymentMethod: toNullable(row.paymentMethod),
            purchaseOrderNumber: toNullable(row.purchaseOrderNumber),
            invoicingNote: toNullable(row.invoicingNote),
            btcInvoice: parseCsvBoolean(row.btcInvoice)
              ? Evolu.sqliteTrue
              : Evolu.sqliteFalse,
            btcAddress: toNullable(row.btcAddress),
            items: itemsResult.value,
            deleted: Evolu.sqliteFalse,
          };

          const result = evolu.insert("invoice", payload);
          if (!result.ok) {
            console.error("Validation error:", result.error);
            alert(t("alerts.invoicesImportValidation"));
            return;
          }
        }

        alert(t("alerts.invoicesImported"));
      } catch (error) {
        console.error("CSV import error:", error);
        alert(t("alerts.invoicesImportFailed"));
      } finally {
        if (importInvoicesInputRef.current) {
          importInvoicesInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  // Save data via Evolu (local-first + sync)
  const handleSave = async () => {
    if (!name.trim()) {
      alert(t("alerts.nameRequired"));
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
        language: (language || "cz").toString().trim().toLowerCase(),
      };

      if (profile?.id) {
        const result = evolu.update("userProfile", {
          id: profile.id,
          ...payload,
        });
        if (!result.ok) {
          const formatTypeError = Evolu.createFormatTypeError();
          const formatted = formatTypeError(result.error);
          console.error("Validation error:", result.error);
          console.error("Validation details:", formatted);
          alert(t("alerts.settingsValidationError", { details: formatted }));
          return;
        }
      } else {
        const result = evolu.insert("userProfile", payload);
        if (!result.ok) {
          const formatTypeError = Evolu.createFormatTypeError();
          const formatted = formatTypeError(result.error);
          console.error("Validation error:", result.error);
          console.error("Validation details:", formatted);
          alert(t("alerts.settingsValidationError", { details: formatted }));
          return;
        }
      }

      alert(t("alerts.settingsSaved"));
    } catch (error) {
      console.error("Error saving settings:", error);
      alert(t("alerts.settingsSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  // Clear all local data
  const handleClearData = async () => {
    if (!confirm(t("alerts.confirmClearData"))) {
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
    alert(t("alerts.dataCleared"));
  };

  // Save relay URL and reconnect
  const handleSaveRelayUrl = async () => {
    const trimmedUrl = relayUrl.trim();
    if (!trimmedUrl) {
      alert(t("alerts.relayUrlRequired"));
      return;
    }

    if (!trimmedUrl.startsWith("ws://") && !trimmedUrl.startsWith("wss://")) {
      alert(t("alerts.relayUrlInvalid"));
      return;
    }

    setIsReconnecting(true);
    try {
      saveRelayUrl(trimmedUrl);
      setConnectedRelayUrl(trimmedUrl);
      evolu.reloadApp();
    } catch (error) {
      console.error("Error updating relay URL:", error);
      alert(t("alerts.relayUrlUpdateFailed"));
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
    const settingsHeaders = [
      "id",
      "name",
      "email",
      "phone",
      "addressLine1",
      "addressLine2",
      "companyIdentificationNumber",
      "vatNumber",
      "vatPayer",
      "bankAccount",
      "swift",
      "iban",
      "invoiceFooterText",
      "discreteMode",
      "language",
      "poRequired",
      "mempoolUrl",
      "updatedAt",
    ];

    const invoiceHeaders = [
      "id",
      "invoiceNumber",
      "clientName",
      "issueDate",
      "duzp",
      "paymentDate",
      "paymentDays",
      "paymentMethod",
      "purchaseOrderNumber",
      "invoicingNote",
      "btcInvoice",
      "btcAddress",
      "items",
    ];

    downloadCsv(
      "settings.csv",
      settingsHeaders,
      profileRows as ReadonlyArray<Record<string, unknown>>,
    );
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
            <p className="section-title">{t("settings.sectionTitle")}</p>
            <h1 className="page-title">{t("settings.title")}</h1>
          </div>

          {/* Relay Configuration Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {t("settings.relayTitle")}
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              {t("settings.relayDescription")}
            </p>
            <div>
              <label htmlFor="relayUrl" className="form-label">
                {t("settings.relayUrlLabel")}
              </label>
              <input
                id="relayUrl"
                type="text"
                value={relayUrl}
                onChange={(e) => setRelayUrlState(e.target.value)}
                placeholder={t("settings.relayUrlPlaceholder")}
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
                    ? t("settings.relayConnected")
                    : isRelayConnected === false
                      ? t("settings.relayDisconnected")
                      : t("settings.relayConnecting")}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {t("settings.relayCurrent", {
                    url: connectedRelayUrl || t("settings.relayOfflineValue"),
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  {t("settings.relayLastSync", {
                    time: lastSyncTime || t("settings.relayNeverSynced"),
                  })}
                </p>
                <p className="text-xs text-slate-500">
                  {t("settings.relayDefault")}
                </p>
                <p></p>
              </div>

              <button
                onClick={handleSaveRelayUrl}
                disabled={isReconnecting || !relayUrl}
                className="btn-primary w-full"
              >
                {isReconnecting
                  ? t("settings.relaySaving")
                  : t("settings.relaySave")}
              </button>
            </div>
          </div>

          {/* Mnemonic Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {t("settings.seedTitle")}
            </h2>
            <p className="text-sm text-slate-600 mb-4">
              {t("settings.seedDescription")}
            </p>

            {currentMnemonic ? (
              <div className="alert-warning mb-4">
                <p className="text-sm font-semibold text-amber-900">
                  {t("settings.seedCurrentLabel")}
                </p>
                <p className="mt-2 rounded-2xl border border-amber-200/70 bg-white/80 p-3 text-sm font-mono text-slate-700 break-words">
                  {currentMnemonic}
                </p>
                <button
                  onClick={() => setShowMnemonicInput(true)}
                  className="btn-ghost mt-3"
                >
                  {t("settings.seedUseDifferent")}
                </button>
              </div>
            ) : null}

            {!currentMnemonic || showMnemonicInput ? (
              <div className="space-y-4">
                <button
                  onClick={handleGenerateMnemonic}
                  className="btn-primary w-full"
                >
                  {t("settings.seedGenerate")}
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200/70"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-3 py-1 rounded-full bg-white/80 text-slate-500">
                      {t("settings.seedOr")}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="form-label">
                    {t("settings.seedEnterLabel")}
                  </label>
                  <textarea
                    value={mnemonicInput}
                    onChange={handleMnemonicInput}
                    placeholder={t("settings.seedPlaceholder")}
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
                        {t("settings.seedInvalid")}
                      </p>
                    )}
                  <button
                    onClick={handleRestoreFromMnemonic}
                    className="btn-success mt-3 w-full"
                  >
                    {t("settings.seedRestore")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Profile Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-4">
              {t("settings.profileTitle")}
            </h2>

            <div className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="form-label">
                  {t("settings.nameLabel")}
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
                  {t("settings.contactTitle")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="email" className="form-label">
                      {t("settings.emailLabel")}
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
                      {t("settings.phoneLabel")}
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
                <h3 className="font-semibold text-slate-700 mb-3">
                  {t("settings.addressTitle")}
                </h3>
                <div>
                  <label htmlFor="addressLine1" className="form-label">
                    {t("settings.addressLine1Label")}
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
                    {t("settings.addressLine2Label")}
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
                  {t("settings.companyTitle")}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="companyId" className="form-label">
                      {t("settings.companyIdLabel")}
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
                  {t("settings.vatPayerLabel")}
                </label>
                {vatPayer && (
                  <div className="mt-3">
                    <label htmlFor="vat" className="form-label">
                      {t("settings.vatLabel")}
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
                  {t("settings.bankTitle")}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="bankAccount" className="form-label">
                      {t("settings.bankAccountLabel")}
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
                  <p className="text-sm text-gray-500 mb-3">
                    ⚠️ {t("settings.bankQrNote")}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="swift" className="form-label">
                        {t("settings.swiftLabel")}
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
                        {t("settings.ibanLabel")}
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
                  {t("settings.footerTitle")}
                </h3>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <label
                      htmlFor="invoiceFooterText"
                      className="block text-sm font-medium text-slate-700"
                    >
                      {t("settings.footerLabel")}
                    </label>
                  </div>
                  <textarea
                    id="invoiceFooterText"
                    value={invoiceFooterText}
                    onChange={(e) => setInvoiceFooterText(e.target.value)}
                    placeholder={t("settings.footerPlaceholder")}
                    rows={3}
                    className="form-textarea"
                  />
                  <details className="mt-3 panel-card">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                      {t("settings.footerExamples")}
                    </summary>
                    <div className="mt-2 text-sm text-slate-600 space-y-2">
                      <p>
                        <span className="font-semibold">
                          {t("settings.footerExampleNonVat")}
                        </span>{" "}
                        {t("settings.footerExampleNonVatText")}
                      </p>
                      <p>
                        <span className="font-semibold">
                          {t("settings.footerExampleVat")}
                        </span>{" "}
                        {t("settings.footerExampleVatText")}
                      </p>
                    </div>
                  </details>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200/70 pt-4 mt-4">
              <h3 className="font-semibold text-slate-700 mb-3">
                {t("settings.otherTitle")}
              </h3>
              <div className="flex flex-col gap-2">
                <div>
                  <label htmlFor="language" className="form-label">
                    {t("settings.languageLabel")}
                  </label>
                  <select
                    id="language"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as "cz" | "en")}
                    className="form-select"
                  >
                    <option value="cz">{t("settings.languageCz")}</option>
                    <option value="en">{t("settings.languageEn")}</option>
                  </select>
                </div>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={discreteMode}
                    onChange={(e) => setDiscreteMode(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t("settings.discreteMode")}
                </label>
                <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={poRequired}
                    onChange={(e) => setPoRequired(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {t("settings.poRequired")}
                </label>
                <div>
                  <label htmlFor="mempoolUrl" className="form-label">
                    {t("settings.mempoolLabel")}
                  </label>
                  <input
                    id="mempoolUrl"
                    type="text"
                    value={mempoolUrl}
                    onChange={(e) => setMempoolUrl(e.target.value)}
                    placeholder={t("settings.mempoolPlaceholder")}
                    className="form-input"
                  />
                </div>
                <details className="panel-card mt-2">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    {t("settings.importTitle")}
                  </summary>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      ref={importSettingsInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportSettingsCsv}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => importSettingsInputRef.current?.click()}
                      className="btn-secondary w-full sm:w-auto"
                    >
                      {t("settings.importSettings")}
                    </button>
                    <a
                      href="/settings_import_template.csv"
                      download
                      className="btn-ghost w-full sm:w-auto text-center"
                    >
                      {t("settings.importSettingsTemplate")}
                    </a>
                  </div>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      ref={importClientsInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportClientsCsv}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => importClientsInputRef.current?.click()}
                      className="btn-secondary w-full sm:w-auto"
                    >
                      {t("settings.importClients")}
                    </button>
                    <a
                      href="/clients_import_template.csv"
                      download
                      className="btn-ghost w-full sm:w-auto text-center"
                    >
                      {t("settings.importClientsTemplate")}
                    </a>
                  </div>
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <input
                      ref={importInvoicesInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleImportInvoicesCsv}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => importInvoicesInputRef.current?.click()}
                      className="btn-secondary w-full sm:w-auto"
                    >
                      {t("settings.importInvoices")}
                    </button>
                    <a
                      href="/invoices_import_template.csv"
                      download
                      className="btn-ghost w-full sm:w-auto text-center"
                    >
                      {t("settings.importInvoicesTemplate")}
                    </a>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving || !name}
            className="btn-success w-full mb-3"
          >
            {isSaving ? t("settings.saving") : t("settings.save")}
          </button>

          <button onClick={handleExportCsv} className="btn-primary w-full mb-3">
            {t("settings.exportCsv")}
          </button>

          {/* Clear Data Button */}
          {savedData && (
            <button onClick={handleClearData} className="btn-danger w-full">
              {t("settings.clearData")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
