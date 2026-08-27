import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Mail } from "lucide-react";
import PasswordInput from "../../components/shared/PasswordInput";
import { useAuthStore } from "../../stores/authStore";
import type { SignInForm } from "../../types/auth";
import { getDefaultAdminRoute } from "../../utils/adminRoutes";
import { apiErrorMessage } from "../../utils/apiError";

export default function AuthSignIn() {
    const {
        login,
        isLoading,
        isLoadingUserInfo,
        user,
        hasPermission,
        hasAnyPermission,
    } = useAuthStore();
    const navigate = useNavigate();
    const [rememberEmail, setRememberEmail] = useState(false);

    const {
        register,
        handleSubmit,
        setValue,
        formState: { errors },
    } = useForm<SignInForm>();

    // Load saved email on component mount
    useEffect(() => {
        const savedEmail = localStorage.getItem("rememberedEmail");
        if (savedEmail) {
            setValue("email", savedEmail);
            setRememberEmail(true);
        }
    }, [setValue]);

    // Redirect authenticated users to the first route they can actually use
    useEffect(() => {
        if (user) {
            navigate(
                getDefaultAdminRoute({ user, hasPermission, hasAnyPermission }),
                { replace: true },
            );
        }
    }, [user, navigate, hasPermission, hasAnyPermission]);

    const onSubmit = async (data: SignInForm) => {
        try {
            if (rememberEmail) {
                localStorage.setItem("rememberedEmail", data.email);
            } else {
                localStorage.removeItem("rememberedEmail");
            }

            await login(data);
            toast.success("¡Inicio de sesión exitoso!");
            // The redirect is handled by the useEffect above.
        } catch (err: unknown) {
            // The auth store already throws an Error carrying the backend's
            // Spanish message.
            toast.error(apiErrorMessage(err, "Error al iniciar sesión"));
        }
    };

    return (
        <>
            <div className="flex flex-col space-y-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Inicia sesión
                </h1>
                <p className="text-sm text-muted-foreground mb-4">
                    Ingresa tu correo electrónico para acceder a tu cuenta
                </p>
            </div>

            <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col w-full gap-4"
            >
                <div className="space-y-2">
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
                        <span className="text-sm font-bold text-destructive">
                            {errors.email.message || "Requerido"}
                        </span>
                    )}
                </div>

                <div className="space-y-2">
                    <Label htmlFor="password">Contraseña</Label>
                    <PasswordInput
                        register={register("password", {
                            required: true,
                        })}
                        placeholder="••••••••••••"
                        name="password"
                        autoComplete="current-password"
                    />
                    {errors.password && (
                        <span className="text-sm font-bold text-destructive">
                            {errors.password.message || "Requerido"}
                        </span>
                    )}
                </div>

                {/* Remember Email Checkbox */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <Checkbox
                            id="remember"
                            checked={rememberEmail}
                            onCheckedChange={(checked) =>
                                setRememberEmail(checked === true)
                            }
                        />
                        <Label htmlFor="remember" className="text-sm">
                            Recordar correo electrónico
                        </Label>
                    </div>
                    <Link
                        to="/auth/forgot-password"
                        className="text-sm text-accent hover:text-accent/80 hover:underline"
                    >
                        ¿Olvidaste tu contraseña?
                    </Link>
                </div>

                <div className="mt-2">
                    <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={isLoading || isLoadingUserInfo}
                    >
                        {isLoading || isLoadingUserInfo ? (
                            <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                        ) : (
                            <i className="bx bx-log-in"></i>
                        )}
                        <span>
                            {isLoading
                                ? "Iniciando sesión..."
                                : isLoadingUserInfo
                                  ? "Cargando información..."
                                  : "Iniciar Sesión"}
                        </span>
                    </Button>
                </div>
            </form>
        </>
    );
}
