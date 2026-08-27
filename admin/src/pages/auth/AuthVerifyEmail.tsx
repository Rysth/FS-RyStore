import { useEffect, useMemo, useReducer, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "../../stores/authStore";
import {
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowLeft,
  LogIn,
  Send,
} from "lucide-react";
import { apiErrorMessage } from "../../utils/apiError";

type VerificationStatus =
  | "pending"
  | "awaiting_verification"
  | "success"
  | "error";

interface VerificationState {
  status: VerificationStatus;
  hasAttempted: boolean;
  errorMessage: string;
}

type VerificationAction =
  | { type: "ATTEMPT_STARTED" }
  | { type: "VERIFY_SUCCESS" }
  | { type: "VERIFY_ERROR"; message: string }
  | { type: "SET_AWAITING" }
  | { type: "SET_ERROR_NO_TOKEN" };

function verificationReducer(
  state: VerificationState,
  action: VerificationAction,
): VerificationState {
  switch (action.type) {
    case "ATTEMPT_STARTED":
      return { ...state, hasAttempted: true };
    case "VERIFY_SUCCESS":
      return { ...state, status: "success", hasAttempted: true };
    case "VERIFY_ERROR":
      return {
        ...state,
        status: "error",
        errorMessage: action.message,
        hasAttempted: true,
      };
    case "SET_AWAITING":
      return { ...state, status: "awaiting_verification" };
    case "SET_ERROR_NO_TOKEN":
      return {
        ...state,
        status: "error",
        hasAttempted: true,
        errorMessage: "No se proporcionó un token de verificación",
      };
    default:
      return state;
  }
}

export default function AuthVerifyEmail() {
  const location = useLocation();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(verificationReducer, {
    status: location.state?.status || "pending",
    hasAttempted: false,
    errorMessage: "",
  });

  const { status, hasAttempted, errorMessage } = state;

  const [email, setEmail] = useState<string>(location.state?.email || "");
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string>("");
  const verifyEmailAction = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);

  const tokenFromUrl = useMemo(() => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get("key") || searchParams.get("token");
  }, [location.search]);

  useEffect(() => {
    const verifyEmail = async () => {
      // Don't verify if user just signed up
      if (status === "awaiting_verification" || hasAttempted) return;

      if (!tokenFromUrl) {
        dispatch({ type: "SET_ERROR_NO_TOKEN" });
        return;
      }

      try {
        // Send the full token as received from the URL
        await verifyEmailAction(tokenFromUrl);
        dispatch({ type: "VERIFY_SUCCESS" });
      } catch (err: unknown) {
        console.error("Verification failed:", err);
        dispatch({
          type: "VERIFY_ERROR",
          message: apiErrorMessage(err, "Token inválido o ya utilizado"),
        });
      }
    };

    verifyEmail();
  }, [hasAttempted, status, tokenFromUrl, verifyEmailAction]);

  const handleResend = async () => {
    if (!email) {
      setResendMessage("Ingresa tu correo para reenviar la verificación.");
      return;
    }

    try {
      setIsResending(true);
      setResendMessage("");
      await resendVerification(email);
      setResendMessage("Hemos reenviado el correo de verificación.");
      dispatch({ type: "SET_AWAITING" });
    } catch (err: unknown) {
      const msg = apiErrorMessage(err, "No se pudo reenviar el correo");
      setResendMessage(msg);
    } finally {
      setIsResending(false);
    }
  };

  // Handle automatic redirect for success only
  useEffect(() => {
    if (status === "success") {
      const timer = setTimeout(() => {
        navigate("/auth/signin");
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  // ✅ NEW: Show "check your email" message after signup
  if (status === "awaiting_verification") {
    return (
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
          <Mail className="h-10 w-10 text-blue-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            ¡Revisa tu correo!
          </h1>
          <p className="text-sm text-muted-foreground">
            Hemos enviado un enlace de verificación a{" "}
            <span className="font-medium text-foreground">{email}</span>
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
            Por favor, revisa tu bandeja de entrada y haz clic en el enlace para
            verificar tu cuenta.
          </div>

          <div className="text-sm text-muted-foreground">
            ¿No recibiste el correo?{" "}
            <button
              type="button"
              onClick={handleResend}
              className="font-medium text-primary hover:underline"
              disabled={isResending}
            >
              {isResending ? "Reenviando..." : "Reenviar correo"}
            </button>
            <div className="mt-3 flex flex-col gap-2 text-left">
              <Input
                type="email"
                placeholder="Tu correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isResending}
              />
              {resendMessage && (
                <p className="text-xs text-muted-foreground">{resendMessage}</p>
              )}
            </div>
          </div>

          <Button asChild variant="ghost" className="w-full">
            <Link to="/auth/signin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Iniciar Sesión
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Initial state - waiting for user to verify email (when clicking link)
  if (status === "pending") {
    return (
      <div className="flex flex-col items-center space-y-8 text-center">
        {/* Animated icon container */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          {/* Outer pulsing ring */}
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20" />
          {/* Inner solid circle */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verificando tu correo...
          </h1>
          <p className="text-sm text-muted-foreground">
            Por favor espera mientras verificamos tu cuenta.
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-primary" />
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50">
          <CheckCircle2 className="h-10 w-10 text-green-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            ¡Correo Verificado!
          </h1>
          <p className="text-sm text-muted-foreground">
            Tu correo ha sido verificado exitosamente. Redirigiendo a inicio de
            sesión...
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Redirigiendo a inicio de sesión en 3 segundos...
          </div>

          <Button asChild className="w-full">
            <Link to="/auth/signin">
              <LogIn className="mr-2 h-4 w-4" />
              Ir a Iniciar Sesión
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center space-y-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
          <XCircle className="h-10 w-10 text-red-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verificación Fallida
          </h1>
          <p className="text-sm text-muted-foreground">
            {errorMessage ||
              "Ya has verificado tu correo o el token es inválido."}
          </p>
        </div>

        <div className="w-full space-y-4">
          <Button asChild className="w-full">
            <Link to="/auth/confirm">
              <Mail className="mr-2 h-4 w-4" />
              Reenviar Correo
            </Link>
          </Button>

          <div className="space-y-2 rounded-lg border bg-muted/50 p-4 text-left">
            <p className="text-sm font-medium">¿No recibiste el correo?</p>
            <div className="flex flex-col gap-2">
              <Input
                type="email"
                placeholder="Ingresa tu correo"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isResending}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleResend}
                disabled={isResending}
                className="w-full"
              >
                {isResending ? "Reenviando..." : "Reenviar verificación"}
                <Send className="ml-2 h-4 w-4" />
              </Button>
              {resendMessage && (
                <p className="text-xs text-muted-foreground">{resendMessage}</p>
              )}
            </div>
          </div>

          <Button asChild variant="ghost" className="w-full">
            <Link to="/auth/signin">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Iniciar Sesión
            </Link>
          </Button>
        </div>
      </div>
    );
  }
}
