import { use, useEffect, useMemo, useRef, useState } from "react";
import * as bip39 from "bip39";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import { getRelayUrl, setRelayUrl as saveRelayUrl, useEvolu } from "../evolu";
import {
  Check,
  Download,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { SelectField } from "./invoices/SelectField";
import {
  FILENAME_DEFAULT,
  FILENAME_TOKENS,
  buildInvoiceFileName,
  normalizeFileNameTemplate,
} from "../lib/invoiceFileName";
import {
  NUMBER_DEFAULT,
  NUMBER_TOKENS,
  formatInvoiceNumber,
} from "../lib/invoiceNumber";
import {
  matchBankAccount,
  matchClient,
  parseFakturoidXml,
} from "../lib/fakturoidImport";
import { useI18n } from "../i18n";
import { useConfirm, useNotify } from "../lib/confirmContext";
import { DonatePanel } from "./invoices/DonatePanel";

type SettingsPageProps = {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSettingsSaved: () => void;
};

export function SettingsPage({
  theme,
  onToggleTheme,
  onSettingsSaved,
}: SettingsPageProps) {
  const isOnline = useOnlineStatus();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const currentMnemonic = owner.mnemonic ?? "";

  const [mnemonicInput, setMnemonicInput] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [discreteMode, setDiscreteMode] = useState<boolean>(false);
  const [expenses, setExpenses] = useState<boolean>(false);
  const [supplierVatPrefill, setSupplierVatPrefill] = useState<string>("");
  const [language, setLanguage] = useState<"cz" | "en">("cz");
  const { t, tp, locale } = useI18n(language);
  const confirmDialog = useConfirm();
  const notify = useNotify();
  const [poRequired, setPoRequired] = useState<boolean>(false);
  /* Settings is a very long page and its save button sits at the bottom, so a
     toggle near the middle looked like it did nothing. Any change now raises
     a sticky bar that says so and carries Save. */

  const [billPerUnit, setBillPerUnit] = useState<boolean>(false);
  const [mempoolUrl, setMempoolUrl] = useState<string>(
    "https://mempool.space/",
  );
  const [invoiceNamingFormat, setInvoiceNamingFormat] =
    useState<string>(FILENAME_DEFAULT);
  const [invoiceNumberFormat, setInvoiceNumberFormat] =
    useState<string>(NUMBER_DEFAULT);
  const [showMnemonicInput, setShowMnemonicInput] = useState(false);
  /* The backup phrase is the master key to every invoice — it should not be
     sitting in plain sight on a page you open to change the language. */
  const [seedRevealed, setSeedRevealed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /* Which datasets the next export includes. */
  const [exportPick, setExportPick] = useState({
    settings: true,
    bankAccounts: true,
    clients: true,
    invoices: true,
    expenses: true,
  });
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
  const importExpensesInputRef = useRef<HTMLInputElement | null>(null);
  const importBankAccountsInputRef = useRef<HTMLInputElement | null>(null);
  const importFakturoidInputRef = useRef<HTMLInputElement | null>(null);

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
            /* The export headers have always listed these three, but the
               query did not select them, so every backup wrote them empty —
               a restore dropped foreign-currency invoices back to CZK and
               detached each one from its client. */
            "clientId",
            "currency",
            "bankAccountId",
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

  const expensesQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("expense")
          .select([
            "id",
            "expenseNumber",
            "supplierVat",
            "amountWithoutVat",
            "vatRate",
            "amountWithVat",
            "description",
            "expenseDate",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("expenseDate", "desc"),
      ),
    [evolu, owner.id],
  );

  /* Bank accounts moved out of the profile into their own table, so without
     this the export silently left the user with no payment details — and no
     payment QR — after a restore. */
  const bankAccountsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("bankAccount")
          .select([
            "id",
            "label",
            "accountNumber",
            "iban",
            "swift",
            "currency",
            "isDefault",
          ])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("label", "asc"),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);
  const invoices = useQuery(invoicesQuery);
  const expenseRows = useQuery(expensesQuery);
  const bankAccountRows = useQuery(bankAccountsQuery);

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

    if (!isOnline) {
      setIsRelayConnected(false);
      return;
    }

    const reconnectDelayMs = 3000;
    const connectTimeoutMs = 6000;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let connectTimer: number | undefined;
    let disposed = false;

    const clearTimers = () => {
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      if (connectTimer !== undefined) {
        window.clearTimeout(connectTimer);
        connectTimer = undefined;
      }
    };

    const closeSocket = () => {
      if (!ws) return;
      ws.onopen = null;
      ws.onerror = null;
      ws.onclose = null;
      if (
        ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING
      ) {
        ws.close();
      }
      ws = null;
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, reconnectDelayMs);
    };

    const connect = () => {
      if (disposed) return;

      closeSocket();
      setIsRelayConnected(null);

      try {
        ws = new WebSocket(connectedRelayUrl);
      } catch (error) {
        console.error("Neplatná URL relay adresa:", error);
        setIsRelayConnected(false);
        scheduleReconnect();
        return;
      }

      connectTimer = window.setTimeout(() => {
        if (!ws || ws.readyState !== WebSocket.CONNECTING) return;
        ws.close();
      }, connectTimeoutMs);

      ws.onopen = () => {
        if (disposed) return;
        if (connectTimer !== undefined) {
          window.clearTimeout(connectTimer);
          connectTimer = undefined;
        }
        setIsRelayConnected(true);
      };

      ws.onerror = () => {
        if (disposed) return;
        setIsRelayConnected(false);
      };

      ws.onclose = () => {
        if (disposed) return;
        if (connectTimer !== undefined) {
          window.clearTimeout(connectTimer);
          connectTimer = undefined;
        }
        ws = null;
        setIsRelayConnected(false);
        scheduleReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimers();
      closeSocket();
    };
  }, [connectedRelayUrl, isOnline]);

  useEffect(() => {
    if (!profile) return;
    const normalizedLanguage =
      profile.language?.toString().trim().toLowerCase() === "en" ? "en" : "cz";
    setLanguage(normalizedLanguage);
    setName(profile.name ?? "");
    setDiscreteMode(profile.discreteMode === Evolu.sqliteTrue);
    /* Never explicitly set → follows VAT payer status, matching what the nav
       actually does. */
    setExpenses(
      profile.expenses == null
        ? profile.vatPayer === Evolu.sqliteTrue
        : profile.expenses === Evolu.sqliteTrue,
    );
    setSupplierVatPrefill(profile.supplierVatPrefill ?? "");
    setPoRequired(profile.poRequired === Evolu.sqliteTrue);
    setBillPerUnit(profile.billPerUnit === Evolu.sqliteTrue);
    setMempoolUrl(profile.mempoolUrl ?? "https://mempool.space/");
    setInvoiceNamingFormat(
      normalizeFileNameTemplate(profile.invoiceNamingFormat),
    );
    setInvoiceNumberFormat(profile.invoiceNumberFormat ?? NUMBER_DEFAULT);
  }, [profile]);

  useEffect(() => {
    if (!profile?.updatedAt) {
      setLastSyncTime("");
      return;
    }
    setLastSyncTime(new Date(profile.updatedAt).toLocaleString(locale));
  }, [profile?.updatedAt, locale]);
  const handleGenerateMnemonic = async () => {
    const confirmed = await confirmDialog({
      title: t("alerts.confirmResetSeed"),
      confirmLabel: t("settings.seedGenerate"),
      tone: "danger",
    });
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

  const parseCsvRows = (csvText: string): string[][] => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentCell = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i += 1) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentCell += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === "," && !inQuotes) {
        currentRow.push(currentCell);
        currentCell = "";
        continue;
      }

      if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && nextChar === "\n") {
          i += 1;
        }
        currentRow.push(currentCell);
        if (currentRow.some((cell) => cell.trim() !== "")) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentCell = "";
        continue;
      }

      currentCell += char;
    }

    currentRow.push(currentCell);
    if (currentRow.some((cell) => cell.trim() !== "")) {
      rows.push(currentRow);
    }

    return rows;
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
        const rows = parseCsvRows(text);
        if (rows.length < 2) {
          notify(t("alerts.csvNoData"), "error");
          return;
        }

        const headers = rows[0];
        const values = rows[1];
        const row = headers.reduce<Record<string, string>>(
          (acc, key, index) => {
            acc[key] = values[index] ?? "";
            return acc;
          },
          {},
        );

        const importedName = row.name?.trim() ?? "";
        if (!importedName) {
          notify(t("alerts.csvInvalidName"), "error");
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
          expenses: parseCsvBoolean(row.expenses)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          supplierVatPrefill: toNullable(row.supplierVatPrefill),
          poRequired: parseCsvBoolean(row.poRequired)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          billPerUnit: parseCsvBoolean(row.billPerUnit)
            ? Evolu.sqliteTrue
            : Evolu.sqliteFalse,
          mempoolUrl: toNullable(row.mempoolUrl) ?? "https://mempool.space/",
          /* Stored as a token template, not the legacy preset name that
             older exports (and the shipped sample) still carry. */
          invoiceNamingFormat: normalizeFileNameTemplate(
            toNullable(row.invoiceNamingFormat),
          ),
          invoiceNumberFormat:
            toNullable(row.invoiceNumberFormat) ?? NUMBER_DEFAULT,
          taxOfficeCode: toNullable(row.taxOfficeCode),
          taxOfficeWorkplaceCode: toNullable(row.taxOfficeWorkplaceCode),
          language: row.language?.trim().toLowerCase() === "en" ? "en" : "cz",
        };

        if (profile?.id) {
          const result = evolu.update("userProfile", {
            id: profile.id,
            ...payload,
          });
          if (!result.ok) {
            console.error("Validation error:", result.error);
            notify(t("alerts.settingsImportValidation"), "error");
            return;
          }
        } else {
          const result = evolu.insert("userProfile", payload);
          if (!result.ok) {
            console.error("Validation error:", result.error);
            notify(t("alerts.settingsImportValidation"), "error");
            return;
          }
        }

        setName(payload.name);
        setDiscreteMode(parseCsvBoolean(row.discreteMode));
        setExpenses(parseCsvBoolean(row.expenses));
        setSupplierVatPrefill(row.supplierVatPrefill?.trim() ?? "");
        setPoRequired(parseCsvBoolean(row.poRequired));
        setBillPerUnit(parseCsvBoolean(row.billPerUnit));
        setMempoolUrl(row.mempoolUrl?.trim() || "https://mempool.space/");
        setInvoiceNamingFormat(
          normalizeFileNameTemplate(row.invoiceNamingFormat?.trim()),
        );
        setInvoiceNumberFormat(row.invoiceNumberFormat?.trim() || NUMBER_DEFAULT);
        setLanguage(row.language?.trim().toLowerCase() === "en" ? "en" : "cz");

        notify(t("alerts.settingsImported"), "success");
      } catch (error) {
        console.error("CSV import error:", error);
        notify(t("alerts.csvImportFailed"), "error");
      } finally {
        if (importSettingsInputRef.current) {
          importSettingsInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  const handleImportBankAccountsCsv = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const lines = text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        if (lines.length < 2) {
          notify(t("alerts.csvNoData"), "error");
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

          const label = row.label?.trim();
          if (!label) continue;

          const result = evolu.insert("bankAccount", {
            label,
            accountNumber: toNullable(row.accountNumber),
            iban: toNullable(row.iban),
            swift: toNullable(row.swift),
            currency: toNullable(row.currency),
            isDefault: parseCsvBoolean(row.isDefault)
              ? Evolu.sqliteTrue
              : Evolu.sqliteFalse,
            deleted: Evolu.sqliteFalse,
          });
          if (!result.ok) {
            console.error("Validation error:", result.error);
            notify(t("alerts.bankAccountsImportValidation"), "error");
            return;
          }
        }

        notify(t("alerts.bankAccountsImported"), "success");
      } catch (error) {
        console.error("CSV import error:", error);
        notify(t("alerts.csvImportFailed"), "error");
      } finally {
        if (importBankAccountsInputRef.current) {
          importBankAccountsInputRef.current.value = "";
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
          notify(t("alerts.csvNoData"), "error");
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
            notify(t("alerts.clientsImportValidation"), "error");
            return;
          }
        }

        notify(t("alerts.clientsImported"), "success");
      } catch (error) {
        console.error("CSV import error:", error);
        notify(t("alerts.clientsImportFailed"), "error");
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
          notify(t("alerts.csvNoData"), "error");
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
            notify(t("alerts.invoicesImportInvalidIssueDate"), "error");
            return;
          }

          const duzpValue = row.duzp?.trim();
          const duzpResult = duzpValue
            ? Evolu.dateToDateIso(new Date(duzpValue))
            : null;
          if (duzpValue && duzpResult && !duzpResult.ok) {
            console.error("Duzp error:", formatTypeError(duzpResult.error));
            notify(t("alerts.invoicesImportInvalidDuzp"), "error");
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
            notify(t("alerts.invoicesImportInvalidPaymentDate"), "error");
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
            notify(t("alerts.invoicesImportInvalidPaymentDays"), "error");
            return;
          }

          const itemsRaw = row.items?.trim() ?? "[]";
          const itemsResult = Evolu.Json.from(itemsRaw);
          if (!itemsResult.ok) {
            console.error("Items error:", formatTypeError(itemsResult.error));
            notify(t("alerts.invoicesImportInvalidItems"), "error");
            return;
          }

          const payload = {
            invoiceNumber,
            clientName,
            /* Round-tripping without these dropped every foreign-currency
               invoice back to CZK and detached it from its client. */
            clientId: toNullable(row.clientId),
            currency: toNullable(row.currency),
            bankAccountId: toNullable(row.bankAccountId),
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
            notify(t("alerts.invoicesImportValidation"), "error");
            return;
          }
        }

        notify(t("alerts.invoicesImported"), "success");
      } catch (error) {
        console.error("CSV import error:", error);
        notify(t("alerts.invoicesImportFailed"), "error");
      } finally {
        if (importInvoicesInputRef.current) {
          importInvoicesInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  const handleImportExpensesCsv = (
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
          notify(t("alerts.csvNoData"), "error");
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

          const description = row.description?.trim();
          const expenseDateRaw = row.expenseDate?.trim();
          if (!description || !expenseDateRaw) continue;

          const expenseDateResult = Evolu.dateToDateIso(
            new Date(expenseDateRaw),
          );
          if (!expenseDateResult.ok) {
            console.error(
              "Expense date error:",
              formatTypeError(expenseDateResult.error),
            );
            notify(t("alerts.expensesImportInvalidDate"), "error");
            return;
          }

          const parseOptionalNonNegative = (
            value: string | undefined,
            errorKey:
              | "alerts.expensesImportInvalidAmountWithoutVat"
              | "alerts.expensesImportInvalidVatRate"
              | "alerts.expensesImportInvalidAmountWithVat",
          ) => {
            const trimmed = (value ?? "").trim();
            if (!trimmed) return null;

            const numberValue = Number(trimmed);
            if (!Number.isFinite(numberValue)) {
              notify(t(errorKey), "info");
              return "error" as const;
            }

            const result = Evolu.NonNegativeNumber.from(numberValue);
            if (!result.ok) {
              console.error(
                "Amount parse error:",
                formatTypeError(result.error),
              );
              notify(t(errorKey), "info");
              return "error" as const;
            }

            return result.value;
          };

          const amountWithoutVat = parseOptionalNonNegative(
            row.amountWithoutVat,
            "alerts.expensesImportInvalidAmountWithoutVat",
          );
          if (amountWithoutVat === "error") return;

          const vatRate = parseOptionalNonNegative(
            row.vatRate,
            "alerts.expensesImportInvalidVatRate",
          );
          if (vatRate === "error") return;

          const amountWithVat = parseOptionalNonNegative(
            row.amountWithVat,
            "alerts.expensesImportInvalidAmountWithVat",
          );
          if (amountWithVat === "error") return;

          const payload = {
            expenseNumber: toNullable(row.expenseNumber),
            supplierVat: toNullable(row.supplierVat),
            amountWithoutVat,
            vatRate,
            amountWithVat,
            description,
            expenseDate: expenseDateResult.value,
            deleted: Evolu.sqliteFalse,
          };

          const result = evolu.insert("expense", payload);
          if (!result.ok) {
            console.error("Validation error:", result.error);
            notify(t("alerts.expensesImportValidation"), "error");
            return;
          }
        }

        notify(t("alerts.expensesImported"), "success");
      } catch (error) {
        console.error("CSV import error:", error);
        notify(t("alerts.expensesImportFailed"), "error");
      } finally {
        if (importExpensesInputRef.current) {
          importExpensesInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  /**
   * Fakturoid's XML export — the one format of theirs that is a single file
   * and still carries the invoice lines.
   *
   * Nothing is written until the summary is confirmed, and an invoice number
   * already in the ledger is left where it is, so re-importing the same file
   * (or a wider export overlapping an earlier one) adds only what is new.
   */
  const handleImportFakturoidXml = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        let parsed;
        try {
          parsed = parseFakturoidXml(String(reader.result ?? ""));
        } catch (error) {
          console.error("Fakturoid parse error:", error);
          notify(t("alerts.fakturoidInvalidFile"), "error");
          return;
        }

        if (parsed.invoices.length === 0) {
          notify(t("alerts.fakturoidNoInvoices"), "error");
          return;
        }

        const known = new Set<string>(
          invoices.map((row) => String(row.invoiceNumber)),
        );
        const fresh = parsed.invoices.filter(
          (invoice) => !known.has(invoice.invoiceNumber),
        );
        if (fresh.length === 0) {
          notify(t("alerts.fakturoidNothingNew"), "info");
          return;
        }

        /* Only the clients those invoices need. An export trimmed to one year
           should not drag in the rest of the Fakturoid address book. */
        const needed = new Set(fresh.map((invoice) => invoice.clientKey));
        const existing = clients.map((row) => ({
          id: String(row.id),
          name: row.name,
          companyIdentificationNumber: row.companyIdentificationNumber,
        }));
        const incoming = parsed.clients
          .filter((client) => needed.has(client.key))
          .map((client) => ({ client, id: matchClient(client, existing) }));
        const toCreate = incoming.filter((entry) => entry.id === null);

        const summary = [
          tp("settings.fakturoidCountInvoices", fresh.length),
          tp("settings.fakturoidCountClients", toCreate.length),
        ].join(", ");

        /* Everything left behind is spelled out rather than silently dropped:
           an invoice missing from the ledger afterwards should be explained
           by this dialog. */
        const duplicates = parsed.invoices.length - fresh.length;
        const left = (
          [
            [duplicates, "fakturoidSkipDuplicates"],
            [parsed.skipped.proforma, "fakturoidSkipProforma"],
            [parsed.skipped.cancelled, "fakturoidSkipCancelled"],
            [parsed.skipped.unusable, "fakturoidSkipUnusable"],
          ] as const
        )
          .filter(([count]) => count > 0)
          .map(([count, key]) => t(`settings.${key}`, { count }));

        const confirmed = await confirmDialog({
          title: t("settings.fakturoidConfirmTitle"),
          message: [
            summary,
            left.length
              ? t("settings.fakturoidSkipped", { parts: left.join(", ") })
              : "",
          ]
            .filter(Boolean)
            .join(" · "),
          confirmLabel: t("settings.fakturoidConfirmLabel"),
        });
        if (!confirmed) return;

        /* Clients first: an invoice stores its client's id, and creating both
           in one pass would leave each client's first invoice detached from
           the history the Klienti page builds out of it. */
        const idByKey = new Map<string, string>();
        for (const entry of incoming) {
          if (entry.id) {
            idByKey.set(entry.client.key, entry.id);
            continue;
          }
          const result = evolu.insert("client", {
            name: entry.client.name,
            email: null,
            phone: null,
            addressLine1: entry.client.addressLine1,
            addressLine2: entry.client.addressLine2,
            companyIdentificationNumber:
              entry.client.companyIdentificationNumber,
            vatNumber: entry.client.vatNumber,
            note: null,
            deleted: Evolu.sqliteFalse,
          });
          if (!result.ok) {
            console.error("Fakturoid client insert error:", result.error);
            continue;
          }
          idByKey.set(entry.client.key, String(result.value.id));
        }

        const accounts = bankAccountRows.map((row) => ({
          id: String(row.id),
          accountNumber: row.accountNumber,
          iban: row.iban,
        }));

        /* Midday, not midnight: a date stored at 00:00 UTC reads as the day
           before once the browser is west of Greenwich. */
        const toIso = (date: string | null) => {
          if (!date) return null;
          const result = Evolu.dateToDateIso(new Date(`${date}T12:00:00`));
          return result.ok ? result.value : null;
        };

        let written = 0;
        const failed: string[] = [];
        for (const invoice of fresh) {
          const issueDate = toIso(invoice.issueDate);
          const paymentDays = Evolu.NonNegativeNumber.from(invoice.paymentDays);
          const items = Evolu.Json.from(JSON.stringify(invoice.items));
          if (!issueDate || !paymentDays.ok || !items.ok) {
            failed.push(invoice.invoiceNumber);
            continue;
          }

          const result = evolu.insert("invoice", {
            invoiceNumber: invoice.invoiceNumber,
            clientName: invoice.clientName,
            clientId: idByKey.get(invoice.clientKey) ?? null,
            currency: invoice.currency,
            bankAccountId: invoice.bankAccount
              ? matchBankAccount(invoice.bankAccount, accounts)
              : null,
            issueDate,
            duzp: toIso(invoice.duzp),
            paymentDate: toIso(invoice.paymentDate),
            paymentDays: paymentDays.value,
            paymentMethod: invoice.paymentMethod,
            purchaseOrderNumber: invoice.purchaseOrderNumber,
            invoicingNote: invoice.invoicingNote,
            btcInvoice: Evolu.sqliteFalse,
            btcAddress: null,
            items: items.value,
            deleted: Evolu.sqliteFalse,
          });
          if (!result.ok) {
            console.error("Fakturoid invoice insert error:", result.error);
            failed.push(invoice.invoiceNumber);
            continue;
          }
          written += 1;
        }

        notify(
          t("alerts.fakturoidImported", {
            summary: tp("settings.fakturoidCountInvoices", written),
          }),
          "success",
        );
        /* Reported separately: a partial import that says only "done" is how
           a missing invoice goes unnoticed until the tax return. */
        if (failed.length > 0) {
          notify(
            t("alerts.fakturoidPartial", { numbers: failed.join(", ") }),
            "error",
          );
        }
      } catch (error) {
        console.error("Fakturoid import error:", error);
        notify(t("alerts.fakturoidImportFailed"), "error");
      } finally {
        if (importFakturoidInputRef.current) {
          importFakturoidInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  };

  // Save data via Evolu (local-first + sync)
  const handleSave = async () => {
    setSaveError(null);

    setIsSaving(true);
    try {
      const toNullable = (value: string) => {
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
      };

      /* Only configuration. The identity fields belong to Profil, and sending
         them from here would write this page's stale copies over them. */
      const payload = {
        discreteMode: discreteMode ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        expenses: expenses ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        supplierVatPrefill: toNullable(supplierVatPrefill),
        poRequired: poRequired ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        billPerUnit: billPerUnit ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        mempoolUrl: toNullable(mempoolUrl),
        invoiceNamingFormat: toNullable(invoiceNamingFormat),
        invoiceNumberFormat: toNullable(invoiceNumberFormat),
        language: (language || "cz").toString().trim().toLowerCase(),
      };

      /* `name` is required to create a profile, and it belongs to Profil — so
         this page updates an existing row and never creates one. */
      if (!profile?.id) {
        setSaveError(t("settings.profileFirst"));
        return;
      }

      const result = evolu.update("userProfile", { id: profile.id, ...payload });
      if (!result.ok) {
        const formatTypeError = Evolu.createFormatTypeError();
        const formatted = formatTypeError(result.error);
        console.error("Validation error:", result.error);
        notify(t("alerts.settingsValidationError", { details: formatted }), "error");
        return;
      }

      onSettingsSaved();
    } catch (error) {
      console.error("Error saving settings:", error);
      notify(t("alerts.settingsSaveFailed"), "error");
    } finally {
      setIsSaving(false);
    }
  };

  // Clear all local data
  const handleClearData = async () => {
    if (
      !(await confirmDialog({
        title: t("alerts.confirmClearData"),
        confirmLabel: t("settings.clearData"),
        tone: "danger",
      }))
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
    setExpenses(false);
    setSupplierVatPrefill("");
  };

  const handleSaveRelayUrl = async () => {
    const trimmedUrl = relayUrl.trim();
    if (!trimmedUrl) {
      notify(t("alerts.relayUrlRequired"), "error");
      return;
    }
    if (!trimmedUrl.startsWith("ws://") && !trimmedUrl.startsWith("wss://")) {
      notify(t("alerts.relayUrlInvalid"), "error");
      return;
    }

    setIsReconnecting(true);
    try {
      saveRelayUrl(trimmedUrl);
      setConnectedRelayUrl(trimmedUrl);
      evolu.reloadApp();
    } catch (error) {
      console.error("Error updating relay URL:", error);
      notify(t("alerts.relayUrlUpdateFailed"), "error");
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

  const settingsExportHeaders = [
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
    "expenses",
    "supplierVatPrefill",
    "language",
    "poRequired",
    "billPerUnit",
    "mempoolUrl",
    "invoiceNamingFormat",
    "invoiceNumberFormat",
    "taxOfficeCode",
    "taxOfficeWorkplaceCode",
    "updatedAt",
  ];

  const clientsExportHeaders = [
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

  const invoicesExportHeaders = [
    "id",
    "invoiceNumber",
    "clientName",
    "clientId",
    "currency",
    "bankAccountId",
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

  const bankAccountsExportHeaders = [
    "id",
    "label",
    "accountNumber",
    "iban",
    "swift",
    "currency",
    "isDefault",
  ];

  const expensesExportHeaders = [
    "id",
    "expenseNumber",
    "supplierVat",
    "amountWithoutVat",
    "vatRate",
    "amountWithVat",
    "description",
    "expenseDate",
  ];

  const handleExportSettingsCsv = () => {
    downloadCsv(
      "settings.csv",
      settingsExportHeaders,
      profileRows as ReadonlyArray<Record<string, unknown>>,
    );
  };

  const handleExportClientsCsv = () => {
    downloadCsv(
      "clients.csv",
      clientsExportHeaders,
      clients as ReadonlyArray<Record<string, unknown>>,
    );
  };

  const handleExportInvoicesCsv = () => {
    downloadCsv(
      "invoices.csv",
      invoicesExportHeaders,
      invoices as ReadonlyArray<Record<string, unknown>>,
    );
  };

  const handleExportBankAccountsCsv = () => {
    downloadCsv(
      "bank-accounts.csv",
      bankAccountsExportHeaders,
      bankAccountRows as ReadonlyArray<Record<string, unknown>>,
    );
  };

  const handleExportExpensesCsv = () => {
    downloadCsv(
      "expenses.csv",
      expensesExportHeaders,
      expenseRows as ReadonlyArray<Record<string, unknown>>,
    );
  };

  /* What this page owns, as stored. Compared against the live values so that
     changing something and changing it back is not "unsaved changes" — a flag
     set on every keystroke could never tell the difference. */
  const storedValues = useMemo(
    () => ({
      language:
        profile?.language?.toString().trim().toLowerCase() === "en"
          ? "en"
          : "cz",
      discreteMode: profile?.discreteMode === Evolu.sqliteTrue,
      expenses:
        profile?.expenses == null
          ? profile?.vatPayer === Evolu.sqliteTrue
          : profile.expenses === Evolu.sqliteTrue,
      supplierVatPrefill: profile?.supplierVatPrefill ?? "",
      poRequired: profile?.poRequired === Evolu.sqliteTrue,
      billPerUnit: profile?.billPerUnit === Evolu.sqliteTrue,
      mempoolUrl: profile?.mempoolUrl ?? "https://mempool.space/",
      invoiceNamingFormat: normalizeFileNameTemplate(
        profile?.invoiceNamingFormat,
      ),
      invoiceNumberFormat: profile?.invoiceNumberFormat ?? NUMBER_DEFAULT,
    }),
    [profile],
  );

  const dirty =
    JSON.stringify({
      language,
      discreteMode,
      expenses,
      supplierVatPrefill,
      poRequired,
      billPerUnit,
      mempoolUrl,
      invoiceNamingFormat,
      invoiceNumberFormat,
    }) !== JSON.stringify(storedValues);

  const pickedCount = Object.values(exportPick).filter(Boolean).length;
  const allPicked = pickedCount === Object.keys(exportPick).length;

  const toggle = (
    checked: boolean,
    onChange: (next: boolean) => void,
    label: string,
    hint?: string,
  ) => (
    <div className="setting-row">
      <label className="setting-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label}</span>
      </label>
      {hint ? <p className="field-hint setting-hint">{hint}</p> : null}
    </div>
  );

  return (
    <div
      className="page-shell"
    >
      <div className="page-container">
        <h1 className="page-title mb-4">{t("settings.title")}</h1>

        {saveError ? (
          <div className="alert-warning mb-3">{saveError}</div>
        ) : null}

        {dirty ? (
          <div className="editing-bar settings-bar">
            <span>{t("settings.unsavedChanges")}</span>
            <div className="editing-bar-actions">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary"
              >
                {isSaving ? t("settings.saving") : t("common.save")}
              </button>
            </div>
          </div>
        ) : null}

        <div className="settings-stack">
          {/* ---- Appearance & language ------------------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.appearanceTitle")}</h2>
            <div className="compact-grid">
              <div>
                <label htmlFor="language" className="form-label">
                  {t("settings.languageLabel")}
                </label>
                <SelectField
                  id="language"
                  value={language}
                  ariaLabel={t("settings.languageLabel")}
                  options={[
                    { value: "cz", label: t("settings.languageCz") },
                    { value: "en", label: t("settings.languageEn") },
                  ]}
                  onChange={(next) => {
                    setLanguage(next as "cz" | "en");
                  }}
                />
              </div>
              <div>
                <span className="form-label">{t("settings.themeLabel")}</span>
                <div className="theme-choice">
                  <button
                    type="button"
                    className="fchip"
                    data-on={theme === "light"}
                    aria-pressed={theme === "light"}
                    onClick={() => theme === "dark" && onToggleTheme()}
                  >
                    {theme === "light" ? <Check /> : <Sun />}
                    {t("settings.themeLight")}
                  </button>
                  <button
                    type="button"
                    className="fchip"
                    data-on={theme === "dark"}
                    aria-pressed={theme === "dark"}
                    onClick={() => theme === "light" && onToggleTheme()}
                  >
                    {theme === "dark" ? <Check /> : <Moon />}
                    {t("settings.themeDark")}
                  </button>
                </div>
              </div>
            </div>
            {toggle(
              discreteMode,
              setDiscreteMode,
              t("settings.discreteMode"),
              t("settings.discreteModeHint"),
            )}
          </section>

          {/* ---- Invoicing ------------------------------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.invoicingTitle")}</h2>

            {toggle(
              billPerUnit,
              setBillPerUnit,
              t("settings.billPerUnit"),
              t("settings.billPerUnitDescription"),
            )}
            {toggle(
              poRequired,
              setPoRequired,
              t("settings.poRequired"),
              t("settings.poRequiredHint"),
            )}

            <label htmlFor="invoiceNumberFormat" className="form-label mt-3">
              {t("settings.invoiceNumberFormatLabel")}
            </label>
            <input
              id="invoiceNumberFormat"
              type="text"
              value={invoiceNumberFormat}
              onChange={(e) => setInvoiceNumberFormat(e.target.value)}
              placeholder={NUMBER_DEFAULT}
              className="form-input mono"
            />
            <div className="token-help">
              {NUMBER_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  className="token"
                  onClick={() =>
                    setInvoiceNumberFormat((current) => `${current}${token}`)
                  }
                >
                  {token}
                </button>
              ))}
            </div>
            <p className="field-hint">
              {t("settings.invoiceNumberPreview", {
                number: formatInvoiceNumber(invoiceNumberFormat, 7),
              })}
            </p>

            <label htmlFor="invoiceNamingFormat" className="form-label mt-3">
              {t("settings.invoiceNamingFormatLabel")}
            </label>
            <input
              id="invoiceNamingFormat"
              type="text"
              value={invoiceNamingFormat}
              onChange={(e) => setInvoiceNamingFormat(e.target.value)}
              placeholder={FILENAME_DEFAULT}
              className="form-input mono"
            />
            <div className="token-help">
              {FILENAME_TOKENS.map((token) => (
                <button
                  key={token}
                  type="button"
                  className="token"
                  onClick={() => {
                    setInvoiceNamingFormat(
                      (current) => `${current}${token}`,
                    );
                  }}
                >
                  {token}
                </button>
              ))}
            </div>
            <p className="field-hint">
              {t("settings.invoiceNamingPreview", {
                name: buildInvoiceFileName(invoiceNamingFormat, {
                  number: "2026-0007",
                  client: "Alza.cz a.s.",
                  supplier: name,
                  issueDate: new Date(2026, 7, 1),
                }),
              })}
            </p>
          </section>

          {/* ---- Expenses -------------------------------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.expensesTitle")}</h2>
            {toggle(
              expenses,
              setExpenses,
              t("settings.expenses"),
              t("settings.expensesDescription"),
            )}
            {expenses ? (
              <>
                <label
                  htmlFor="supplierVatPrefill"
                  className="form-label mt-3"
                >
                  {t("settings.supplierVatPrefillLabel")}
                </label>
                <textarea
                  id="supplierVatPrefill"
                  value={supplierVatPrefill}
                  onChange={(e) => setSupplierVatPrefill(e.target.value)}
                  placeholder={t("settings.supplierVatPrefillPlaceholder")}
                  className="form-textarea mono"
                  rows={3}
                />
                <p className="field-hint">
                  {t("settings.supplierVatPrefillHint")}
                </p>
              </>
            ) : null}
          </section>

          {/* ---- Evolu: sync + the backup phrase --------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.evoluTitle")}</h2>
            <h3 className="subhead">{t("settings.relayTitle")}</h3>

            <div className="sync-state" data-state={
              !isOnline
                ? "offline"
                : isRelayConnected === true
                  ? "on"
                  : isRelayConnected === false
                    ? "off"
                    : "pending"
            }>
              <span className="sync-dot" />
              {!isOnline
                ? t("settings.relayOfflineValue")
                : isRelayConnected === true
                  ? t("settings.relayConnected")
                  : isRelayConnected === false
                    ? t("settings.relayDisconnected")
                    : t("settings.relayConnecting")}
              <span className="sync-meta">
                {t("settings.relayLastSync", {
                  time: lastSyncTime || t("settings.relayNeverSynced"),
                })}
              </span>
            </div>

            <label htmlFor="relayUrl" className="form-label mt-3">
              {t("settings.relayUrlLabel")}
            </label>
            <input
              id="relayUrl"
              type="url"
              value={relayUrl}
              onChange={(e) => setRelayUrlState(e.target.value)}
              placeholder={t("settings.relayUrlPlaceholder")}
              className="form-input mono"
            />
            <p className="field-hint">{t("settings.relayDefault")}</p>
            <button
              onClick={handleSaveRelayUrl}
              disabled={isReconnecting}
              className="btn-secondary mt-2"
            >
              {isReconnecting
                ? t("settings.relaySaving")
                : t("settings.relaySave")}
            </button>

            <h3 className="subhead mt-4">{t("settings.seedTitle")}</h3>
            <p className="field-hint mb-2">{t("settings.seedDescription")}</p>

            {currentMnemonic ? (
              <div className="seed-box">
                {seedRevealed ? (
                  <code className="seed-words">{currentMnemonic}</code>
                ) : (
                  <span className="seed-hidden">{t("settings.seedHidden")}</span>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setSeedRevealed((shown) => !shown)}
                >
                  {seedRevealed ? <EyeOff /> : <Eye />}
                  {seedRevealed
                    ? t("settings.seedHide")
                    : t("settings.seedReveal")}
                </button>
              </div>
            ) : null}

            <button
              type="button"
              className="btn-ghost mt-2"
              onClick={() => setShowMnemonicInput((shown) => !shown)}
            >
              {t("settings.seedUseDifferent")}
            </button>

            {!currentMnemonic || showMnemonicInput ? (
              <div className="mt-2">
                <textarea
                  value={mnemonicInput}
                  onChange={handleMnemonicInput}
                  placeholder={t("settings.seedPlaceholder")}
                  className="form-textarea mono"
                  rows={3}
                />
                {mnemonicError ? (
                  <p className="field-error">{mnemonicError}</p>
                ) : null}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={handleRestoreFromMnemonic}
                    className="btn-secondary"
                  >
                    {t("settings.seedRestore")}
                  </button>
                  <button
                    onClick={handleGenerateMnemonic}
                    className="btn-ghost"
                  >
                    {t("settings.seedGenerate")}
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {/* ---- Bitcoin --------------------------------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.bitcoinTitle")}</h2>
            <label htmlFor="mempoolUrl" className="form-label">
              {t("settings.mempoolLabel")}
            </label>
            <input
              id="mempoolUrl"
              type="url"
              value={mempoolUrl}
              onChange={(e) => setMempoolUrl(e.target.value)}
              placeholder={t("settings.mempoolPlaceholder")}
              className="form-input mono"
            />
            <p className="field-hint">{t("settings.mempoolHint")}</p>
          </section>

          {/* ---- Data ------------------------------------------------ */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.importTitle")}</h2>
            <p className="field-hint mb-2">{t("settings.importHint")}</p>

            {(
              [
                {
                  key: "settings" as const,
                  label: t("settings.importSettingsHeading"),
                  onExport: handleExportSettingsCsv,
                  onImport: handleImportSettingsCsv,
                  ref: importSettingsInputRef,
                  template: "/settings_import_template.csv",
                },
                {
                  key: "bankAccounts" as const,
                  label: t("settings.importBankAccountsHeading"),
                  onExport: handleExportBankAccountsCsv,
                  onImport: handleImportBankAccountsCsv,
                  ref: importBankAccountsInputRef,
                  template: "/bank_accounts_import_template.csv",
                },
                {
                  key: "clients" as const,
                  label: t("settings.importClientsHeading"),
                  onExport: handleExportClientsCsv,
                  onImport: handleImportClientsCsv,
                  ref: importClientsInputRef,
                  template: "/clients_import_template.csv",
                },
                {
                  key: "invoices" as const,
                  label: t("settings.importInvoicesHeading"),
                  onExport: handleExportInvoicesCsv,
                  onImport: handleImportInvoicesCsv,
                  ref: importInvoicesInputRef,
                  template: "/invoices_import_template.csv",
                },
                {
                  key: "expenses" as const,
                  label: t("settings.importExpensesHeading"),
                  onExport: handleExportExpensesCsv,
                  onImport: handleImportExpensesCsv,
                  ref: importExpensesInputRef,
                  template: "/expenses_import_template.csv",
                },
              ]
            ).map((entry) => (
              <div key={entry.key} className="data-row">
                <label className="setting-toggle data-label">
                  <input
                    type="checkbox"
                    checked={exportPick[entry.key]}
                    onChange={(e) =>
                      setExportPick((prev) => ({
                        ...prev,
                        [entry.key]: e.target.checked,
                      }))
                    }
                  />
                  <span>{entry.label}</span>
                </label>
                <div className="data-actions">
                  <input
                    ref={entry.ref}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={entry.onImport}
                    className="hidden"
                  />
                  <button
                    className="btn-secondary"
                    onClick={() => entry.ref.current?.click()}
                  >
                    <Upload />
                    {t("settings.importSettings")}
                  </button>
                  <a href={entry.template} download className="btn-ghost">
                    {t("settings.template")}
                  </a>
                </div>
              </div>
            ))}

            <div className="data-export">
              <button
                className="btn-primary"
                disabled={pickedCount === 0}
                onClick={() => {
                  /* Each dataset is its own CSV, so "export selected" simply
                     runs the ones you ticked. */
                  if (exportPick.settings) handleExportSettingsCsv();
                  if (exportPick.bankAccounts) handleExportBankAccountsCsv();
                  if (exportPick.clients) handleExportClientsCsv();
                  if (exportPick.invoices) handleExportInvoicesCsv();
                  if (exportPick.expenses) handleExportExpensesCsv();
                }}
              >
                <Download />
                {t("settings.exportSelected", { count: pickedCount })}
              </button>
              <button
                className="btn-ghost"
                onClick={() =>
                  setExportPick({
                    settings: allPicked ? false : true,
                    bankAccounts: allPicked ? false : true,
                    clients: allPicked ? false : true,
                    invoices: allPicked ? false : true,
                    expenses: allPicked ? false : true,
                  })
                }
              >
                {allPicked
                  ? t("settings.exportNone")
                  : t("settings.exportAll")}
              </button>
            </div>
          </section>

          {/* ---- Fakturoid ------------------------------------------- */}
          <section className="compose-block">
            <h2 className="compose-heading">{t("settings.fakturoidTitle")}</h2>
            <p className="field-hint mb-2">{t("settings.fakturoidHint")}</p>
            <input
              ref={importFakturoidInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleImportFakturoidXml}
              className="hidden"
            />
            <button
              className="btn-secondary"
              onClick={() => importFakturoidInputRef.current?.click()}
            >
              <Upload />
              {t("settings.fakturoidPick")}
            </button>
          </section>

          {/* ---- Danger zone ----------------------------------------- */}
          <section className="compose-block danger-block">
            <h2 className="compose-heading">{t("settings.dangerTitle")}</h2>
            <p className="field-hint mb-2">{t("settings.dangerHint")}</p>
            <button onClick={handleClearData} className="btn-danger">
              <Trash2 />
              {t("settings.clearData")}
            </button>
          </section>

          <DonatePanel />
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full mt-3"
        >
          {isSaving ? t("settings.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
