import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { getDefaultAdminRoute } from "../../utils/adminRoutes";

export default function ErrorBoundary() {
  const error = useRouteError();
  const { user, hasPermission, hasAnyPermission } = useAuthStore();
  let errorMessage: string;
  let errorStatus: number | undefined;
  const fallbackRoute = getDefaultAdminRoute({
    user,
    hasPermission,
    hasAnyPermission,
  });

  if (isRouteErrorResponse(error)) {
    errorMessage =
      error.statusText || error.data?.message || "An error occurred";
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    errorMessage = "Unknown error occurred";
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12 border border-gray-200">
          <div className="flex flex-col items-center text-center">
            {/* Error Icon */}
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <i className="bx bx-error text-5xl text-red-500"></i>
            </div>

            {/* Error Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              {errorStatus
                ? `Error ${errorStatus}`
                : "Oops! Something went wrong"}
            </h1>

            {/* Error Message */}
            <p className="text-gray-600 text-lg mb-8 max-w-lg">
              {errorMessage}
            </p>

            {/* Error Details (Dev Mode) */}
            {import.meta.env.DEV && error instanceof Error && error.stack && (
              <details className="mb-8 w-full text-left">
                <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 mb-2">
                  View error details (dev only)
                </summary>
                <pre className="bg-gray-50 p-4 rounded-lg overflow-auto text-xs text-gray-700 border border-gray-200">
                  {error.stack}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4 flex-wrap justify-center">
              <Link to={fallbackRoute} className="btn btn-primary gap-2">
                <i className="bx bx-home text-lg"></i>
                Ir al panel
              </Link>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-outline gap-2"
              >
                <i className="bx bx-refresh text-lg"></i>
                Reload Page
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
