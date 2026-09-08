import { BlobProvider, type DocumentProps } from "@react-pdf/renderer";
import { FileText, Paperclip } from "lucide-react";
import type { ReactElement } from "react";
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

/** The finished document, rendered inline — and draggable. */
export function InvoicePdfPreview({
  document,
  title,
  dragFileName,
  prompt = false,
  onDragged,
}: InvoicePdfPreviewProps) {
  const { t } = useI18n();

  return (
    <div
      className="pdf-preview"
      data-draggable={Boolean(dragFileName)}
      data-prompt={prompt}
    >
      <BlobProvider document={document}>
        {({ url, loading, error }) => {
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
          return (
            <>
              {/* The frame is the drag source rather than a chip beside it:
                  what you want to put in the mail is the sheet you are
                  looking at. The viewer inside stops taking the pointer so
                  the drag can start on it — reading the document at full
                  size is what the link below is for. */}
              <div
                className="pdf-frame"
                draggable={Boolean(dragFileName)}
                title={
                  dragFileName && !prompt
                    ? t("invoiceDetail.dragHelp")
                    : undefined
                }
                /* Clicking it is the other way of saying "I have seen it" —
                   plenty of people attach the file their own way. */
                onClick={() => onDragged?.()}
                onDragStart={(event) => {
                  if (!dragFileName) return;
                  event.dataTransfer.setData(
                    "DownloadURL",
                    `application/pdf:${dragFileName}:${url}`,
                  );
                  event.dataTransfer.effectAllowed = "copy";
                  onDragged?.();
                }}
              >
                <iframe
                  src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                  title={title}
                />
                {/* Only while the mail is waiting for it. A sheet standing
                    there with a caption on it is decoration; the ask belongs
                    to the moment the compose window opened. */}
                {dragFileName && prompt ? (
                  <span className="pdf-drag-hint">
                    <Paperclip />
                    {t("invoiceDetail.dragPrompt")}
                  </span>
                ) : null}
              </div>
              {/* Mobile browsers do not render a framed PDF — iOS Safari
                  draws an empty box — so the phone gets a link to the real
                  viewer instead of a blank sheet of paper. */}
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
        }}
      </BlobProvider>
    </div>
  );
}
