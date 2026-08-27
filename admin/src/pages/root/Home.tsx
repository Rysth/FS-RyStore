import { Link } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { Permissions } from "../../types/auth";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  RiDashboardLine,
  RiLogoutBoxRLine,
  RiLoginBoxLine,
} from "@remixicon/react";

const getRoleLabel = (role: string) => {
  switch (role) {
    case "admin":
      return "Administrador";
    case "manager":
      return "Gerente";
    case "operator":
      return "Operador";
    case "user":
      return "Usuario";
    default:
      return role;
  }
};

export default function Home() {
  const { user, logout, isLoading, hasPermission } = useAuthStore();

  const canAccessDashboard = hasPermission(Permissions.VIEW_DASHBOARD);

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Sesión cerrada correctamente");
    } catch {
      toast.error("Error al cerrar sesión");
    }
  };

  return (
    <section className="flex flex-col items-center justify-center min-h-screen p-4 bg-base-100">
      <div className="flex flex-col items-center w-full max-w-md space-y-12 text-center">
        {user ? (
          <div className="w-full space-y-8 duration-700 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
                Bienvenido
              </h1>
              <p className="text-xl font-medium text-base-content/60">
                {user.fullname}
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center justify-center w-24 h-24 mb-4 text-3xl font-bold rounded-full shadow-xl bg-secondary text-secondary-content ring-4 ring-base-100">
                  {user.fullname?.charAt(0).toUpperCase() || "U"}
                </div>
                <div className="space-y-1">
                  <p className="text-lg font-medium">@{user.username}</p>
                  <p className="text-sm text-base-content/60">{user.email}</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {user.roles && user.roles.length > 0 ? (
                    user.roles.map((role) => (
                      <Badge
                        key={role}
                        variant="secondary"
                        className="px-4 py-1 rounded-full"
                      >
                        {getRoleLabel(role)}
                      </Badge>
                    ))
                  ) : (
                    <Badge variant="outline" className="rounded-full">
                      Sin roles
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col justify-center gap-3 pt-4 sm:flex-row">
                {canAccessDashboard && (
                  <Button asChild className="h-12 px-8 rounded-full" size="lg">
                    <Link to="/dashboard">
                      <RiDashboardLine className="w-4 h-4 mr-2" />
                      Dashboard
                    </Link>
                  </Button>
                )}
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="h-12 px-8 rounded-full text-base-content/60 hover:text-error"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    "Cerrando..."
                  ) : (
                    <>
                      <RiLogoutBoxRLine className="w-4 h-4 mr-2" />
                      Cerrar Sesión
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-8 duration-700 animate-in fade-in slide-in-from-bottom-4">
            <div className="space-y-4">
              <h1 className="text-4xl font-bold tracking-tight lg:text-5xl">
                Bienvenido
              </h1>
              <p className="text-lg text-base-content/60">
                Inicia sesión para acceder a la plataforma
              </p>
            </div>
            <Button
              asChild
              size="lg"
              className="h-12 px-10 text-base rounded-full"
            >
              <Link to="/auth/signin">
                <RiLoginBoxLine className="w-4 h-4 mr-2" />
                Iniciar Sesión
              </Link>
            </Button>
          </div>
        )}

        <p className="text-sm text-base-content/30">
          Creado por{" "}
          <a
            href="https://rysthdesign.com/"
            className="font-medium transition-colors hover:text-primary"
            target="_blank"
            rel="noopener noreferrer"
          >
            RysthDesign
          </a>
        </p>
      </div>
    </section>
  );
}
