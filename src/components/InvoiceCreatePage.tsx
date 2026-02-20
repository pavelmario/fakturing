import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import TrezorConnectWeb from "@trezor/connect-web";
import TrezorConnectMobile from "@trezor/connect-mobile";
import { useEvolu } from "../evolu";
import { useI18n } from "../i18n";

type InvoiceItemForm = {
  amount: string;
  unit: string;
  description: string;
  unitPrice: string;
  vat: string;
};

type InvoiceNumberRow = {
  id: string;
  invoiceNumber: string | null;
};

const emptyItem = (): InvoiceItemForm => ({
  amount: "",
  unit: "",
  description: "",
  unitPrice: "",
  vat: "",
});

const parseBooleanParam = (value: string | null): boolean | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
};

const parseItemsParam = (value: string | null): InvoiceItemForm[] | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const normalized = parsed
      .filter((item) => item && typeof item === "object")
      .map((item) => ({
        amount: item.amount === 0 || item.amount ? String(item.amount) : "",
        unit: typeof item.unit === "string" ? item.unit : "",
        description:
          typeof item.description === "string" ? item.description : "",
        unitPrice:
          item.unitPrice === 0 || item.unitPrice ? String(item.unitPrice) : "",
        vat: item.vat === 0 || item.vat ? String(item.vat) : "",
      }))
      .filter(
        (item) =>
          item.description ||
          item.unit ||
          item.amount ||
          item.unitPrice ||
          item.vat,
      );
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  }
};

const formatUiTotal = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CZK",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const TREZOR_CONNECT_SRC = "https://connect.trezor.io/9/";
const TREZOR_MOBILE_CALLBACK_STORAGE_KEY = "fakturing:trezor-mobile-callback";
const TREZOR_MOBILE_BROADCAST_CHANNEL = "fakturing-trezor-mobile-callback";
const INVOICE_CREATE_DRAFT_STORAGE_KEY = "fakturing:invoice-create-draft";

type TrezorInitMode = "desktop-auto" | "desktop-popup" | "mobile";
type InvoiceCreateDraft = {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  paymentDays: string;
  paymentMethod: string;
  purchaseOrderNumber: string;
  btcInvoice: boolean;
  btcAddress: string;
  items: InvoiceItemForm[];
};

