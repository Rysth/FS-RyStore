import { Permissions, type PermissionKey, type User } from "../types/auth";

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