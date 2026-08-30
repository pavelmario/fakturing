import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useI18n } from "../../i18n";

const ADDRESSES = [
  { key: "donateLightning", value: "poorjames425@walletofsatoshi.com" },
  { key: "donateOnchain", value: "bc1q5jl6nyavkkl37gqkjuh307ckmlh3merh6lp4ua" },
] as const;

/**
 * Lives in Settings rather than under every page: it is a thing you go looking
 * for once, not a permanent fixture of the invoice ledger.
 */
export function DonatePanel() {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard unavailable (insecure context) — the address is selectable */
    }
  };

  return (
    <div className="mb-8">
      <h2 className="settings-section-heading">{t("settings.donateTitle")}</h2>
      <p className="settings-section-description">
        {t("settings.donateDescription")}
      </p>
      <div className="donate-list">
        {ADDRESSES.map(({ key, value }) => (
          <div key={key} className="donate-row">
            <span className="donate-label">{t(`settings.${key}`)}</span>
            <code className="donate-value">{value}</code>
            <button
              type="button"
              className="ledger-action"
              style={{ opacity: 1 }}
              onClick={() => copy(value)}
              aria-label={t(`settings.${key}`)}
              title={t(`settings.${key}`)}
            >
              {copied === value ? <Check /> : <Copy />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
