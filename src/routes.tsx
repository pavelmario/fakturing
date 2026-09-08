import type { ReactNode } from "react";
import { Navigate, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { ShellContext } from "./App";
import { ClientDetailPage } from "./components/ClientDetailPage";
import { ClientsListPage } from "./components/ClientsListPage";
import { ClientsPage } from "./components/ClientsPage";
import { ExpenseCreatePage } from "./components/ExpenseCreatePage";
import { ExpenseDetailPage } from "./components/ExpenseDetailPage";
import { ExpensesListPage } from "./components/ExpensesListPage";
import { ExpenseTemplatePage } from "./components/ExpenseTemplatePage";
import { InvoiceCreatePage } from "./components/InvoiceCreatePage";
import { InvoiceDetailPage } from "./components/InvoiceDetailPage";
import { InvoiceListPage } from "./components/InvoiceListPage";
import { ProfilePage } from "./components/ProfilePage";
import { SettingsPage } from "./components/SettingsPage";
import { useExpensesEnabled } from "./lib/useExpensesEnabled";

/** Wrappers exist so the pages keep their plain callback props. */
export function InvoicesRoute() {
  const navigate = useNavigate();
  return (
    <InvoiceListPage
      onCreateInvoice={() => navigate("/faktury/nova")}
      onViewDetails={(id) => navigate(`/faktury/${id}`)}
      onOpenProfile={() => navigate("/profil")}
    />
  );
}

export function InvoiceCreateRoute() {
  const navigate = useNavigate();
  return <InvoiceCreatePage onInvoiceCreated={() => navigate("/")} />;
}

export function InvoiceDetailRoute() {
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

export function ClientsRoute() {
  const navigate = useNavigate();
  return (
    <ClientsListPage
      onViewDetails={(id) => navigate(`/klienti/${id}`)}
      onCreateClient={() => navigate("/klienti/novy")}
    />
  );
}

export function ClientsPageRoute() {
  const navigate = useNavigate();
  return <ClientsPage onClientCreated={() => navigate("/klienti")} />;
}

export function ClientDetailRoute() {
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

export function ExpensesRoute() {
  const navigate = useNavigate();
  return (
    <ExpensesListPage
      onCreateExpense={() => navigate("/naklady/novy")}
      onViewDetails={(id) => navigate(`/naklady/${id}`)}
      onCreateTemplate={() => navigate("/naklady/pravidelne/nova")}
      onEditTemplate={(id) => navigate(`/naklady/pravidelne/${id}`)}
    />
  );
}

export function ExpenseCreateRoute() {
  const navigate = useNavigate();
  return <ExpenseCreatePage onExpenseCreated={() => navigate("/naklady")} />;
}

export function ExpenseTemplateRoute() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  return (
    <ExpenseTemplatePage
      key={templateId ?? "new"}
      templateId={templateId}
      onDone={() => navigate("/naklady")}
    />
  );
}

export function ExpenseDetailRoute() {
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

export function ProfileRoute() {
  return <ProfilePage onSaved={() => undefined} />;
}

export function SettingsRoute() {
  const { theme, toggleTheme } = useOutletContext<ShellContext>();
  return (
    <SettingsPage
      theme={theme}
      onToggleTheme={toggleTheme}
      onSettingsSaved={() => undefined}
    />
  );
}

/** Costs are a section you can switch off; its URLs go with it. */
export function RequireExpenses({ children }: { children: ReactNode }) {
  return useExpensesEnabled() ? <>{children}</> : <Navigate to="/" replace />;
}
