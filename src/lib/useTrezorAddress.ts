import { useCallback, useRef, useState } from "react";
import TrezorConnect from "@trezor/connect-web";
import { useNotify } from "./confirmContext";

/**
 * Fetches the next unused BTC receive address from a connected Trezor.
 *
 * Extracted because the create and detail pages carried identical ~120-line
 * copies of this, including the error-classification table.
 */
export const useTrezorAddress = (
  t: (key: string) => string,
  onAddress: (address: string) => void,
) => {
  const notify = useNotify();
  const [isLoading, setIsLoading] = useState(false);
  const initialized = useRef(false);

  const errorKey = (message?: string) => {
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

  const shouldFallbackToPopup = (message?: string) => {
    const normalized = message?.toLowerCase() ?? "";
    return (
      normalized.includes("desktop_connectionmissing") ||
      normalized.includes("browser_localnetworkpermissionmissing") ||
      normalized.includes("connect-ws")
    );
  };

  const ensureInit = useCallback(
    async (coreMode: "auto" | "popup") => {
      if (initialized.current) return true;
      try {
        const appUrl =
          typeof window === "undefined" || !window.location.origin
            ? "http://localhost"
            : window.location.origin;
        await TrezorConnect.init({
          connectSrc: "https://connect.trezor.io/9/",
          lazyLoad: true,
          coreMode,
          manifest: {
            email: "pavel.mario43@gmail.com",
            appName: "Fakturing",
            appUrl,
          },
        });
        initialized.current = true;
        return true;
      } catch (error) {
        console.error("Trezor init failed", error);
        notify(t("invoiceCreate.trezorInitError"), "error");
        return false;
      }
    },
    [notify, t],
  );

  const load = useCallback(async () => {
    const requestAccountInfo = () =>
      TrezorConnect.getAccountInfo({
        coin: "btc",
        details: "tokens",
        tokens: "derived",
      });

    setIsLoading(true);
    try {
      if (!(await ensureInit("auto"))) return;

      let result = await requestAccountInfo();

      if (!result.success && shouldFallbackToPopup(result.payload?.error)) {
        initialized.current = false;
        await TrezorConnect.dispose();
        if (!(await ensureInit("popup"))) return;
        result = await requestAccountInfo();
      }

      if (!result.success) {
        console.error("Trezor getAccountInfo error", result.payload?.error);
        notify(t(errorKey(result.payload?.error)), "info");
        return;
      }

      const address =
        (result.payload.addresses?.unused ?? []).find((entry) => entry?.address)
          ?.address ?? "";
      if (!address) {
        notify(t("invoiceCreate.trezorNoUnused"), "error");
        return;
      }
      onAddress(address);
    } catch (error) {
      console.error("Trezor request failed", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "";
      notify(t(errorKey(message)), "info");
    } finally {
      setIsLoading(false);
    }
  }, [ensureInit, notify, onAddress, t]);

  return { isLoading, load };
};
