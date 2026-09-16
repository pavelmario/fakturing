/**
 * The invoice as a file the OS share sheet hands to a mail client.
 *
 * The share sheet is the default handover: the OS opens a new message with the
 * invoice already attached, which `mailto:` cannot do, and where a client refuses
 * a browser file drop — the new Outlook is a WebView and does not take the
 * Chromium `DownloadURL` promise — it is the only handover left. It cannot
 * prefill the recipient, so the address goes to the clipboard and the app says so.
 */

import { withCrlf } from "./invoiceEmail";

export const invoiceFile = (blob: Blob, fileName: string): File =>
  new File([blob], fileName, { type: "application/pdf" });

export const shareInvoice = async (
  file: File,
  subject: string,
  body: string,
): Promise<void> => {
  await navigator.share({
    files: [file],
    title: subject,
    text: withCrlf(body),
  });
};

/**
 * The recipient onto the clipboard, for the share sheet that cannot take it.
 *
 * Fired before the sheet opens, and deliberately not awaited: the sheet needs the
 * click's transient activation, and waiting on the clipboard can spend it. A refused
 * clipboard is not worth an error — the address is in the invoice anyway.
 */
export const copyAddress = async (address: string): Promise<boolean> => {
  if (!address) return false;
  try {
    await navigator.clipboard.writeText(address);
    return true;
  } catch {
    return false;
  }
};
