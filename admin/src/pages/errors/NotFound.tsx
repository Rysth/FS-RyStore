import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { useBusinessStore } from "../../stores/businessStore";
import logo from "../../assets/logo.svg";
import { getDefaultAdminRoute } from "../../utils/adminRoutes";

export default function NotFound() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, hasPermission, hasAnyPermission } = useAuthStore();
  const publicBusiness = useBusinessStore((s) => s.publicBusiness);
  const businessName = publicBusiness?.name || "MicroBiz";
  const defaultRoute = getDefaultAdminRoute({
    user,
    hasPermission,
    hasAnyPermission,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      const isAuthPath = location.pathname.startsWith("/auth");
      const isDashboardPath = location.pathname.startsWith("/dashboard");
      const isRootPath = !isAuthPath && !isDashboardPath;

      if (user) {
        navigate(defaultRoute);
      } else {
        if (isDashboardPath) {
          navigate("/auth/signin");
        } else if (isRootPath && location.pathname !== "/") {
          navigate("/auth/signin");
        } else {
          navigate("/auth/signin");
        }
      }
    }, 3000); // Redirect after 3 seconds

    return () => clearTimeout(timer);
  }, [defaultRoute, navigate, location.pathname, user]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 text-center">
      <div className="flex items-center gap-3 mb-8">
        <div className="bg-linear-to-br from-blue-500 to-blue-600 rounded-lg p-2 shadow-sm">
          <img src={logo} alt="Logo MicroStock" className="w-8 h-8" />
        </div>
        <h1 className="font-bold text-2xl bg-linear-to-r from-blue-700 to-blue-500 bg-clip-text text-transparent">
          {businessName}
        </h1>
      </div>

      <h2 className="text-6xl font-bold text-slate-800 mb-4">404</h2>
      <p className="text-2xl font-semibold text-slate-700 mb-2">
        Página no encontrada
      </p>
      <p className="text-slate-500 mb-8">
        La página que buscas no existe o ha sido movida.
      </p>

      <div className="h-12 w-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin"></div>
      <p className="text-sm text-slate-500 mt-4">
        Serás redirigido automáticamente en unos segundos...
      </p>
    </div>
  );
}
