import { Permissions, type PermissionKey, type User } from "../types/auth";
import { IS_RESTAURANT_VERTICAL } from "../config/app";

interface AdminRouteOptions {
  user: User | null;
  hasPermission: (key: PermissionKey) => boolean;
  hasAnyPermission: (...keys: PermissionKey[]) => boolean;
}

export function getDefaultAdminRoute({
  user,
  hasPermission,
  hasAnyPermission,
}: AdminRouteOptions) {
  if (!user) {
    return "/auth/signin";
  }

  if (hasPermission(Permissions.VIEW_DASHBOARD)) {
    return "/dashboard";
  }

  if (hasPermission(Permissions.VIEW_USERS)) {
    return "/dashboard/users";
  }

  // An operator lands on Pedidos: it is the screen they spend the day in, and
  // they have no dashboard permission to fall back on.
  if (hasAnyPermission(Permissions.VIEW_ORDERS, Permissions.MANAGE_ORDERS)) {
    return IS_RESTAURANT_VERTICAL ? "/dashboard/restaurant/orders" : "/dashboard/orders";
  }

  if (
    IS_RESTAURANT_VERTICAL &&
    hasAnyPermission(Permissions.VIEW_CASH_REGISTER, Permissions.MANAGE_CASH_REGISTER)
  ) {
    return "/dashboard/restaurant/cash-register";
  }

  if (
    IS_RESTAURANT_VERTICAL &&
    hasAnyPermission(Permissions.VIEW_KITCHEN, Permissions.COMPLETE_KITCHEN_ORDERS)
  ) {
    return "/dashboard/restaurant/kitchen";
  }

  if (hasAnyPermission(Permissions.VIEW_CATALOG, Permissions.MANAGE_CATALOG)) {
    return "/dashboard/products";
  }

  if (
    hasAnyPermission(
      Permissions.EDIT_PROFILE,
      Permissions.VIEW_BUSINESS,
      Permissions.EDIT_BUSINESS,
    )
  ) {
    return "/dashboard/settings";
  }

  return "/auth/signin";
}
