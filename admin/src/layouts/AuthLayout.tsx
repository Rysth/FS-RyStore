import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "../stores/authStore";
import { useBusinessStore } from "../stores/businessStore";
import logo from "../assets/logo.svg";
import { getDefaultAdminRoute } from "../utils/adminRoutes";

export default function AuthLayout() {
  const { user, hasPermission, hasAnyPermission } = useAuthStore();
  const location = useLocation();
  const { publicBusiness, fetchPublicBusiness } = useBusinessStore();
  const businessName = publicBusiness?.name || "MicroBiz";
  const businessLogo = publicBusiness?.logo_url || null;
  const defaultRoute = getDefaultAdminRoute({
    user,
    hasPermission,
    hasAnyPermission,
  });

  useEffect(() => {
    if (!publicBusiness) {
      fetchPublicBusiness().catch(() => {});
    }
  }, [publicBusiness, fetchPublicBusiness]);

  useEffect(() => {
    document.body.classList.add("auth-theme");

    return () => {
      document.body.classList.remove("auth-theme");
    };
  }, []);

  const allowedWhileAuthenticated = [
    "/auth/reset-password",
    "/auth/verify-email",
    "/identity/email_verification",
  ];

  const isAllowed = allowedWhileAuthenticated.some((path) =>
    location.pathname.startsWith(path),
  );

  if (user && !isAllowed) {
    return <Navigate to={defaultRoute} replace />;
  }

  return (
    <div className="auth-theme relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#08080C] p-6 sm:p-8">
      {/* Base background */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#08080C] via-[#14141C] to-[#08080C]" />

      {/* Dot grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "radial-gradient(circle, white 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Animated gradient blobs */}
      <div className="absolute -top-32 -left-32 h-[500px] w-[500px] rounded-full bg-[#00E5A0]/20 blur-3xl animate-float" />
      <div className="absolute right-0 top-1/2 h-72 w-72 rounded-full bg-[#7B5CFF]/15 blur-3xl animate-float-delay" />
      <div className="absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[#7B5CFF]/10 blur-3xl animate-float-slow" />

      {/* Pulse ring decoration */}
      <div className="absolute right-20 top-1/4 hidden lg:block">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border border-[#22222E] animate-pulse-ring" />
        </div>
      </div>

      {/* Header - Logo */}
      <div className="absolute inset-x-0 top-0 z-20 flex justify-center p-6 text-lg font-medium sm:p-8 lg:justify-start">
        <Link
          to="/auth/signin"
          className="flex items-center gap-2.5 text-white transition-opacity hover:opacity-80"
        >
          <div className="flex items-center justify-center rounded-xl bg-[#22222E] p-2 backdrop-blur-sm">
            {businessLogo ? (
              <img
                src={businessLogo}
                alt={`Logo ${businessName}`}
                className="h-5 w-5 object-contain"
              />
            ) : (
              <img src={logo} alt="Logo" className="h-5 w-5" />
            )}
          </div>
          <span className="font-semibold tracking-tight">{businessName}</span>
        </Link>
      </div>

      {/* Centered form card */}
      <div className="relative z-10 w-full max-w-[440px] animate-fade-in-up-delay-1">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-black/40 sm:p-8">
          <Outlet />
        </div>
      </div>

      {/* Footer */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center p-6 sm:p-8 lg:justify-end">
        <p className="text-sm text-[#8A8A99]/60 lg:text-right">
          Creado por{" "}
          <a
            href="https://rysthdesign.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[#8A8A99] transition-colors hover:text-white hover:underline underline-offset-4"
          >
            RysthDesign
          </a>
        </p>
      </div>
    </div>
  );
}
