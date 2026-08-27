import { Navigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { ReactNode, useEffect, useMemo } from "react";
import toast from "react-hot-toast";
import type { PermissionKey } from "../../types/auth";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Permission key(s) required — preferred over requiredRoles */
  requiredPermission?: PermissionKey | PermissionKey[];
  /** Legacy: role names required (kept for backwards-compat) */
  requiredRoles?: string[];
  /** Where to redirect if the user lacks access (default: /dashboard) */
  redirectTo?: string;
}

export default function ProtectedRoute({
  children,
  requiredPermission,
  requiredRoles,
  redirectTo = "/dashboard",
}: ProtectedRouteProps) {
  const { user, hasPermission, hasAnyPermission } = useAuthStore();

  const hasAccess = useMemo(() => {
    if (!user) return false;

    // Permission-based check (preferred)
    if (requiredPermission) {
      const perms = Array.isArray(requiredPermission)
        ? requiredPermission
        : [requiredPermission];
      return hasAnyPermission(...perms);
    }

    // Role-based check (legacy fallback)
    if (requiredRoles) {
      return user.roles.some((role) => requiredRoles.includes(role));
    }

    // No requirements — just need to be authenticated
    return true;
  }, [
    user,
    requiredPermission,
    requiredRoles,
    hasPermission,
    hasAnyPermission,
  ]);

  useEffect(() => {
    if (user && !hasAccess) {
      toast.error("No tienes permisos para acceder a esta sección");
    }
  }, [user, hasAccess]);

  // If no user, redirect to login
  if (!user) {
    return <Navigate to="/auth/signin" />;
  }

  if (!hasAccess) {
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}
