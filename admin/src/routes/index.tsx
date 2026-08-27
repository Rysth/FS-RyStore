import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import DashboardLayout from "../layouts/DashboardLayout";
import Dashboard from "../pages/dashboard/Dashboard";
import UsersIndex from "../pages/dashboard/users/UsersIndex";
import BusinessSettings from "../pages/dashboard/business/BusinessSettings";
import ProductsIndex from "../pages/dashboard/catalog/ProductsIndex";
import ProductForm from "../pages/dashboard/catalog/ProductForm";
import CategoriesIndex from "../pages/dashboard/catalog/CategoriesIndex";
import PromotionsIndex from "../pages/dashboard/catalog/PromotionsIndex";
import OrdersIndex from "../pages/dashboard/orders/OrdersIndex";
import OrderForm from "../pages/dashboard/orders/OrderForm";
import OrderDetail from "../pages/dashboard/orders/OrderDetail";
import CouponsIndex from "../pages/dashboard/coupons/CouponsIndex";
import ContactsIndex from "../pages/dashboard/contacts/ContactsIndex";
import ContactDetail from "../pages/dashboard/contacts/ContactDetail";
import ReportsIndex from "../pages/dashboard/reports/ReportsIndex";
import AuthSignIn from "../pages/auth/AuthSignIn";
import AuthConfirm from "../pages/auth/AuthConfirm";
import AuthForgotPassword from "../pages/auth/AuthForgotPassword";
import AuthResetPassword from "../pages/auth/AuthResetPassword";
import AuthVerifyEmail from "../pages/auth/AuthVerifyEmail";
import ProtectedRoute from "../components/routing/ProtectedRoute";
import NotFound from "../pages/errors/NotFound";
import ErrorBoundary from "../components/errors/ErrorBoundary";
import { Permissions } from "../types/auth";
import { useAuthStore } from "../stores/authStore";
import { getDefaultAdminRoute } from "../utils/adminRoutes";

function RootIndexRedirect() {
  const { user, hasPermission, hasAnyPermission } = useAuthStore();

  return (
    <Navigate
      to={getDefaultAdminRoute({ user, hasPermission, hasAnyPermission })}
      replace
    />
  );
}

// Exportar la variable router para que pueda ser importada directamente
export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootIndexRedirect />,
    errorElement: <ErrorBoundary />,
  },
  {
    path: "auth",
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: "signin", element: <AuthSignIn /> },
      // Self-service registration is disabled: this is internal software and
      // accounts are provisioned by an admin. Redirect stale links to sign-in.
      // Restore <AuthSignUp /> here (and its link in AuthSignIn) to re-enable.
      { path: "signup", element: <Navigate to="/auth/signin" replace /> },
      { path: "confirm", element: <AuthConfirm /> },
      { path: "verify-email", element: <AuthVerifyEmail /> },
      { path: "forgot-password", element: <AuthForgotPassword /> },
      { path: "reset-password", element: <AuthResetPassword /> },
      { path: "reset-password/:token", element: <AuthResetPassword /> },
    ],
  },
  {
    path: "identity",
    element: <AuthLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { path: "email_verification", element: <AuthVerifyEmail /> },
      { path: "reset_password", element: <AuthResetPassword /> },
    ],
  },
  {
    path: "dashboard",
    element: <DashboardLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: "users",
        element: (
          <ProtectedRoute requiredPermission={Permissions.VIEW_USERS}>
            <UsersIndex />
          </ProtectedRoute>
        ),
      },
      {
        path: "settings",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.EDIT_PROFILE,
              Permissions.VIEW_BUSINESS,
            ]}
          >
            <BusinessSettings />
          </ProtectedRoute>
        ),
      },
      {
        path: "products",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_CATALOG,
              Permissions.MANAGE_CATALOG,
            ]}
          >
            <ProductsIndex />
          </ProtectedRoute>
        ),
      },
      // Creating and editing are pages, not dialogs, so they need routes of
      // their own — and MANAGE_CATALOG alone, unlike the read-only list.
      {
        path: "products/new",
        element: (
          <ProtectedRoute requiredPermission={Permissions.MANAGE_CATALOG}>
            <ProductForm />
          </ProtectedRoute>
        ),
      },
      {
        path: "products/:id/edit",
        element: (
          <ProtectedRoute requiredPermission={Permissions.MANAGE_CATALOG}>
            <ProductForm />
          </ProtectedRoute>
        ),
      },
      {
        path: "categories",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_CATALOG,
              Permissions.MANAGE_CATALOG,
            ]}
          >
            <CategoriesIndex />
          </ProtectedRoute>
        ),
      },
      {
        // Combos are part of the catalog, so they ride the catalog permissions
        // rather than a pair of their own.
        path: "promotions",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_CATALOG,
              Permissions.MANAGE_CATALOG,
            ]}
          >
            <PromotionsIndex />
          </ProtectedRoute>
        ),
      },
      {
        path: "orders",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_ORDERS,
              Permissions.MANAGE_ORDERS,
            ]}
          >
            <OrdersIndex />
          </ProtectedRoute>
        ),
      },
      {
        path: "orders/new",
        element: (
          <ProtectedRoute requiredPermission={Permissions.MANAGE_ORDERS}>
            <OrderForm />
          </ProtectedRoute>
        ),
      },
      {
        // After orders/new on purpose for readability; React Router ranks the
        // static segment above the dynamic one regardless of order.
        path: "orders/:id",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_ORDERS,
              Permissions.MANAGE_ORDERS,
            ]}
          >
            <OrderDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: "coupons",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_COUPONS,
              Permissions.MANAGE_COUPONS,
            ]}
          >
            <CouponsIndex />
          </ProtectedRoute>
        ),
      },
      {
        path: "contacts",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_CONTACTS,
              Permissions.MANAGE_CONTACTS,
            ]}
          >
            <ContactsIndex />
          </ProtectedRoute>
        ),
      },
      {
        path: "contacts/:id",
        element: (
          <ProtectedRoute
            requiredPermission={[
              Permissions.VIEW_CONTACTS,
              Permissions.MANAGE_CONTACTS,
            ]}
          >
            <ContactDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: "reports",
        element: (
          <ProtectedRoute requiredPermission={Permissions.VIEW_REPORTS}>
            <ReportsIndex />
          </ProtectedRoute>
        ),
      },
      // Add more dashboard routes here
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

export default function AppRoutes() {
  return <RouterProvider router={router} />;
}
