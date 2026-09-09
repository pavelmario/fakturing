import { Suspense } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Receipt,
  Settings2,
  TrendingDown,
  UserRound,
  Users,
} from "lucide-react";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { OfflineBanner } from "./components/OfflineBanner";
import { useI18n } from "./i18n";
import { useLegacyBankAccountMigration } from "./lib/useLegacyBankAccountMigration";
import { useClientIdBackfill } from "./lib/useClientIdBackfill";
import { useInvoiceFooterDefault } from "./lib/useInvoiceFooterDefault";
import { useExpensesEnabled } from "./lib/useExpensesEnabled";
import { useTheme } from "./lib/useTheme";
import "./index.css";

/** What the shell hands down to the pages it frames. */
export type ShellContext = {
  theme: "light" | "dark";
  toggleTheme: () => void;
};

function App() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();

  useLegacyBankAccountMigration();
  useClientIdBackfill();
  useInvoiceFooterDefault();

  const expensesEnabled = useExpensesEnabled();

  /* One list of destinations, rendered twice: as the floating pill bar on a
     wide screen and as a thumb-reachable bottom bar on a phone. Duplicating
     the links rather than the list is what keeps the two from drifting. */
  const primaryLinks = [
    { to: "/", icon: <Receipt />, label: t("app.nav.invoices") },
    { to: "/klienti", icon: <Users />, label: t("app.nav.clients") },
    ...(expensesEnabled
      ? [{ to: "/naklady", icon: <TrendingDown />, label: t("app.nav.expenses") }]
      : []),
  ];

  const utilityLinks = [
    { to: "/profil", icon: <UserRound />, label: t("app.nav.profile") },
    { to: "/nastaveni", icon: <Settings2 />, label: t("app.nav.settings") },
  ];

  const tab = (
    { to, icon, label }: { to: string; icon: React.ReactNode; label: string },
    className: string,
  ) => (
    <NavLink
      key={to}
      to={to}
      className={({ isActive }) =>
        `${className} ${isActive ? "tab-button-active" : "tab-button-inactive"}`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );

  return (
    <div className="app-shell">
      <div className="app-nav-wrap">
        <nav className="app-nav" aria-label={t("app.navLabel")}>
          <div className="app-tabs">
            <span className="app-brand">{t("app.brand")}</span>
            <span className="app-brand-rule" />
            {primaryLinks.map((link) => tab(link, "tab-button"))}
            <span className="ml-auto" />
            {utilityLinks.map((link) => tab(link, "tab-button"))}
          </div>
        </nav>
      </div>

      <div className="app-main">
        <Suspense
          fallback={<div className="app-loading">{t("app.loading")}</div>}
        >
          <Outlet context={{ theme, toggleTheme } satisfies ShellContext} />
        </Suspense>
      </div>

      {/* The phone shell: destinations sit under the thumb, not above the
          fold, and the brand pill is dropped — the page title already says
          where you are and 68px of chrome is a lot on a 844px screen. */}
      <nav className="tab-bar" aria-label={t("app.navLabel")}>
        {[...primaryLinks, ...utilityLinks].map((link) =>
          tab(link, "tab-bar-item"),
        )}
      </nav>

      <PWAUpdatePrompt />
      <OfflineBanner />
    </div>
  );
}

export default App;
