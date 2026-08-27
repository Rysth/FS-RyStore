import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Mail } from "lucide-react";
import type { ForgotPasswordForm } from "../../types/auth";
import { useAuthStore } from "../../stores/authStore";
import { apiErrorMessage } from "../../utils/apiError";

export default function AuthForgotPassword() {
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{
        type: "success" | "error";
        text: string;
    } | null>(null);
    const formRef = useRef<HTMLFormElement>(null);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<ForgotPasswordForm>();

    const requestPasswordReset = useAuthStore((s) => s.requestPasswordReset);

    const onSubmit = async (data: ForgotPasswordForm) => {
        setIsLoading(true);
        setMessage(null);

        try {
            await requestPasswordReset(data.email);
            setMessage({
                type: "success",
                text: "Si el correo existe, te enviaremos un enlace para restablecer la contraseña. Revisa tu bandeja de entrada y spam.",
            });
            formRef.current?.reset();
        } catch (error: unknown) {
            setMessage({
                type: "error",
                text: apiErrorMessage(
                    error,
                    "Algo salió mal. Por favor, inténtalo de nuevo.",
                ),
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <div className="flex flex-col space-y-2 text-center">
                <h1 className="text-2xl font-semibold tracking-tight">
                    Recuperar contraseña
                </h1>
                <p className="text-sm text-muted-foreground">
                    Ingresa tu correo y te enviaremos un enlace para crear una
                    nueva contraseña
                </p>
            </div>

            {message && (
                <Alert
                    variant={
                        message.type === "success" ? "default" : "destructive"
                    }
                    className="mt-4 flex items-start gap-2"
                >
                    <i
                        className={`bx mt-0.5 ${
                            message.type === "success" ? "bx-check" : "bx-x"
                        }`}
                    ></i>
                    <AlertDescription>{message.text}</AlertDescription>
                </Alert>
            )}

            <form
                ref={formRef}
                onSubmit={handleSubmit(onSubmit)}
                className="flex flex-col w-full gap-4 mt-6"
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
                            placeholder="user@domain.com"
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
                            Requerido
                        </span>
                    )}
                </div>

                <div className="mt-2">
                    <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white rounded-full border-t-transparent animate-spin"></div>
                        ) : (
                            <i className="bx bx-mail-send"></i>
                        )}
                        <span>
                            {isLoading ? "Enviando..." : "Enviar instrucciones"}
                        </span>
                    </Button>
                </div>
            </form>

            <div className="flex items-center justify-center gap-1 mt-0 text-sm text-center mt-4">
                <p className="text-neutral-500">¿Recuerdas tu contraseña?</p>
                <Link
                    to="/auth/signin"
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                    Volver a iniciar sesión
                </Link>
            </div>
        </>
    );
}
