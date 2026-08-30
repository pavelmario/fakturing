import { BlobProvider, type DocumentProps } from "@react-pdf/renderer";
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
      <div className="pdf-frame">
        <BlobProvider document={document}>
          {({ url, loading, error }) => {
            if (loading || !url) {
              return (
                <div className="pdf-frame-state">
                  {t("invoiceDetail.pdfPreparing")}
                </div>
              );
            }
            if (error) {
              return (
                <div className="pdf-frame-state">
                  {t("invoiceCreate.previewFailed")}
                </div>
              );
            }
            return (
              <iframe
                src={`${url}#toolbar=0&navpanes=0&view=FitH`}
                title={title}
              />
            );
          }}
        </BlobProvider>
      </div>
    </div>
  );
}
