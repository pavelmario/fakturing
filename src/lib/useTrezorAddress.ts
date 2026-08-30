import { useCallback, useEffect, useState } from "react";
import TrezorConnect, { type PermissionRequest } from "@trezor/connect-web";
import { useNotify } from "./confirmContext";

/**
 * Fetches the next unused BTC receive address from a connected Trezor.
 *
 * Extracted because the create and detail pages carried identical ~120-line
 * copies of this, including the error-classification table.
 *
 * Connect 10 keeps the core inside Trezor Suite: a loopback WebSocket when
 * Suite Desktop is running, a popup served by Suite Web otherwise. `coreMode`
 * defaults to "auto", which prefers desktop and switches back to it as soon
 * as it reappears, so the only fallback left here is the local-network
 * permission, which Connect reports without retrying.
 */

/** The `error` half of a failed Connect response, or of a thrown error. */
type ConnectError = { code?: string; message?: string };

/** Nothing guarantees a thrown value's shape, so take only usable strings. */
const asConnectError = (value: unknown): ConnectError => {
  if (typeof value === "string") return { message: value };
  if (typeof value !== "object" || value === null) return {};
  const { code, message } = value as Record<string, unknown>;
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
  };
};

/**
 * Declared up front so Suite asks once, in one prompt. `firstFresh` exports a
 * single address and never the account xpub, so `read_address` is the whole
 * scope we need — `read_xpub` would be the wider `fullAccount` flow.
 */
const REQUESTED_PERMISSIONS: PermissionRequest[] = [
  { permission: "read_address", coin: "btc" },
];

/** Declining in Suite, closing the popup, cancelling — nothing to report. */
const isDeclined = ({ code }: ConnectError) =>
  code === "Method_Cancel" ||
  code === "Method_Interrupted" ||
  code === "Method_PermissionsNotGranted";

const errorKey = ({ code, message }: ConnectError, fallbackKey: string) => {
  if (
    code === "Device_ThpStateMissing" ||
    message?.toLowerCase().includes("thpstate.deserialize invalid state")
  ) {
    return "invoiceCreate.trezorThpInvalid";
  }
  if (code === "Handshake_Error") {
    // Every BootstrapError arrives under this one code — popup-blocked is the
    // only one the user can act on directly, the rest (handshake-timeout,
    // storage-access-denied, …) mean the channel to Suite Web never opened.
    return message === "popup-blocked"
      ? "invoiceCreate.trezorPopupBlocked"
      : "invoiceCreate.trezorSuiteChannelFailed";
  }
  if (
    code === "Transport_Missing" ||
    code === "Desktop_ConnectionMissing" ||
    code === "Browser_LocalNetworkPermissionMissing"
  ) {
    return "invoiceCreate.trezorTransportMissing";
  }
  return fallbackKey;
};

const manifest = () => {
  const appUrl =
    typeof window === "undefined" || !window.location.origin
      ? "http://localhost"
      : window.location.origin;
  // appName is required in Connect 10; appName, appUrl and appIcon are what
  // Suite shows the user in its permission prompt.
  return {
    email: "pavel.mario43@gmail.com",
    appName: "Fakturing",
    appUrl,
    appIcon: `${appUrl}/pwa-64x64.png`,
  };
};

const attemptInit = async (coreMode: "auto" | "suite-web") => {
  try {
    await TrezorConnect.init({
      manifest: manifest(),
      requestedPermissions: REQUESTED_PERMISSIONS,
      coreMode,
    });
    return true as const;
  } catch (error) {
    return asConnectError(error);
  }
};

const runInit = async (): Promise<true | ConnectError> => {
  const first = await attemptInit("auto");
  // "auto" already falls back to the Suite Web popup when Suite Desktop is
  // simply absent; it gives up when the browser refuses the loopback
  // WebSocket outright, so that one retry is ours to make.
  const denied = "Browser_LocalNetworkPermissionMissing";
  if (first === true || first.code !== denied) {
    return first;
  }
  // dispose() is typed void but the implementation returns a promise chain.
  await Promise.resolve(TrezorConnect.dispose());
  return attemptInit("suite-web");
};

/**
 * TrezorConnect is a module singleton, so its init has to be tracked at module
 * scope too. A per-component ref would re-init on every remount, which resets
 * the live instance's callPending counter and undoes the suite-web pinning
 * that the local-network retry just established.
 */
let connectReady: Promise<true | ConnectError> | null = null;

const initConnect = () => {
  const pending = (connectReady ??= runInit());
  return pending.then((result) => {
    // A failure must not be cached: the user can start Suite and retry.
    if (result !== true && connectReady === pending) connectReady = null;
    return result;
  });
};

export const useTrezorAddress = (
  t: (key: string) => string,
  onAddress: (address: string) => void,
) => {
  const notify = useNotify();
  const [isLoading, setIsLoading] = useState(false);

  // Warm Connect up before the click. init() probes the loopback socket, and
  // on a machine without Suite Desktop that can outlast the click's transient
  // user activation — at which point window.open is blocked and the Suite Web
  // popup never appears.
  useEffect(() => {
    void initConnect();
  }, []);

  const report = useCallback(
    (error: ConnectError, fallbackKey = "invoiceCreate.trezorRequestError") => {
      if (isDeclined(error)) return;
      notify(t(errorKey(error, fallbackKey)), "info");
    },
    [notify, t],
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const ready = await initConnect();
      if (ready !== true) {
        console.error("Trezor init failed", ready);
        report(ready, "invoiceCreate.trezorInitError");
        return;
      }

      // Suite runs the account picker, derives the next unused address and
      // asks the device to confirm it. selectionType and
      // requireOnDeviceVerification are optional with no schema default —
      // the defaults live in Suite's popup, which versions independently, so
      // both are stated rather than assumed.
      const result = await TrezorConnect.selectAccount({
        coin: "btc",
        selectionType: "single",
        addressSelection: "firstFresh",
        requireOnDeviceVerification: true,
      });

      if (!result.success) {
        console.error("Trezor selectAccount error", result.error);
        report(result.error);
        return;
      }

      const address = result.payload.find((account) => account.address)
        ?.address;
      if (!address) {
        notify(t("invoiceCreate.trezorNoUnused"), "error");
        return;
      }
      onAddress(address);
    } catch (error) {
      console.error("Trezor request failed", error);
      report(asConnectError(error));
    } finally {
      setIsLoading(false);
    }
  }, [notify, onAddress, report, t]);

  return { isLoading, load };
};
