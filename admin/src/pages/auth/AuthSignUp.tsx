import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { User, AtSign, Mail } from "lucide-react";
import PasswordInput from "../../components/shared/PasswordInput";
import { useAuthStore } from "../../stores/authStore";
import type { SignUpForm } from "../../types/auth";
import toast from "react-hot-toast";
import { apiErrorList, apiErrorMessage } from "../../utils/apiError";

export default function AuthSignUp() {
  const { register: signup, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpForm>();

  const onSubmit = async (data: SignUpForm) => {
    try {
      await signup(data);
      toast.success(
        "¡Cuenta creada exitosamente! Revisa tu correo para verificar tu cuenta.",
      );
      // ✅ Navigate with "awaiting_verification" status instead of "pending"
      navigate("/identity/email_verification", {
        state: {
          status: "awaiting_verification",
          email: data.email,
          message: "Por favor revisa tu correo para verificar tu cuenta.",
        },
      });
    } catch (err: unknown) {
      // The API answers with `errors: string[]`, not the Rails field->messages
      // hash this used to iterate, so there is no field to attach them to.
      const serverErrors = apiErrorList(err);
      toast.error(
        serverErrors.length
          ? serverErrors.join(", ")
          : apiErrorMessage(err, "Error al crear la cuenta"),
      );
    }
  };

  return (
    <>
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Crea una cuenta
        </h1>
        <p className="text-sm text-muted-foreground">
          Ingresa tus datos para registrarte en la plataforma
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mt-4">
          <i className="bx bx-x"></i>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col w-full gap-4 mt-6 sm:grid sm:grid-cols-2"
      >
        <div className="space-y-2">
          <Label htmlFor="fullName">Nombre Completo</Label>
          <InputGroup>
            <InputGroupAddon>
              <User className="opacity-50" />
            </InputGroupAddon>
            <InputGroupInput
              id="fullName"
              type="text"
              placeholder="Nombre Completo"
              {...register("fullName", { required: true })}
            />
          </InputGroup>
          {errors.fullName && (
            <span className="text-sm font-bold text-red-600">Requerido</span>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Nombre de Usuario</Label>
          <InputGroup>
            <InputGroupAddon>
              <AtSign className="opacity-50" />
            </InputGroupAddon>
            <InputGroupInput
              id="username"
              type="text"
              placeholder="Nombre de Usuario"
              {...register("username", {
                required: true,
              })}
            />
          </InputGroup>
          {errors.username && (
            <span className="text-sm font-bold text-red-600">
              {errors.username.message || "Requerido"}
            </span>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">Correo electrónico</Label>
          <InputGroup>
            <InputGroupAddon>
              <Mail className="opacity-50" />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              type="email"
              placeholder="usuario@dominio.com"
              autoComplete="email"
              {...register("email", {
                required: true,
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: "Correo electrónico inválido",
                },
              })}
            />
          </InputGroup>
          {errors.email && (
            <span className="text-sm font-bold text-red-600">
              {errors.email.message || "Requerido"}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <PasswordInput
            register={register("password", {
              required: true,
              minLength: {
                value: 8,
                message: "La contraseña debe tener al menos 8 caracteres",
              },
            })}
            placeholder="••••••••••••"
            name="password"
            autoComplete="new-password"
          />
          {errors.password && (
            <span className="text-sm font-bold text-red-600">
              {errors.password.message || "Requerido"}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="passwordConfirmation">Confirmar Contraseña</Label>
          <PasswordInput
            register={register("passwordConfirmation", {
              required: true,
              validate: (value) =>
                value === watch("password") || "Las contraseñas no coinciden",
            })}
            placeholder="••••••••••••"
            name="passwordConfirmation"
            autoComplete="new-password"
          />
          {errors.passwordConfirmation && (
            <span className="text-sm font-bold text-red-600">
              {errors.passwordConfirmation.message ||
                "Las contraseñas no coinciden"}
            </span>
          )}
        </div>

        <div className="mt-2 sm:col-span-2">
          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
            ) : (
              <i className="bx bx-user-plus"></i>
            )}
            <span>{isLoading ? "Creando Cuenta..." : "Crear Cuenta"}</span>
          </Button>
        </div>
      </form>

      <div className="flex items-center justify-center gap-1 mt-2 text-sm text-center">
        <p className="text-neutral-500">¿Ya tienes una cuenta?</p>
        <Link
          to="/auth/signin"
          className="text-blue-600 hover:text-blue-800 hover:underline"
        >
          Iniciar sesión
        </Link>
      </div>
    </>
  );
}
