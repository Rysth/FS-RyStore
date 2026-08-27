import { Toaster, ToastBar } from "react-hot-toast";
import AppRoutes from "./routes";
import { useEffect } from "react";
import { useDocumentTitle } from "./hooks/useDocumentTitle";
import { useAuthStore } from "./stores/authStore";
import { useIsMobile } from "./hooks/use-mobile";

function App() {
  const isMobile = useIsMobile();
  const validateSession = useAuthStore((state) => state.validateSession);

  // Initialize document title with business data
  useDocumentTitle();

  useEffect(() => {
    validateSession();
  }, [validateSession]);

  return (
    <>
      <AppRoutes />
      <Toaster
        position={isMobile ? "bottom-center" : "bottom-right"}
        gutter={12}
        // Only override the bottom inset (clear of the mobile bottom nav); keep
        // react-hot-toast's default left/right insets so the container stays
        // full-width — dropping `left` collapses it and the toasts render tiny.
        containerStyle={{ bottom: isMobile ? 92 : 28 }}
        toastOptions={{
          duration: 3500,
          style: {
            background: "#ffffff",
            color: "#08080c",
            border: "1px solid #e4e4e8",
            borderRadius: "14px",
            padding: "14px 18px",
            fontSize: "14.5px",
            fontWeight: 500,
            lineHeight: "1.45",
            boxShadow:
              "0 1px 2px rgba(8, 8, 12, 0.04), 0 16px 40px -12px rgba(8, 8, 12, 0.22)",
            maxWidth: isMobile ? "calc(100vw - 32px)" : "440px",
            minWidth: isMobile ? "0" : "320px",
          },
          success: {
            iconTheme: { primary: "#2563eb", secondary: "#ffffff" },
          },
          error: {
            duration: 5000,
            iconTheme: { primary: "#ff4444", secondary: "#ffffff" },
          },
          loading: {
            iconTheme: { primary: "#8a8a99", secondary: "#ffffff" },
          },
        }}
      >
        {(t) => (
          <ToastBar
            toast={t}
            style={{
              ...t.style,
              animation: t.visible
                ? "toast-enter 0.28s cubic-bezier(0.21, 1.02, 0.73, 1) both"
                : "toast-exit 0.22s cubic-bezier(0.06, 0.71, 0.55, 1) forwards",
            }}
          />
        )}
      </Toaster>
    </>
  );
}

export default App;
