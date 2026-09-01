import { BlobProvider, type DocumentProps } from "@react-pdf/renderer";
import { FileText } from "lucide-react";
import type { ReactElement } from "react";
import { useI18n } from "../../i18n";

type InvoicePdfPreviewProps = {
  /** Built by `useInvoicePdfDocument`, so the download action can live
   *  wherever the page needs it. */
  document: ReactElement<DocumentProps>;
  title: string;
};

/** The finished document, rendered inline. */
export function InvoicePdfPreview({ document, title }: InvoicePdfPreviewProps) {
  const { t } = useI18n();

  return (
    <div className="pdf-preview">
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
              <div className="pdf-frame">
                <iframe
                  src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                  title={title}
                />
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
