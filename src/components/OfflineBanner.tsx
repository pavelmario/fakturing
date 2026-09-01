import { useI18n } from "../i18n";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBanner() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return <div className="offline-banner">{t("pwa.offline")}</div>;
}
