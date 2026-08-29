import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { useEffect, useState } from "react";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Store } from "lucide-react";
import LogoutModal from "../components/shared/LogoutModal";
import AppSidebar from "../components/navigation/AppSidebar";
import { useBusinessStore } from "../stores/businessStore";
import { Permissions } from "../types/auth";
import { getDefaultAdminRoute } from "../utils/adminRoutes";
import { STOREFRONT_URL } from "../utils/storefront";
import { IS_RESTAURANT_VERTICAL } from "../config/app";

export default function DashboardLayout() {
  const { user, hasPermission, hasAnyPermission } = useAuthStore();
  const { business, publicBusiness } = useBusinessStore();
  const location = useLocation();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  // `business` is the owner payload, loaded once Ajustes has been opened;
  // `publicBusiness` is the cached one the sidebar already reads. Defaulting to
  // published means the badge never claims the store is down before it knows.
  const isPublished = (business ?? publicBusiness)?.published !== false;

  useEffect(() => {
    document.body.classList.add("dashboard-theme");

    return () => {
      document.body.classList.remove("dashboard-theme");
    };
  }, []);

  const logoUrl = business?.logo_url || publicBusiness?.logo_url;

  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) return;

    if (logoUrl) {
      const prevHref = link.href;
      const prevType = link.type;
      link.href = logoUrl;
      link.type = "";
      return () => {
        link.href = prevHref;
        link.type = prevType;
      };
    }
  }, [logoUrl]);

  // User needs at least view_dashboard permission to access the layout
  const hasAccess = hasAnyPermission(
    Permissions.VIEW_DASHBOARD,
    Permissions.VIEW_USERS,
    Permissions.VIEW_BUSINESS,
    Permissions.EDIT_PROFILE,
    Permissions.VIEW_CATALOG,
    Permissions.MANAGE_CATALOG,
    Permissions.VIEW_ORDERS,
    Permissions.VIEW_COUPONS,
    Permissions.VIEW_CONTACTS,
    Permissions.VIEW_REPORTS,
    ...(IS_RESTAURANT_VERTICAL
      ? [
          Permissions.VIEW_CASH_REGISTER,
          Permissions.MANAGE_CASH_REGISTER,
          Permissions.VIEW_KITCHEN,
          Permissions.COMPLETE_KITCHEN_ORDERS,
          Permissions.CHARGE_PAYMENTS,
        ]
      : []),
  );
  const canManageUsers = hasPermission(Permissions.VIEW_USERS);
  const canViewCatalog = hasAnyPermission(
    Permissions.VIEW_CATALOG,
    Permissions.MANAGE_CATALOG,
  );
  const canViewOrders = hasAnyPermission(
    Permissions.VIEW_ORDERS,
    Permissions.MANAGE_ORDERS,
  );
  const canViewCoupons = hasAnyPermission(
    Permissions.VIEW_COUPONS,
    Permissions.MANAGE_COUPONS,
  );
  const canViewContacts = hasAnyPermission(
    Permissions.VIEW_CONTACTS,
    Permissions.MANAGE_CONTACTS,
  );
  const canViewReports = hasPermission(Permissions.VIEW_REPORTS);
  const canUseRestaurantOrders =
    IS_RESTAURANT_VERTICAL &&
    hasAnyPermission(
      Permissions.VIEW_ORDERS,
      Permissions.MANAGE_ORDERS,
      Permissions.CHARGE_PAYMENTS,
    );
  const canViewCashRegister =
    IS_RESTAURANT_VERTICAL &&
    hasAnyPermission(
      Permissions.VIEW_CASH_REGISTER,
      Permissions.MANAGE_CASH_REGISTER,
    );
  const canViewKitchen =
    IS_RESTAURANT_VERTICAL &&
    hasAnyPermission(Permissions.VIEW_KITCHEN, Permissions.COMPLETE_KITCHEN_ORDERS);
  const defaultRoute = getDefaultAdminRoute({
    user,
    hasPermission,
    hasAnyPermission,
  });

  // Longest prefix wins, so the form routes under products/ and orders/ get
  // their own label instead of falling through to the dashboard default — which
  // is what exact matching did once creating and editing became pages.
  const BREADCRUMBS: { prefix: string; section: string; page: string }[] = [
    { prefix: "/dashboard/restaurant/orders", section: "HungerApp", page: "Comanda" },
    { prefix: "/dashboard/restaurant/cash-register", section: "HungerApp", page: "Caja" },
    { prefix: "/dashboard/restaurant/kitchen", section: "HungerApp", page: "Cocina" },
    { prefix: "/dashboard/products/new", section: "Tienda", page: "Nuevo producto" },
    { prefix: "/dashboard/products", section: "Tienda", page: "Productos" },
    { prefix: "/dashboard/orders/new", section: "Tienda", page: "Nuevo pedido" },
    { prefix: "/dashboard/orders", section: "Tienda", page: "Pedidos" },
    { prefix: "/dashboard/web-content", section: "Tienda", page: "Sitio web" },
    { prefix: "/dashboard/categories", section: "Tienda", page: "Categorías" },
    { prefix: "/dashboard/coupons", section: "Tienda", page: "Cupones" },
    { prefix: "/dashboard/contacts", section: "Tienda", page: "Contactos" },
    { prefix: "/dashboard/reports", section: "Dashboard", page: "Reportes" },
    { prefix: "/dashboard/users", section: "Dashboard", page: "Usuarios" },
    { prefix: "/dashboard/settings", section: "Dashboard", page: "Configuración" },
  ];

  const getBreadcrumbs = () => {
    const path = location.pathname;

    // "/dashboard/products/12/edit" has no prefix of its own; it shares the
    // catalog's, and the page's own heading says which product it is.
    const match = [...BREADCRUMBS]
      .sort((a, b) => b.prefix.length - a.prefix.length)
      .find((entry) => path === entry.prefix || path.startsWith(`${entry.prefix}/`));

    if (match) return { section: match.section, page: match.page };
    return { section: "Dashboard", page: "Panel de Control" };
  };

  const breadcrumbs = getBreadcrumbs();

  if (!user) {
    return <Navigate to="/auth/signin" />;
  }

  if (!hasAccess) {
    return <Navigate to={defaultRoute} replace />;
  }

  return (
    <div className="dashboard-theme">
      <SidebarProvider>
        <AppSidebar
          user={user}
          canManageUsers={canManageUsers}
          canViewCatalog={canViewCatalog}
          canViewOrders={canViewOrders}
          canViewCoupons={canViewCoupons}
          canViewContacts={canViewContacts}
          canViewReports={canViewReports}
          canUseRestaurantOrders={canUseRestaurantOrders}
          canViewCashRegister={canViewCashRegister}
          canViewKitchen={canViewKitchen}
          setLogoutModalOpen={setLogoutModalOpen}
        />
        <SidebarInset>
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/50 bg-card/85 px-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70 md:h-16 md:px-6">
            <SidebarTrigger className="-ml-1 size-9 md:size-8" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            {/* Mobile: show page title only */}
            <span className="truncate text-base font-semibold md:hidden">
              {breadcrumbs.page}
            </span>
            {/* Desktop: full breadcrumb */}
            <Breadcrumb className="hidden md:flex">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="/dashboard">
                    {breadcrumbs.section}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{breadcrumbs.page}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>

            {/* Moved out of the sidebar: this leaves the panel for the public
                storefront, which is a separate origin, so it is a plain anchor.
                It carries the live/offline state because that is the thing the
                shop needs to see from every page, not only from Ajustes. */}
            <a
              href={STOREFRONT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                isPublished
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-400"
              }`}
              title={
                isPublished
                  ? "La tienda está en vivo. Abrir en una pestaña nueva"
                  : "La tienda está fuera de línea para tus clientes. Abrir en una pestaña nueva"
              }
            >
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${
                  isPublished ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              <Store className="size-3.5" />
              <span className="hidden sm:inline">
                {isPublished
                  ? IS_RESTAURANT_VERTICAL ? "Menú en vivo" : "Tienda en vivo"
                  : IS_RESTAURANT_VERTICAL ? "Menú fuera de línea" : "Tienda fuera de línea"}
              </span>
              <ExternalLink className="size-3" />
            </a>
          </header>
          <div className="mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
            <Outlet />
          </div>
        </SidebarInset>
        {/* Logout Modal */}
        <LogoutModal
          isOpen={logoutModalOpen}
          onClose={() => setLogoutModalOpen(false)}
        />
      </SidebarProvider>
    </div>
  );
}
