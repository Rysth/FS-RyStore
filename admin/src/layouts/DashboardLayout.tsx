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
import LogoutModal from "../components/shared/LogoutModal";
import AppSidebar from "../components/navigation/AppSidebar";
import { Permissions } from "../types/auth";
import { getDefaultAdminRoute } from "../utils/adminRoutes";

export default function DashboardLayout() {
  const { user, hasPermission, hasAnyPermission } = useAuthStore();
  const location = useLocation();
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  useEffect(() => {
    document.body.classList.add("dashboard-theme");

    return () => {
      document.body.classList.remove("dashboard-theme");
    };
  }, []);

  // User needs at least view_dashboard permission to access the layout
  const hasAccess = hasAnyPermission(
    Permissions.VIEW_DASHBOARD,
    Permissions.VIEW_USERS,
    Permissions.VIEW_BUSINESS,
    Permissions.EDIT_PROFILE,
  );
  const canManageUsers = hasPermission(Permissions.VIEW_USERS);
  const defaultRoute = getDefaultAdminRoute({
    user,
    hasPermission,
    hasAnyPermission,
  });

  // Generate breadcrumbs based on current path
  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === "/dashboard") {
      return { section: "Dashboard", page: "Panel de Control" };
    } else if (path === "/dashboard/users") {
      return { section: "Dashboard", page: "Usuarios" };
    } else if (path === "/dashboard/settings") {
      return { section: "Dashboard", page: "Configuración" };
    }
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
