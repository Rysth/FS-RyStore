import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";
import {
  Home,
  Users,
  Settings,
  SlidersHorizontal,
  LogOut,
  ChevronsUpDown,
  ChevronRight,
  Package,
  Tags,
  Gift,
  ShoppingBag,
  Tag,
  Contact,
  BarChart3,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useBusinessStore } from "../../stores/businessStore";
import type { User } from "../../types/auth";
import logo from "../../assets/logo.svg";

interface AppSidebarProps {
  user: User;
  canManageUsers: boolean;
  canViewCatalog: boolean;
  canViewOrders: boolean;
  canViewCoupons: boolean;
  canViewContacts: boolean;
  canViewReports: boolean;
  setLogoutModalOpen: (open: boolean) => void;
}

// Helper function to get user initials
const getInitials = (fullname: string): string => {
  if (!fullname) return "U";

  const names = fullname.trim().split(" ");
  if (names.length >= 2) {
    return `${names[0][0]}${names[1][0]}`.toUpperCase();
  }
  return names[0].substring(0, 2).toUpperCase();
};

// Active-state classes shared by nav menu buttons
const activeMenuClasses =
  "relative transition-colors data-[active=true]:bg-sidebar-primary/15 data-[active=true]:font-medium data-[active=true]:text-sidebar-primary-foreground data-[active=true]:before:absolute data-[active=true]:before:bottom-1.5 data-[active=true]:before:left-0 data-[active=true]:before:top-1.5 data-[active=true]:before:w-1 data-[active=true]:before:rounded-r-full data-[active=true]:before:bg-sidebar-primary";