export function InvoiceCreatePage() {
  const { t, locale } = useI18n();
  const searchParams =
    typeof window === "undefined"
      ? new URLSearchParams("")
      : new URLSearchParams(window.location.search);
  const getParam = (key: string) => searchParams.get(key);

  const initialInvoiceNumber =
    getParam("invoiceNumber") ?? getParam("number") ?? "";
  const initialClientName = getParam("clientName") ?? getParam("client") ?? "";
  const initialIssueDate = getParam("issueDate") ?? getParam("date") ?? "";
  const initialPaymentDays = getParam("paymentDays") ?? "";
  const initialPurchaseOrderNumber =
    getParam("purchaseOrderNumber") ?? getParam("po") ?? "";
  const initialPaymentMethod = (() => {
    const raw = getParam("paymentMethod") ?? getParam("payment") ?? "";
    const value = raw ? raw.trim().toLowerCase() : "";
    return value === "cash" || value === "bank" ? value : "bank";
  })();
  const initialBtcInvoice =
    parseBooleanParam(getParam("btcInvoice") ?? getParam("bitcoin")) ?? false;
  const initialBtcAddress = getParam("btcAddress") ?? "";
  const initialVatParam = getParam("vat") ?? getParam("vatPercent") ?? "";
  const initialUnitParam = getParam("unit") ?? getParam("itemUnit") ?? "";
  const parsedItems = parseItemsParam(getParam("items"));
  const initialItems = (() => {
    if (parsedItems) {
      return parsedItems.map((it) => ({
        amount: it.amount ?? "",
        unit: it.unit || initialUnitParam || "",
        description: it.description ?? "",
        unitPrice: it.unitPrice ?? "",
        vat: it.vat || initialVatParam || "",
      }));
    }

    const item = emptyItem();
    if (initialVatParam) item.vat = initialVatParam;
    if (initialUnitParam) item.unit = initialUnitParam;
    return [item];
  })();

  const evolu = useEvolu();
  const owner = use(evolu.appOwner);

  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [invoiceNumberTouched, setInvoiceNumberTouched] = useState(
    Boolean(initialInvoiceNumber),
  );
  const [clientName, setClientName] = useState(initialClientName);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [paymentDays, setPaymentDays] = useState(initialPaymentDays || "14");
  const [paymentMethod, setPaymentMethod] = useState(initialPaymentMethod);
  const [purchaseOrderNumber, setPurchaseOrderNumber] = useState(
    initialPurchaseOrderNumber,
  );
  const [btcInvoice, setBtcInvoice] = useState(initialBtcInvoice);
  const [btcAddress, setBtcAddress] = useState(initialBtcAddress);
  const [isTrezorLoading, setIsTrezorLoading] = useState(false);
  const [items, setItems] = useState<InvoiceItemForm[]>(initialItems);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const trezorInitModeRef = useRef<TrezorInitMode | null>(null);
  const isMobileTrezorEnv =
    typeof navigator !== "undefined" &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  const clientsQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("client")
          .select(["id", "name"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .orderBy("name", "asc"),
      ),
    [evolu, owner.id],
  );

  const clients = useQuery(clientsQuery);

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["vatPayer", "poRequired"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profileRows = useQuery(profileQuery);
  const profile = profileRows[0];
  const isVatPayer = profile?.vatPayer === Evolu.sqliteTrue;
  const isPoRequired = profile?.poRequired === Evolu.sqliteTrue;

  const invoiceTotal = items.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    const unitPrice = Number(item.unitPrice) || 0;
    return sum + amount * unitPrice;
  }, 0);

  const currentYear = new Date().getFullYear();
  const yearPrefix = `${currentYear}-`;
  const yearPrefixPattern = useMemo(
    () => Evolu.NonEmptyTrimmedString100.orThrow(`${yearPrefix}%`),
    [yearPrefix],
  );
  const latestInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue)
          .where("invoiceNumber", "like", yearPrefixPattern)
          .orderBy("invoiceNumber", "desc")
          .limit(1),
      ),
    [evolu, owner.id, yearPrefixPattern],
  );

  const latestInvoiceRows = useQuery(latestInvoiceQuery);
  const latestInvoiceNumber = latestInvoiceRows[0]?.invoiceNumber ?? "";

  const trimmedInvoiceNumber = invoiceNumber.trim();
  const invoiceNumberResult = useMemo(
    () => Evolu.NonEmptyTrimmedString100.from(trimmedInvoiceNumber),
    [trimmedInvoiceNumber],
  );
  const duplicateInvoiceQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("invoice")
          .select(["id", "invoiceNumber"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .where("deleted", "is not", Evolu.sqliteTrue),
      ),
    [evolu, owner.id],
  );

  const duplicateInvoices = useQuery(
    duplicateInvoiceQuery,
  ) as readonly InvoiceNumberRow[];
  const hasDuplicateInvoiceNumber = Boolean(
    invoiceNumberResult.ok &&
    duplicateInvoices.some((row) => row.invoiceNumber === trimmedInvoiceNumber),
  );

  useEffect(() => {
    if (issueDate) return;
    const todayIso = new Date().toISOString().slice(0, 10);
    setIssueDate(todayIso);
  }, [issueDate]);

  useEffect(() => {
    if (invoiceNumberTouched) return;
    if (invoiceNumber.trim()) return;

    let nextNumber = 1;
    if (latestInvoiceNumber.startsWith(yearPrefix)) {
      const parts = latestInvoiceNumber.split("-");
      const suffix = parts[parts.length - 1];
      const parsed = Number.parseInt(suffix, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        nextNumber = parsed + 1;
      }
    }

    const padded = String(nextNumber).padStart(4, "0");
    setInvoiceNumber(`${currentYear}-${padded}`);
  }, [
    currentYear,
    invoiceNumber,
    invoiceNumberTouched,
    latestInvoiceNumber,
    yearPrefix,
  ]);

  const toNullable = (value: string) => {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  const getTrezorErrorKey = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";

    if (normalized.includes("thpstate.deserialize invalid state")) {
      return "invoiceCreate.trezorThpInvalid";
    }

    if (
      normalized.includes("transport is missing") ||
      normalized.includes("desktop_connectionmissing") ||
      normalized.includes("browser_localnetworkpermissionmissing") ||
      normalized.includes("connect-ws")
    ) {
      return "invoiceCreate.trezorTransportMissing";
    }

    return "invoiceCreate.trezorRequestError";
  };

  const shouldFallbackToPopupMode = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";
    return (
      normalized.includes("desktop_connectionmissing") ||
      normalized.includes("browser_localnetworkpermissionmissing") ||
      normalized.includes("connect-ws")
    );
  };

  const applyTrezorAddress = useCallback((address: string) => {
    const normalized = address.trim();
    if (!normalized) return;

    setBtcInvoice(true);
    setBtcAddress(normalized);
    setIsTrezorLoading(false);
  }, []);

  const publishTrezorAddressAcrossTabs = useCallback((address: string) => {
    if (typeof window === "undefined") return;
    const normalized = address.trim();
    if (!normalized) return;

    const payload = JSON.stringify({
      address: normalized,
      timestamp: Date.now(),
    });

    try {
      window.localStorage.setItem(TREZOR_MOBILE_CALLBACK_STORAGE_KEY, payload);
    } catch {
      /* ignore storage restrictions */
    }

    try {
      if (typeof BroadcastChannel !== "undefined") {
        const channel = new BroadcastChannel(TREZOR_MOBILE_BROADCAST_CHANNEL);
        channel.postMessage({ address: normalized, timestamp: Date.now() });
        channel.close();
      }
    } catch {
      /* ignore unsupported channel */
    }
  }, []);

  const clearTrezorCallbackPayload = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(TREZOR_MOBILE_CALLBACK_STORAGE_KEY);
    } catch {
      /* ignore storage restrictions */
    }
  }, []);

  const persistInvoiceDraft = useCallback(() => {
    if (typeof window === "undefined") return;

    const draft: InvoiceCreateDraft = {
      invoiceNumber,
      clientName,
      issueDate,
      paymentDays,
      paymentMethod,
      purchaseOrderNumber,
      btcInvoice,
      btcAddress,
      items,
    };

    try {
      window.localStorage.setItem(
        INVOICE_CREATE_DRAFT_STORAGE_KEY,
        JSON.stringify(draft),
      );
    } catch {
      /* ignore storage restrictions */
    }
  }, [
    btcAddress,
    btcInvoice,
    clientName,
    invoiceNumber,
    issueDate,
    items,
    paymentDays,
    paymentMethod,
    purchaseOrderNumber,
  ]);

  const clearInvoiceDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(INVOICE_CREATE_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore storage restrictions */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const hasTrezorCallback = params.has("trezorCallback");
    if (!hasTrezorCallback) return;

    const rawDraft = window.localStorage.getItem(INVOICE_CREATE_DRAFT_STORAGE_KEY);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as Partial<InvoiceCreateDraft>;

      if (typeof parsed.invoiceNumber === "string") {
        setInvoiceNumber(parsed.invoiceNumber);
        setInvoiceNumberTouched(Boolean(parsed.invoiceNumber.trim()));
      }
      if (typeof parsed.clientName === "string") setClientName(parsed.clientName);
      if (typeof parsed.issueDate === "string") setIssueDate(parsed.issueDate);
      if (typeof parsed.paymentDays === "string") setPaymentDays(parsed.paymentDays);
      if (parsed.paymentMethod === "bank" || parsed.paymentMethod === "cash") {
        setPaymentMethod(parsed.paymentMethod);
      }
      if (typeof parsed.purchaseOrderNumber === "string") {
        setPurchaseOrderNumber(parsed.purchaseOrderNumber);
      }
      if (typeof parsed.btcInvoice === "boolean") setBtcInvoice(parsed.btcInvoice);
      if (typeof parsed.btcAddress === "string") setBtcAddress(parsed.btcAddress);
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        setItems(
          parsed.items.map((item) => ({
            amount: item?.amount ?? "",
            unit: item?.unit ?? "",
            description: item?.description ?? "",
            unitPrice: item?.unitPrice ?? "",
            vat: item?.vat ?? "",
          })),
        );
      }
    } catch {
      /* ignore malformed draft */
    }
  }, []);

  useEffect(() => {
    if (!isMobileTrezorEnv || typeof window === "undefined") return;

    const consumeAddressPayload = (raw: string | null) => {
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { address?: string };
        if (parsed.address) {
          applyTrezorAddress(parsed.address);
          clearTrezorCallbackPayload();
        }
      } catch {
        /* ignore malformed payload */
      }
    };

    const existingPayload = window.localStorage.getItem(
      TREZOR_MOBILE_CALLBACK_STORAGE_KEY,
    );
    consumeAddressPayload(existingPayload);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== TREZOR_MOBILE_CALLBACK_STORAGE_KEY) return;
      consumeAddressPayload(event.newValue);
    };

    window.addEventListener("storage", onStorage);

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(TREZOR_MOBILE_BROADCAST_CHANNEL);
        channel.onmessage = (event) => {
          const address =
            typeof event.data === "object" && event.data
              ? (event.data as { address?: string }).address
              : undefined;
          if (address) applyTrezorAddress(address);
        };
      }
    } catch {
      /* ignore channel init failures */
    }

    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
    };
  }, [applyTrezorAddress, clearTrezorCallbackPayload, isMobileTrezorEnv]);

  useEffect(() => {
    if (!isMobileTrezorEnv || typeof window === "undefined") return;

    const processDeeplinkResponse = () => {
      const currentUrl = new URL(window.location.href);
      const hasId = currentUrl.searchParams.has("id");
      const hasResponse = currentUrl.searchParams.has("response");
      const hasTrezorCallback = currentUrl.searchParams.has("trezorCallback");
      const isCallbackUrl = hasTrezorCallback || hasId || hasResponse;

      if (!isCallbackUrl) return;

      TrezorConnectMobile.handleDeeplink(window.location.href);

      const responseRaw = currentUrl.searchParams.get("response");
      if (responseRaw) {
        try {
          const parsed = JSON.parse(responseRaw) as {
            success?: boolean;
            payload?: { address?: string };
          };
          const callbackAddress = parsed.payload?.address?.trim() ?? "";
          if (parsed.success && callbackAddress) {
            applyTrezorAddress(callbackAddress);
            publishTrezorAddressAcrossTabs(callbackAddress);
            clearTrezorCallbackPayload();
          }
        } catch (error) {
          console.error("Failed to parse Trezor callback response", error);
        }
      }

      currentUrl.searchParams.delete("id");
      currentUrl.searchParams.delete("response");
      currentUrl.searchParams.delete("trezorCallback");
      window.history.replaceState({}, "", currentUrl.toString());
    };

    processDeeplinkResponse();
    window.addEventListener("pageshow", processDeeplinkResponse);
    window.addEventListener("focus", processDeeplinkResponse);

    return () => {
      window.removeEventListener("pageshow", processDeeplinkResponse);
      window.removeEventListener("focus", processDeeplinkResponse);
    };
  }, [
    applyTrezorAddress,
    clearTrezorCallbackPayload,
    isMobileTrezorEnv,
    publishTrezorAddressAcrossTabs,
  ]);

  const ensureTrezorInit = useCallback(
    async (coreMode: "auto" | "popup") => {
      if (
        !isMobileTrezorEnv &&
        ((coreMode === "auto" &&
          trezorInitModeRef.current === "desktop-auto") ||
          (coreMode === "popup" &&
            trezorInitModeRef.current === "desktop-popup"))
      ) {
        return true;
      }

      if (isMobileTrezorEnv && trezorInitModeRef.current === "mobile")
        return true;

      try {
        const appUrl =
          typeof window === "undefined" || !window.location.origin
            ? "http://localhost"
            : window.location.origin;

        if (isMobileTrezorEnv) {
          const callbackUrl =
            typeof window === "undefined"
              ? "https://localhost"
              : (() => {
                  const url = new URL(
                    window.location.origin + window.location.pathname,
                  );
                  url.searchParams.set("trezorCallback", "1");
                  return url.toString();
                })();

          await TrezorConnectMobile.init({
            manifest: {
              email: "pavel.mario43@gmail.com",
              appName: "Fakturing",
              appUrl,
            },
            deeplinkOpen: (url) => {
              if (typeof window === "undefined") return;
              window.location.assign(url);
            },
            deeplinkCallbackUrl: callbackUrl,
          });

          trezorInitModeRef.current = "mobile";
          return true;
        }

        await TrezorConnectWeb.init({
          connectSrc: TREZOR_CONNECT_SRC,
          lazyLoad: true,
          coreMode,
          manifest: {
            email: "pavel.mario43@gmail.com",
            appName: "Fakturing",
            appUrl,
          },
        });
        trezorInitModeRef.current =
          coreMode === "popup" ? "desktop-popup" : "desktop-auto";
        return true;
      } catch (error) {
        console.error("Trezor init failed", error);
        alert(t("invoiceCreate.trezorInitError"));
        return false;
      }
    },
    [isMobileTrezorEnv, t],
  );

  const handleLoadFromTrezor = useCallback(async () => {
    const requestDesktopAccountInfo = () =>
      TrezorConnectWeb.getAccountInfo({
        coin: "btc",
        details: "tokens",
        tokens: "derived",
      });

    setIsTrezorLoading(true);
    try {
      const ready = await ensureTrezorInit("auto");
      if (!ready) return;

      if (isMobileTrezorEnv) {
        persistInvoiceDraft();

        const accountInput = window.prompt(
          "Select BTC account index (0 = first account)",
          "0",
        );
        if (accountInput === null) return;

        const addressInput = window.prompt(
          "Select BTC address index (0 = first address)",
          "0",
        );
        if (addressInput === null) return;

        const accountIndex = Number.parseInt(accountInput.trim(), 10);
        const addressIndex = Number.parseInt(addressInput.trim(), 10);

        if (
          Number.isNaN(accountIndex) ||
          accountIndex < 0 ||
          Number.isNaN(addressIndex) ||
          addressIndex < 0
        ) {
          alert(t("invoiceCreate.trezorRequestError"));
          return;
        }

        const path = `m/84'/0'/${accountIndex}'/0/${addressIndex}`;
        const mobileResult = await TrezorConnectMobile.getAddress({
          coin: "btc",
          path,
          showOnTrezor: false,
        });

        if (!mobileResult.success) {
          console.error("Trezor getAddress error", mobileResult.payload?.error);
          alert(t(getTrezorErrorKey(mobileResult.payload?.error)));
          return;
        }

        const address = mobileResult.payload.address ?? "";
        if (!address) {
          alert(t("invoiceCreate.trezorNoUnused"));
          return;
        }

        setBtcAddress(address);
        return;
      }

      let result = await requestDesktopAccountInfo();

      if (
        !isMobileTrezorEnv &&
        !result.success &&
        shouldFallbackToPopupMode(result.payload?.error)
      ) {
        trezorInitModeRef.current = null;
        await TrezorConnectWeb.dispose();

        const fallbackReady = await ensureTrezorInit("popup");
        if (!fallbackReady) return;

        result = await requestDesktopAccountInfo();
      }

      if (!result.success) {
        console.error("Trezor getAccountInfo error", result.payload?.error);
        alert(t(getTrezorErrorKey(result.payload?.error)));
        return;
      }

      const unused = result.payload.addresses?.unused ?? [];
      const used = result.payload.addresses?.used ?? [];
      const change = result.payload.addresses?.change ?? [];
      const address =
        unused.find((entry) => entry?.address)?.address ??
        used.find((entry) => entry?.address)?.address ??
        change.find((entry) => entry?.address)?.address ??
        "";
      if (!address) {
        alert(t("invoiceCreate.trezorNoUnused"));
        return;
      }

      setBtcAddress(address);
    } catch (error) {
      console.error("Trezor request failed", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "";
      alert(t(getTrezorErrorKey(message)));
    } finally {
      setIsTrezorLoading(false);
    }
  }, [ensureTrezorInit, isMobileTrezorEnv, persistInvoiceDraft, t]);

  const updateItem = (
    index: number,
    field: keyof InvoiceItemForm,
    value: string,
  ) => {
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item,
      ),
    );
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);

  const removeItem = (index: number) => {
    setItems((prev) =>
      prev.length === 1 ? prev : prev.filter((_, idx) => idx !== index),
    );
  };

  const handleSave = async () => {
    setSaveMessage(null);

    if (!trimmedInvoiceNumber) {
      alert(t("alerts.invoiceNumberRequired"));
      return;
    }
    if (!clientName.trim()) {
      alert(t("alerts.invoiceClientRequired"));
      return;
    }
    if (!issueDate.trim()) {
      alert(t("alerts.issueDateRequired"));
      return;
    }

    const paymentDaysNumber = Number(paymentDays);
    if (Number.isNaN(paymentDaysNumber) || paymentDaysNumber < 0) {
      alert(t("alerts.paymentDaysInvalid"));
      return;
    }

    const formatTypeError = Evolu.createFormatTypeError();
    const issueDateResult = Evolu.dateToDateIso(new Date(issueDate));
    if (!issueDateResult.ok) {
      console.error(
        "Issue date error:",
        formatTypeError(issueDateResult.error),
      );
      alert(t("alerts.issueDateInvalid"));
      return;
    }

    const paymentDaysResult = Evolu.NonNegativeNumber.from(paymentDaysNumber);
    if (!paymentDaysResult.ok) {
      console.error(
        "Payment days error:",
        formatTypeError(paymentDaysResult.error),
      );
      alert(t("alerts.paymentDaysInvalid"));
      return;
    }

    if (hasDuplicateInvoiceNumber) {
      const confirmed = confirm(t("alerts.duplicateInvoiceConfirm"));
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      const normalizedItems = items
        .map((item) => ({
          amount: Number.isFinite(Number(item.amount))
            ? Number(item.amount)
            : 0,
          unit: item.unit.trim(),
          description: item.description.trim(),
          unitPrice: Number.isFinite(Number(item.unitPrice))
            ? Number(item.unitPrice)
            : 0,
          vat: Number.isFinite(Number(item.vat)) ? Number(item.vat) : 0,
        }))
        .filter(
          (item) =>
            item.description ||
            item.unit ||
            item.amount ||
            item.unitPrice ||
            item.vat,
        );

      const itemsResult = Evolu.Json.from(JSON.stringify(normalizedItems));
      if (!itemsResult.ok) {
        console.error("Items error:", formatTypeError(itemsResult.error));
        alert(t("alerts.invoiceItemsInvalid"));
        return;
      }

      const payload = {
        invoiceNumber: trimmedInvoiceNumber,
        clientName: clientName.trim(),
        issueDate: issueDateResult.value,
        duzp: isVatPayer ? issueDateResult.value : null,
        paymentDays: paymentDaysResult.value,
        paymentMethod,
        purchaseOrderNumber: toNullable(purchaseOrderNumber),
        btcInvoice: btcInvoice ? Evolu.sqliteTrue : Evolu.sqliteFalse,
        btcAddress: toNullable(btcAddress),
        items: itemsResult.value,
        deleted: Evolu.sqliteFalse,
      };

      const validation = evolu.insert("invoice", payload, {
        onlyValidate: true,
      });
      if (!validation.ok) {
        console.error("Validation error:", formatTypeError(validation.error));
        console.error("Invoice payload:", payload);
        alert(t("alerts.invoiceSaveValidation"));
        return;
      }

      const result = evolu.insert("invoice", payload);

      if (!result.ok) {
        console.error("Validation error:", formatTypeError(result.error));
        alert(t("alerts.invoiceSaveValidation"));
        return;
      }

      setSaveMessage(t("alerts.invoiceSaved"));
      setInvoiceNumber("");
      setClientName("");
      setIssueDate("");
      setPaymentDays("14");
      setPaymentMethod("bank");
      setPurchaseOrderNumber("");
      setBtcInvoice(false);
      setBtcAddress("");
      setIsTrezorLoading(false);
      setItems([emptyItem()]);
      clearTrezorCallbackPayload();
      clearInvoiceDraft();
    } catch (error) {
      console.error("Error saving invoice:", error);
      alert(t("alerts.invoiceSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-shell">
      <div className="page-container-lg">
        <div className="page-card-lg">
          <div className="mb-6">
            <p className="section-title">{t("invoiceCreate.sectionTitle")}</p>
            <h1 className="page-title">{t("invoiceCreate.title")}</h1>
          </div>

          {saveMessage ? (
            <div className="mb-6 alert-success">{saveMessage}</div>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="invoiceNumber" className="form-label">
                {t("invoiceCreate.invoiceNumberLabel")}
              </label>
              <input
                id="invoiceNumber"
                type="text"
                value={invoiceNumber}
                onChange={(e) => {
                  setInvoiceNumberTouched(true);
                  setInvoiceNumber(e.target.value);
                }}
                placeholder={t("invoiceCreate.invoiceNumberPlaceholder")}
                className="form-input"
              />
            </div>

            <div>
              <label htmlFor="clientName" className="form-label">
                {t("invoiceCreate.clientLabel")}
              </label>
              <select
                id="clientName"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="form-select"
              >
                <option value="">{t("invoiceCreate.clientPlaceholder")}</option>
                {clients.map((client) => (
                  <option
                    key={client.id}
                    value={client.name ?? ""}
                    disabled={!client.name}
                  >
                    {client.name ?? t("invoiceCreate.clientUnnamed")}
                  </option>
                ))}
              </select>
              {clients.length === 0 ? (
                <p className="text-xs text-slate-500 mt-2">
                  {t("invoiceCreate.clientsEmpty")}
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-3">
              <input
                id="btcInvoice"
                type="checkbox"
                checked={btcInvoice}
                onChange={(e) => setBtcInvoice(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor="btcInvoice"
                className="text-sm font-medium text-slate-700"
              >
                {t("invoiceCreate.btcInvoiceLabel")}
              </label>
            </div>

            {btcInvoice ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="btcAddress" className="form-label">
                    {t("invoiceCreate.btcAddressLabel")}
                  </label>
                  {!btcAddress.trim() ? (
                    <button
                      type="button"
                      onClick={handleLoadFromTrezor}
                      disabled={isTrezorLoading}
                      className="btn-secondary"
                    >
                      {isTrezorLoading
                        ? t("invoiceCreate.trezorLoading")
                        : t("invoiceCreate.trezorLoad")}
                    </button>
                  ) : null}
                </div>
                <input
                  id="btcAddress"
                  type="text"
                  value={btcAddress}
                  onChange={(e) => setBtcAddress(e.target.value)}
                  placeholder={t("invoiceCreate.btcAddressPlaceholder")}
                  className="form-input"
                />
              </div>
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="issueDate" className="form-label">
                  {t("invoiceCreate.issueDateLabel")}
                </label>
                <input
                  id="issueDate"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label htmlFor="paymentDays" className="form-label">
                  {t("invoiceCreate.paymentDaysLabel")}
                </label>
                <input
                  id="paymentDays"
                  type="number"
                  min={0}
                  value={paymentDays}
                  onChange={(e) => setPaymentDays(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div>
              <label htmlFor="paymentMethod" className="form-label">
                {t("invoiceCreate.paymentMethodLabel")}
              </label>
              <select
                id="paymentMethod"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="form-select"
              >
                <option value="bank">
                  {t("invoiceCreate.paymentMethodBank")}
                </option>
                <option value="cash">
                  {t("invoiceCreate.paymentMethodCash")}
                </option>
              </select>
            </div>
            {isPoRequired ? (
              <div>
                <label htmlFor="purchaseOrderNumber" className="form-label">
                  {t("invoiceCreate.purchaseOrderLabel")}
                </label>
                <input
                  id="purchaseOrderNumber"
                  type="text"
                  value={purchaseOrderNumber}
                  onChange={(e) => setPurchaseOrderNumber(e.target.value)}
                  placeholder={t("invoiceCreate.purchaseOrderPlaceholder")}
                  className="form-input"
                />
              </div>
            ) : null}

            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t("invoiceCreate.itemsTitle")}
                </h2>
                <button
                  type="button"
                  onClick={addItem}
                  className="btn-secondary"
                >
                  {t("invoiceCreate.addItem")}
                </button>
              </div>

              <div className="space-y-4">
                {items.map((item, index) => (
                  <div key={index} className="panel-card space-y-3">
                    <div>
                      <label
                        htmlFor={`item-${index}-description`}
                        className="form-label"
                      >
                        {t("invoiceCreate.itemDescription")}
                      </label>
                      <input
                        id={`item-${index}-description`}
                        type="text"
                        value={item.description}
                        onChange={(e) =>
                          updateItem(index, "description", e.target.value)
                        }
                        placeholder={t(
                          "invoiceCreate.itemDescriptionPlaceholder",
                        )}
                        className="form-input"
                      />
                    </div>

                    <div
                      className={`grid grid-cols-1 ${
                        isVatPayer ? "md:grid-cols-4" : "md:grid-cols-3"
                      } gap-3`}
                    >
                      <div>
                        <label
                          htmlFor={`item-${index}-amount`}
                          className="form-label"
                        >
                          {t("invoiceCreate.itemAmount")}
                        </label>
                        <input
                          id={`item-${index}-amount`}
                          type="number"
                          min={0}
                          value={item.amount}
                          onChange={(e) =>
                            updateItem(index, "amount", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`item-${index}-unit`}
                          className="form-label"
                        >
                          {t("invoiceCreate.itemUnit")}
                        </label>
                        <input
                          id={`item-${index}-unit`}
                          type="text"
                          value={item.unit}
                          onChange={(e) =>
                            updateItem(index, "unit", e.target.value)
                          }
                          placeholder={t("invoiceCreate.itemUnitPlaceholder")}
                          className="form-input"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`item-${index}-unitPrice`}
                          className="form-label"
                        >
                          {t("invoiceCreate.itemUnitPrice")}
                        </label>
                        <input
                          id={`item-${index}-unitPrice`}
                          type="number"
                          min={0}
                          step="0.1"
                          value={item.unitPrice}
                          onChange={(e) =>
                            updateItem(index, "unitPrice", e.target.value)
                          }
                          className="form-input"
                        />
                      </div>

                      {isVatPayer ? (
                        <div>
                          <label
                            htmlFor={`item-${index}-vat`}
                            className="form-label"
                          >
                            {t("invoiceCreate.itemVat")}
                          </label>
                          <input
                            id={`item-${index}-vat`}
                            type="number"
                            min={0}
                            step="0.1"
                            value={item.vat}
                            onChange={(e) =>
                              updateItem(index, "vat", e.target.value)
                            }
                            className="form-input"
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                        className="btn-danger"
                      >
                        {t("invoiceCreate.itemRemove")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-card text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                {t("invoiceCreate.totalLabel")}
              </span>{" "}
              {formatUiTotal(invoiceTotal, locale)}
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary mt-6 w-full"
          >
            {isSaving ? t("invoiceCreate.saving") : t("invoiceCreate.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
