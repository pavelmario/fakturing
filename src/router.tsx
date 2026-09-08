import { Navigate, createBrowserRouter } from "react-router-dom";
import App from "./App";
import {
  ClientDetailRoute,
  ClientsPageRoute,
  ClientsRoute,
  ExpenseCreateRoute,
  ExpenseDetailRoute,
  ExpenseTemplateRoute,
  ExpensesRoute,
  InvoiceCreateRoute,
  InvoiceDetailRoute,
  InvoicesRoute,
  ProfileRoute,
  RequireExpenses,
  SettingsRoute,
} from "./routes";

/**
 * A data router rather than `<BrowserRouter>`: `useBlocker`, which is what
 * stops a half-filled form being navigated away from, only exists on one.
 */
export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { path: "/", element: <InvoicesRoute /> },
      { path: "/faktury/nova", element: <InvoiceCreateRoute /> },
      { path: "/faktury/:invoiceId", element: <InvoiceDetailRoute /> },

      { path: "/klienti", element: <ClientsRoute /> },
      { path: "/klienti/novy", element: <ClientsPageRoute /> },
      { path: "/klienti/:clientId", element: <ClientDetailRoute /> },

      {
        path: "/naklady",
        element: (
          <RequireExpenses>
            <ExpensesRoute />
          </RequireExpenses>
        ),
      },
      {
        path: "/naklady/novy",
        element: (
          <RequireExpenses>
            <ExpenseCreateRoute />
          </RequireExpenses>
        ),
      },
      {
        path: "/naklady/pravidelne/nova",
        element: (
          <RequireExpenses>
            <ExpenseTemplateRoute />
          </RequireExpenses>
        ),
      },
      {
        path: "/naklady/pravidelne/:templateId",
        element: (
          <RequireExpenses>
            <ExpenseTemplateRoute />
          </RequireExpenses>
        ),
      },
      {
        path: "/naklady/:expenseId",
        element: (
          <RequireExpenses>
            <ExpenseDetailRoute />
          </RequireExpenses>
        ),
      },

      { path: "/profil", element: <ProfileRoute /> },
      { path: "/nastaveni", element: <SettingsRoute /> },

      /* Unknown paths fall back rather than blanking. */
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
