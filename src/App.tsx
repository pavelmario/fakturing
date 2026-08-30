import { Suspense, use, useMemo } from "react";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import * as Evolu from "@evolu/common";
import { useQuery } from "@evolu/react";
import {
  Receipt,
  Settings2,
  TrendingDown,
  UserRound,
  Users,
} from "lucide-react";
import { ClientDetailPage } from "./components/ClientDetailPage";
import { ClientsListPage } from "./components/ClientsListPage";
import { ClientsPage } from "./components/ClientsPage";
import { ExpenseCreatePage } from "./components/ExpenseCreatePage";
import { ExpenseDetailPage } from "./components/ExpenseDetailPage";
import { ExpensesListPage } from "./components/ExpensesListPage";
import { InvoiceCreatePage } from "./components/InvoiceCreatePage";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { InvoiceListPage } from "./components/InvoiceListPage";
import { SettingsPage } from "./components/SettingsPage";
import { ProfilePage } from "./components/ProfilePage";
import { PWAUpdatePrompt } from "./components/PWAUpdatePrompt";
import { OfflineBanner } from "./components/OfflineBanner";
import { useEvolu } from "./evolu";
import { useI18n } from "./i18n";
import { useLegacyBankAccountMigration } from "./lib/useLegacyBankAccountMigration";
import { useClientIdBackfill } from "./lib/useClientIdBackfill";
import { useTheme } from "./lib/useTheme";
import "./index.css";

/** Wrappers exist so the pages keep their plain callback props. */
function InvoicesRoute() {
  const navigate = useNavigate();
  return (
    <InvoiceListPage
      onCreateInvoice={() => navigate("/faktury/nova")}
      onViewDetails={(id) => navigate(`/faktury/${id}`)}
      onOpenProfile={() => navigate("/profil")}
    />
  );
}

function InvoiceCreateRoute() {
  const navigate = useNavigate();
  return <InvoiceCreatePage onInvoiceCreated={() => navigate("/")} />;
}

function ClientsPageRoute() {
  const navigate = useNavigate();
  return <ClientsPage onClientCreated={() => navigate("/klienti")} />;
}

function ExpenseCreateRoute() {
  const navigate = useNavigate();
  return <ExpenseCreatePage onExpenseCreated={() => navigate("/naklady")} />;
}

function InvoiceDetailRoute() {
  const navigate = useNavigate();
  const { invoiceId = "" } = useParams();
  return (
    <InvoiceDetailPage
      key={invoiceId}
      invoiceId={invoiceId}
      onBack={() => navigate("/")}
      onInvoiceDeleted={() => navigate("/")}
      onDuplicate={(search) => navigate(`/faktury/nova?${search}`)}
    />
  );
}

function ClientsRoute() {
  const navigate = useNavigate();
  return (
    <ClientsListPage
      onViewDetails={(id) => navigate(`/klienti/${id}`)}
      onCreateClient={() => navigate("/klienti/novy")}
    />
  );
}

function ClientDetailRoute() {
  const navigate = useNavigate();
  const { clientId = "" } = useParams();
  return (
    <ClientDetailPage
      key={clientId}
      clientId={clientId}
      onBack={() => navigate("/klienti")}
      onClientDeleted={() => navigate("/klienti")}
      onViewInvoice={(id) => navigate(`/faktury/${id}`)}
      onCreateInvoice={(search) => navigate(`/faktury/nova?${search}`)}
    />
  );
}

function ExpensesRoute() {
  const navigate = useNavigate();
  return (
    <ExpensesListPage
      onCreateExpense={() => navigate("/naklady/novy")}
      onViewDetails={(id) => navigate(`/naklady/${id}`)}
    />
  );
}

function ExpenseDetailRoute() {
  const navigate = useNavigate();
  const { expenseId = "" } = useParams();
  return (
    <ExpenseDetailPage
      key={expenseId}
      expenseId={expenseId}
      onBack={() => navigate("/naklady")}
      onExpenseDeleted={() => navigate("/naklady")}
    />
  );
}

function App() {
  const { t } = useI18n();
  const evolu = useEvolu();
  const owner = use(evolu.appOwner);
  const { theme, toggleTheme } = useTheme();

  useLegacyBankAccountMigration();
  useClientIdBackfill();

  const profileQuery = useMemo(
    () =>
      evolu.createQuery((db) =>
        db
          .selectFrom("userProfile")
          .select(["expenses", "vatPayer"])
          .where("ownerId", "=", owner.id)
          .where("isDeleted", "is not", Evolu.sqliteTrue)
          .orderBy("updatedAt", "desc")
          .limit(1),
      ),
    [evolu, owner.id],
  );

  const profile = useQuery(profileQuery)[0] ?? null;
  /* Expense tracking exists for VAT machinery, so being a VAT payer turns it
     on. It stays an explicit toggle for anyone who wants it regardless. */
  const expensesEnabled =
    profile?.expenses == null
      ? profile?.vatPayer === Evolu.sqliteTrue
      : profile.expenses === Evolu.sqliteTrue;

  const tab = (to: string, icon: React.ReactNode, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `tab-button ${isActive ? "tab-button-active" : "tab-button-inactive"}`
      }
    >
      {icon}
      {label}
    </NavLink>
  );

  return (
    <Suspense fallback={<div className="app-loading">{t("app.loading")}</div>}>
      <div className="app-shell">
        <div className="fixed inset-x-0 top-3 z-20 px-4 sm:px-6">
          <div className="app-nav">
            <div className="app-tabs">
              <span className="app-brand">{t("app.brand")}</span>
              <span className="app-brand-rule" />
              {tab("/", <Receipt />, t("app.nav.invoices"))}
              {tab("/klienti", <Users />, t("app.nav.clients"))}
              {expensesEnabled
                ? tab("/naklady", <TrendingDown />, t("app.nav.expenses"))
                : null}
              <span className="ml-auto" />
              {tab("/profil", <UserRound />, t("app.nav.profile"))}
              {tab("/nastaveni", <Settings2 />, t("app.nav.settings"))}
            </div>
          </div>
        </div>

        <div className="mt-20">
          <Routes>
            <Route path="/" element={<InvoicesRoute />} />
            <Route path="/faktury/nova" element={<InvoiceCreateRoute />} />
            <Route path="/faktury/:invoiceId" element={<InvoiceDetailRoute />} />

            <Route path="/klienti" element={<ClientsRoute />} />
            <Route
              path="/klienti/novy"
              element={<ClientsPageRoute />}
            />
            <Route path="/klienti/:clientId" element={<ClientDetailRoute />} />

            {expensesEnabled ? (
              <>
                <Route path="/naklady" element={<ExpensesRoute />} />
                <Route
                  path="/naklady/novy"
                  element={<ExpenseCreateRoute />}
                />
                <Route
                  path="/naklady/:expenseId"
                  element={<ExpenseDetailRoute />}
                />
              </>
            ) : null}

            <Route
              path="/profil"
              element={<ProfilePage onSaved={() => undefined} />}
            />
            <Route
              path="/nastaveni"
              element={
                <SettingsPage
                  theme={theme}
                  onToggleTheme={toggleTheme}
                  onSettingsSaved={() => undefined}
                />
              }
            />

            {/* Unknown or disabled paths fall back rather than blanking. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
        <PWAUpdatePrompt />
        <OfflineBanner />
      </div>
    </Suspense>
  );
}

export default App;