export default function AppSidebar({
  user,
  canManageUsers,
  canViewCatalog,
  canViewOrders,
  canViewCoupons,
  canViewContacts,
  canViewReports,
  setLogoutModalOpen,
}: AppSidebarProps) {
  // Fetch business data so we can show logo + name (cached in store)
  const { fetchPublicBusiness, publicBusiness } = useBusinessStore();
  const { isMobile, state } = useSidebar();
  const location = useLocation();
  const isCollapsed = state === "collapsed";

  // Helper function to check if a menu item is active
  const isActiveRoute = (to: string, end?: boolean) => {
    if (end) {
      return location.pathname === to;
    }
    return location.pathname.startsWith(to);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await fetchPublicBusiness();
      } catch {
        // silent fail
      }
    };
    load();
  }, [fetchPublicBusiness]);

  const isSettingsSectionActive = useMemo(
    () =>
      location.pathname.startsWith("/dashboard/settings") ||
      location.pathname.startsWith("/dashboard/users"),
    [location.pathname],
  );

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/dashboard">
                <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-sidebar-primary/15 ring-1 ring-sidebar-primary/30">
                  {publicBusiness?.logo_url ? (
                    <img
                      src={publicBusiness.logo_url}
                      alt={`Logo ${publicBusiness?.name || "RyStore"}`}
                      className="size-5 object-contain"
                    />
                  ) : (
                    <img src={logo} alt="Logo" className="size-5" />
                  )}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {publicBusiness?.name || "RyStore"}
                  </span>
                  <span className="truncate text-xs text-sidebar-foreground/70">
                    Administración
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Dashboard"
                  isActive={isActiveRoute("/dashboard", true)}
                  className={activeMenuClasses}
                >
                  <NavLink to="/dashboard" end>
                    <Home />
                    <span>Dashboard</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {canViewOrders ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    tooltip="Pedidos"
                    isActive={isActiveRoute("/dashboard/orders")}
                    className={activeMenuClasses}
                  >
                    <NavLink to="/dashboard/orders">
                      <ShoppingBag />
                      <span>Pedidos</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Catálogo groups everything that shapes what's for sale — products,
            categories, and the discount codes that apply to them — so the flat
            item list doesn't grow one row per feature added to the shop. */}
        {(canViewCatalog || canViewCoupons) && (
          <SidebarGroup>
            <SidebarGroupLabel>Catálogo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canViewCatalog ? (
                  <>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        tooltip="Productos"
                        isActive={isActiveRoute("/dashboard/products")}
                        className={activeMenuClasses}
                      >
                        <NavLink to="/dashboard/products">
                          <Package />
                          <span>Productos</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        tooltip="Categorías"
                        isActive={isActiveRoute("/dashboard/categories")}
                        className={activeMenuClasses}
                      >
                        <NavLink to="/dashboard/categories">
                          <Tags />
                          <span>Categorías</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>

                    <SidebarMenuItem>
                      <SidebarMenuButton
                        asChild
                        tooltip="Combos"
                        isActive={isActiveRoute("/dashboard/promotions")}
                        className={activeMenuClasses}
                      >
                        <NavLink to="/dashboard/promotions">
                          <Gift />
                          <span>Combos</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </>
                ) : null}

                {canViewCoupons ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Cupones"
                      isActive={isActiveRoute("/dashboard/coupons")}
                      className={activeMenuClasses}
                    >
                      <NavLink to="/dashboard/coupons">
                        <Tag />
                        <span>Cupones</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Clientes groups who's buying and what that adds up to. */}
        {(canViewContacts || canViewReports) && (
          <SidebarGroup>
            <SidebarGroupLabel>Clientes</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canViewContacts ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Contactos"
                      isActive={isActiveRoute("/dashboard/contacts")}
                      className={activeMenuClasses}
                    >
                      <NavLink to="/dashboard/contacts">
                        <Contact />
                        <span>Contactos</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}

                {canViewReports ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      tooltip="Reportes"
                      isActive={isActiveRoute("/dashboard/reports")}
                      className={activeMenuClasses}
                    >
                      <NavLink to="/dashboard/reports">
                        <BarChart3 />
                        <span>Reportes</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* "Ver tienda" moved to the header badge in DashboardLayout: it
                  is a link out of the panel, not a section of it, and the header
                  is where the store's live/unpublished state belongs. */}

              {/* When collapsed: dropdown menu so sub-items remain accessible */}
              {isCollapsed ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Configuración"
                        className={activeMenuClasses}
                        isActive={isSettingsSectionActive}
                      >
                        <Settings />
                        <span>Configuración</span>
                        <ChevronRight className="ml-auto size-4" />
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      sideOffset={4}
                      className="min-w-48 rounded-lg"
                    >
                      <DropdownMenuLabel>Configuración</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <NavLink
                          to="/dashboard/settings"
                          className="flex items-center gap-2"
                        >
                          <SlidersHorizontal className="size-4" />
                          General
                        </NavLink>
                      </DropdownMenuItem>
                      {canManageUsers ? (
                        <DropdownMenuItem asChild>
                          <NavLink
                            to="/dashboard/users"
                            className="flex items-center gap-2"
                          >
                            <Users className="size-4" />
                            Usuarios
                          </NavLink>
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : (
                /* When expanded: collapsible with smooth animation */
                <Collapsible
                  asChild
                  defaultOpen={isSettingsSectionActive}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="Configuración"
                        className={activeMenuClasses}
                        isActive={isSettingsSectionActive}
                      >
                        <Settings />
                        <span>Configuración</span>
                        <ChevronRight className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActiveRoute("/dashboard/settings")}
                          >
                            <NavLink to="/dashboard/settings">
                              <SlidersHorizontal />
                              <span>General</span>
                            </NavLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>

                        {canManageUsers ? (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActiveRoute("/dashboard/users")}
                            >
                              <NavLink to="/dashboard/users">
                                <Users />
                                <span>Usuarios</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ) : null}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="rounded-md transition-colors data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg ring-1 ring-sidebar-border">
                    <AvatarFallback className="rounded-lg bg-sidebar-primary/20 text-sidebar-primary-foreground">
                      {getInitials(user.fullname)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.fullname || "Usuario"}
                    </span>
                    <span className="truncate text-xs text-sidebar-foreground/70">
                      {user.username ? `@${user.username}` : user.email}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-lg">
                      <AvatarFallback className="rounded-lg">
                        {getInitials(user.fullname)}
                      </AvatarFallback>
                    </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user.fullname || "Usuario"}
                    </span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setLogoutModalOpen(true)}
                  className="flex items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="size-4" />
                  Cerrar Sesión
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
