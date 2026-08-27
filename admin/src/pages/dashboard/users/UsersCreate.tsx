import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PasswordInput from "../../../components/shared/PasswordInput";
import RoleSelector, { MANDATORY_ROLE } from "../../../components/users/RoleSelector";
import { useUserStore } from "../../../stores/userStore";
import { useAuthStore } from "../../../stores/authStore";
import { AtSign, IdCard, Mail, Phone } from "lucide-react";

interface UserFormData {
  fullname: string;
  username: string;
  email: string;
  identification?: string;
  phone_number?: string;
  password?: string;
  passwordConfirmation?: string;
}

interface UsersCreateProps {
  isOpen: boolean;
  onClose: () => void;
}

type CreateTab = "general" | "roles" | "security";

/** Which tab owns each field, so a failed validation can reveal the culprit. */
const FIELD_TAB: Record<keyof UserFormData, CreateTab> = {
  fullname: "general",
  username: "general",
  email: "general",
  identification: "general",
  phone_number: "general",
  password: "security",
  passwordConfirmation: "security",
};

export default function UsersCreate({ isOpen, onClose }: UsersCreateProps) {
  const { isLoading: storeLoading, createUser } = useUserStore();
  const { hasRole } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([MANDATORY_ROLE]);
  const [activeTab, setActiveTab] = useState<CreateTab>("general");

  const isAdmin = hasRole("admin");

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<UserFormData>();

  useEffect(() => {
    if (!isOpen) {
      reset();
      setSelectedRoles([MANDATORY_ROLE]);
      setActiveTab("general");
    }
  }, [isOpen, reset]);

  const onSubmit = async (data: UserFormData) => {
    setIsLoading(true);
    try {
      await createUser({ ...data, roles: selectedRoles });
      toast.success(
        data.password
          ? "Usuario creado correctamente. Se ha enviado un correo de bienvenida."
          : "Usuario creado. Se ha enviado un correo para establecer su contraseña.",
      );
      onClose();
    } catch (error) {
      toast.error((error as Error).message || "Error al crear usuario");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fields on a hidden tab still validate, but their message is invisible —
   * the dialog would look like it simply ignored the click. Jump to the tab
   * holding the first error instead.
   */
  const onInvalid = (formErrors: typeof errors) => {
    const firstField = Object.keys(formErrors)[0] as keyof UserFormData | undefined;
    if (firstField) setActiveTab(FIELD_TAB[firstField]);
  };

  const busy = isLoading || storeLoading;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Usuario</DialogTitle>
          <DialogDescription>
            Completa los datos, asigna los roles y, si quieres, define una contraseña inicial.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CreateTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="general" className="flex-1">
                General
              </TabsTrigger>
              <TabsTrigger value="roles" className="flex-1">
                Roles
              </TabsTrigger>
              <TabsTrigger value="security" className="flex-1">
                Seguridad
              </TabsTrigger>
            </TabsList>

            {/* ── General ── */}
            <TabsContent value="general" className="space-y-4 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullname">Nombre Completo</Label>
                  <Input
                    id="fullname"
                    placeholder="Juan Pérez"
                    {...register("fullname", {
                      required: "Nombre completo es requerido",
                      minLength: { value: 3, message: "Mínimo 3 caracteres" },
                    })}
                  />
                  {errors.fullname && (
                    <p className="text-sm text-destructive">{errors.fullname.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Nombre de Usuario</Label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="username"
                      placeholder="juanperez"
                      className="pl-9"
                      {...register("username", {
                        required: "Nombre de usuario es requerido",
                        pattern: {
                          value: /^[a-z0-9_]+$/i,
                          message: "Solo letras, números y guiones bajos",
                        },
                        minLength: { value: 3, message: "Mínimo 3 caracteres" },
                      })}
                    />
                  </div>
                  {errors.username && (
                    <p className="text-sm text-destructive">{errors.username.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="identification">Identificación (Cédula)</Label>
                  <div className="relative">
                    <IdCard className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="identification"
                      placeholder="12345678"
                      className="pl-9"
                      {...register("identification", {
                        pattern: {
                          value: /^\d{10,13}$/,
                          message: "Debe contener entre 10-13 dígitos numéricos",
                        },
                      })}
                    />
                  </div>
                  {errors.identification && (
                    <p className="text-sm text-destructive">{errors.identification.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone_number">Número de Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone_number"
                      placeholder="04121234567"
                      className="pl-9"
                      {...register("phone_number", {
                        pattern: { value: /^\d*$/, message: "Solo se permiten números" },
                      })}
                    />
                  </div>
                  {errors.phone_number && (
                    <p className="text-sm text-destructive">{errors.phone_number.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Correo Electrónico</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@ejemplo.com"
                    className="pl-9"
                    autoComplete="email"
                    {...register("email", {
                      required: "Correo electrónico es requerido",
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: "Correo electrónico inválido",
                      },
                    })}
                  />
                </div>
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
            </TabsContent>

            {/* ── Roles ── */}
            <TabsContent value="roles" className="space-y-3 pt-4">
              <p className="text-sm text-muted-foreground">
                El rol <span className="font-medium text-foreground">Usuario</span> es obligatorio y
                se asigna automáticamente. Los demás son opcionales y acumulativos.
              </p>
              <RoleSelector
                selectedRoles={selectedRoles}
                onChange={setSelectedRoles}
                canAssignPrivilegedRoles={isAdmin}
                onDeniedChange={(message) => toast.error(message)}
              />
            </TabsContent>

            {/* ── Seguridad ── */}
            <TabsContent value="security" className="space-y-4 pt-4">
              <div className="rounded-md border bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  La contraseña es opcional. Si la dejas vacía, el usuario recibirá un correo para
                  establecerla él mismo.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="password">Contraseña</Label>
                  <PasswordInput
                    register={register("password", {
                      minLength: { value: 8, message: "Mínimo 8 caracteres" },
                    })}
                    placeholder="••••••••••••"
                    name="password"
                    autoComplete="new-password"
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="passwordConfirmation">Confirmar Contraseña</Label>
                  <PasswordInput
                    register={register("passwordConfirmation", {
                      validate: (value) => {
                        const password = watch("password");
                        if (password && !value) return "La confirmación de contraseña es requerida";
                        if (password && value !== password) return "Las contraseñas no coinciden";
                        return true;
                      },
                    })}
                    placeholder="••••••••••••"
                    name="passwordConfirmation"
                    autoComplete="new-password"
                  />
                  {errors.passwordConfirmation && (
                    <p className="text-sm text-destructive">
                      {errors.passwordConfirmation.message}
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 border-t pt-4 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && (
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              )}
              Crear Usuario
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
