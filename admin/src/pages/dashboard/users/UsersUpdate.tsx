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
import { User, useUserStore } from "../../../stores/userStore";
import { useAuthStore } from "../../../stores/authStore";
import { AtSign, IdCard, Mail, Phone } from "lucide-react";

interface EditFormData {
  fullname: string;
  username: string;
  email: string;
  identification?: string;
  phone_number?: string;
}

interface PasswordFormData {
  password: string;
  password_confirmation: string;
}

export type UpdateTab = "general" | "roles" | "password";

interface UsersUpdateProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  /** Which tab to land on. "Cambiar contraseña" opens straight on `password`. */
  initialTab?: UpdateTab;
}

// ── General + roles ──────────────────────────────────────────

function DetailsForm({
  user,
  onClose,
  activeTab,
  onTabChange,
}: {
  user: User;
  onClose: () => void;
  activeTab: UpdateTab;
  onTabChange: (tab: UpdateTab) => void;
}) {
  const { isLoading: storeLoading, updateUser } = useUserStore();
  const { user: currentUser, hasRole } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([MANDATORY_ROLE]);

  const isAdmin = hasRole("admin");
  const isManager = hasRole("manager");
  const editingSelf = user.id === currentUser?.id;
  // Mirrors the backend guard: managers cannot touch their own roles.
  const rolesLocked = editingSelf && isManager && !isAdmin;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditFormData>();

  useEffect(() => {
    reset({
      fullname: user.fullname,
      username: user.username,
      email: user.email,
      identification: user.identification || "",
      phone_number: user.phone_number || "",
    });
    const roles = user.roles.length > 0 ? user.roles : [MANDATORY_ROLE];
    setSelectedRoles(roles.includes(MANDATORY_ROLE) ? roles : [...roles, MANDATORY_ROLE]);
  }, [user, reset]);

  const onSubmit = async (data: EditFormData) => {
    setIsLoading(true);
    try {
      const payload: Record<string, unknown> = { ...data };

      const before = [...user.roles].sort().join(",");
      const after = [...selectedRoles].sort().join(",");
      if (before !== after) payload.roles = selectedRoles;

      await updateUser(user.id, payload);
      toast.success("Usuario actualizado correctamente");
      onClose();
    } catch (error) {
      toast.error((error as Error).message || "Error al actualizar usuario");
    } finally {
      setIsLoading(false);
    }
  };

  // Every validated field lives on the General tab, so any error sends us there.
  const onInvalid = () => onTabChange("general");

  const busy = isLoading || storeLoading;

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)}>
      <TabsContent value="general" className="space-y-4 pt-4" forceMount hidden={activeTab !== "general"}>
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
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>
      </TabsContent>

      <TabsContent value="roles" className="space-y-3 pt-4" forceMount hidden={activeTab !== "roles"}>
        {rolesLocked ? (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
            Los gerentes no pueden modificar sus propios roles. Pide a un administrador que haga el
            cambio.
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            El rol <span className="font-medium text-foreground">Usuario</span> es obligatorio y se
            asigna automáticamente. Los demás son opcionales y acumulativos.
          </p>
        )}

        <RoleSelector
          selectedRoles={selectedRoles}
          onChange={setSelectedRoles}
          canAssignPrivilegedRoles={isAdmin}
          disabled={rolesLocked}
          onDeniedChange={(message) => toast.error(message)}
        />
      </TabsContent>

      {/* Rendered for both tabs, so the save button is always reachable. */}
      {activeTab !== "password" && (
        <div className="mt-6 flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && (
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            )}
            Guardar Cambios
          </Button>
        </div>
      )}
    </form>
  );
}

// ── Password ─────────────────────────────────────────────────

function PasswordForm({ user, onClose }: { user: User; onClose: () => void }) {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<PasswordFormData>({
    defaultValues: { password: "", password_confirmation: "" },
  });

  const onSubmit = async (data: PasswordFormData) => {
    setIsLoading(true);
    try {
      await useUserStore
        .getState()
        .updateUserPassword(user.id, data.password, data.password_confirmation);
      toast.success(`Contraseña de ${user.fullname} actualizada correctamente`);
      reset();
      onClose();
    } catch (error) {
      toast.error((error as Error).message || "Error al actualizar la contraseña");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-4">
      <div className="rounded-md border bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">
          La nueva contraseña se aplica de inmediato. El usuario deberá usarla en su próximo inicio
          de sesión.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="password">Nueva Contraseña</Label>
          <PasswordInput
            register={register("password", {
              required: "La contraseña es requerida",
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
          <Label htmlFor="password_confirmation">Confirmar Contraseña</Label>
          <PasswordInput
            register={register("password_confirmation", {
              required: "La confirmación de contraseña es requerida",
              validate: (value) =>
                value === watch("password") || "Las contraseñas no coinciden",
            })}
            placeholder="••••••••••••"
            name="password_confirmation"
            autoComplete="new-password"
          />
          {errors.password_confirmation && (
            <p className="text-sm text-destructive">{errors.password_confirmation.message}</p>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && (
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          )}
          Actualizar Contraseña
        </Button>
      </div>
    </form>
  );
}

// ── Dialog ───────────────────────────────────────────────────

export default function UsersUpdate({
  isOpen,
  onClose,
  user,
  initialTab = "general",
}: UsersUpdateProps) {
  const [activeTab, setActiveTab] = useState<UpdateTab>(initialTab);

  // The dialog stays mounted between openings, so the requested tab has to be
  // re-applied each time it opens — otherwise "Cambiar contraseña" would land
  // on whatever tab was left selected last.
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab, user?.id]);

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Usuario</DialogTitle>
          <DialogDescription>
            {user.fullname} — @{user.username}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as UpdateTab)}>
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1">
              General
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex-1">
              Roles
            </TabsTrigger>
            <TabsTrigger value="password" className="flex-1">
              Contraseña
            </TabsTrigger>
          </TabsList>

          <DetailsForm
            user={user}
            onClose={onClose}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />

          <TabsContent value="password">
            <PasswordForm user={user} onClose={onClose} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
