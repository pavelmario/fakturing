import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Registers the service worker, which is what makes the app installable and
 * lets it open with no network.
 *
 * `registerType: "autoUpdate"` means a new build is taken without asking: the
 * new worker activates and the page reloads, so nobody is left on a bundle from
 * months ago. The prompt that used to ask had stopped appearing — a client that
 * had missed one update never saw the next either — so it was replaced by the
 * update itself rather than by a louder ask.
 *
 * A half-filled form is still not lost over the reload: `useUnsavedGuard` holds
 * the browser's own prompt in front of it while a form is dirty.
 */
export function usePWA() {
  useRegisterSW();
}
