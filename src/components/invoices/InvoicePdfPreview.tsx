import { BlobProvider, type DocumentProps } from "@react-pdf/renderer";
import { FileText, Paperclip } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { useI18n } from "../../i18n";

type InvoicePdfPreviewProps = {
  /** Built by `useInvoicePdfDocument`, so the download action can live
   *  wherever the page needs it. */
  document: ReactElement<DocumentProps>;
  title: string;
  /**
   * The name the file takes when it is dragged out of the page. Given one,
   * the sheet becomes the drag source: Chrome hands a dragged file to
   * whatever it is dropped on, so the invoice goes straight into the mail
   * that `Poslat e-mailem` just opened, without being downloaded first.
   */
  dragFileName?: string;
  /**
   * Raised the moment the mail client is opened: at that point the sheet is
   * not decoration but the next thing to do, and a caption in the corner is
   * not what someone coming back from a compose window is looking for.
   */
  prompt?: boolean;
  /** Called once the invoice has been picked up, so the prompt can drop. */
  onDragged?: () => void;
};

/**
 * Whether this browser can hand a file to the desktop at all.
 *
 * `DownloadURL` is a Chromium convention, not a standard: Firefox has had the
 * request open since 2010 and WebKit never took it. There is nothing to
 * feature detect — `setData` accepts any type name and reports nothing back —
 * so the engine is the question, asked twice because the hints object exists
 * only in a secure context and the app may be opened over plain http.
 *
 * Getting it wrong the safe way matters more than getting it right: a sheet
 * that says "drag me" and does nothing is the failure being reported, while
 * one that stays still keeps its viewer scrollable and its export button.
 */
const dragOutSupported = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return "userAgentData" in navigator || /Chrome\//.test(navigator.userAgent);
};

/**
 * Base64 costs a third on top, and the string crosses a process boundary on
 * every drag. Past this the blob URL carries the drag instead.
 */
const MAX_INLINE = 4_000_000;

type SheetProps = Omit<InvoicePdfPreviewProps, "document"> & {
  url: string;
  blob: Blob | null;
};

function PdfSheet({
  url,
  blob,
  title,
  dragFileName,
  prompt = false,
  onDragged,
}: SheetProps) {
  const { t } = useI18n();
  const [canDrag] = useState(dragOutSupported);
  /* Kept with the blob it was read from, so a document that changes while
     the last one is still being read cannot be dragged out as the old one. */
  const [inline, setInline] = useState<{ of: Blob; url: string } | null>(null);
  const draggable = Boolean(dragFileName) && canDrag;
  const dragUrl = inline && inline.of === blob ? inline.url : url;

  /**
   * The document as a `data:` URL, which is what the drag hands over.
   *
   * A `blob:` URL is the obvious thing to pass and the one that has been
   * failing on Windows: it is a handle into this tab's blob registry, and
   * the drop is resolved by the browser itself, outside the page, after the
   * mouse is released. A `data:` URL carries the bytes instead, so there is
   * nothing left to resolve — and the same string works on every platform.
   */
  useEffect(() => {
    if (!blob || !draggable) return;
    let alive = true;
    const reader = new FileReader();
    reader.onload = () => {
      const read = typeof reader.result === "string" ? reader.result : "";
      /* Too big for a string that crosses a process boundary on every drag —
         `dragUrl` then stays the blob URL, which is the old behaviour. */
      if (alive && read && read.length <= MAX_INLINE) {
        setInline({ of: blob, url: read });
      }
    };
    reader.readAsDataURL(blob);
    return () => {
      alive = false;
      reader.abort();
    };
  }, [blob, draggable]);

  return (
    <>
      {/* The frame is the drag source rather than a chip beside it: what you
          want to put in the mail is the sheet you are looking at. The viewer
          inside stops taking the pointer so the drag can start on it —
          reading the document at full size is what the link below is for.
          Where the browser cannot drag a file out, the frame stays a frame
          and the viewer keeps the pointer. */}
      <div
        className="pdf-frame"
        draggable={draggable}
        title={draggable && !prompt ? t("invoiceDetail.dragHelp") : undefined}
        /* Clicking it is the other way of saying "I have seen it" — plenty
           of people attach the file their own way. */
        onClick={() => onDragged?.()}
        onDragStart={(event) => {
          if (!draggable) return;
          event.dataTransfer.setData(
            "DownloadURL",
            `application/pdf:${dragFileName}:${dragUrl}`,
          );
          event.dataTransfer.effectAllowed = "copy";
          onDragged?.();
        }}
      >
        <iframe
          src={`${url}#toolbar=0&navpanes=0&view=FitH`}
          title={title}
        />
        {/* Only while the mail is waiting for it. A sheet standing there with
            a caption on it is decoration; the ask belongs to the moment the
            compose window opened — and where the ask cannot be met, the
            banner says what to do instead of asking for a drag that will
            quietly do nothing. */}
        {dragFileName && prompt ? (
          <span className="pdf-drag-hint" data-plain={!canDrag}>
            <Paperclip />
            {canDrag
              ? t("invoiceDetail.dragPrompt")
              : t("invoiceDetail.dragUnsupported")}
          </span>
        ) : null}
      </div>
      {/* Mobile browsers do not render a framed PDF — iOS Safari draws an
          empty box — so the phone gets a link to the real viewer instead of a
          blank sheet of paper. */}
      <a
        className="pdf-open btn-secondary"
        href={url}
        target="_blank"
        rel="noreferrer"
      >
        <FileText />
        {t("invoiceDetail.pdfOpen")}
      </a>
    </>
  );
}

/** The finished document, rendered inline — and draggable. */
export function InvoicePdfPreview({
  document,
  ...sheet
}: InvoicePdfPreviewProps) {
  const { t } = useI18n();

  return (
    <div
      className="pdf-preview"
      data-draggable={Boolean(sheet.dragFileName)}
      data-prompt={sheet.prompt}
    >
      <BlobProvider document={document}>
        {({ blob, url, loading, error }) => {
          if (loading || !url) {
            return (
              <div className="pdf-frame">
                <div className="pdf-frame-state">
                  {t("invoiceDetail.pdfPreparing")}
                </div>
              </div>
            );
          }
          if (error) {
            return (
              <div className="pdf-frame">
                <div className="pdf-frame-state">
                  {t("invoiceCreate.previewFailed")}
                </div>
              </div>
            );
          }
          return <PdfSheet {...sheet} url={url} blob={blob} />;
        }}
      </BlobProvider>
    </div>
  );
}
