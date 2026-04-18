import { useI18n } from "../i18n";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

export function OfflineBanner() {
  const { t } = useI18n();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-white shadow-md">
      {t("pwa.offline")}
    </div>
  );
}
