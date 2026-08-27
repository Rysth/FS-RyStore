import toast from "react-hot-toast";
import { useUserStore } from "../../../stores/userStore";
import { User } from "../../../stores/userStore";
import { useAuthStore } from "../../../stores/authStore";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiErrorMessage } from "../../../utils/apiError";

interface UsersDeleteProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

export default function UsersDelete({
  isOpen,
  onClose,
  user,
}: UsersDeleteProps) {
  const { isLoading, deleteUser } = useUserStore();
  const { user: currentUser, hasPermission } = useAuthStore();
  const [confirmText, setConfirmText] = useState("");

  if (!user) return null;

  const canDelete =
    hasPermission("delete_users") && user.id !== currentUser?.id; // cannot delete self

  const isConfirmValid = confirmText === user.fullname;

  const handleDelete = async () => {
    if (!user) return;

    if (!canDelete) {
      toast.error("No tienes permisos para eliminar este usuario");
      onClose();
      return;
    }

    if (!isConfirmValid) {
      toast.error("El nombre no coincide");
      return;
    }

    try {
      await deleteUser(user.id);

      // Mensaje contextual basado en estado actual de store
      const { currentFilters, users, pagination } = useUserStore.getState();
      const hasActiveFilters = Boolean(
        currentFilters?.search || currentFilters?.role,
      );

      if (users.length === 1 && pagination.current_page > 1) {
        toast.success(
          `Usuario ${user.fullname} eliminado. Mostrando página anterior.`,
        );
      } else if (hasActiveFilters) {
        toast.success(
          `Usuario ${user.fullname} eliminado con filtros activos.`,
        );
      } else {
        toast.success(`Usuario ${user.fullname} eliminado correctamente.`);
      }

      setConfirmText("");
      onClose();
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, "Error al eliminar el usuario"));
      onClose();
    }
  };

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Eliminar Usuario
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                <div className="flex items-start space-x-2">
                  <div className="text-destructive mt-0.5">⚠️</div>
                  <div>
                    <h4 className="font-semibold text-destructive">
                      ¡Advertencia!
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Esta acción no se puede deshacer. Se eliminarán todos los
                      datos y trabajo asociados a este usuario.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-muted rounded-md">
                <p className="font-medium mb-2">Usuario a eliminar:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="font-semibold">Nombre:</span>{" "}
                    {user.fullname}
                  </div>
                  <div>
                    <span className="font-semibold">Email:</span> {user.email}
                  </div>
                  <div>
                    <span className="font-semibold">Rol(es):</span>{" "}
                    {user.roles.map((role) => (
                      <Badge key={role} variant="outline" className="ml-1">
                        {role}
                      </Badge>
                    ))}
                  </div>
                  <div>
                    <span className="font-semibold">Estado:</span>
                    <Badge
                      variant={user.verified ? "default" : "secondary"}
                      className="ml-1"
                    >
                      {user.verified ? "Verificado" : "Pendiente"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-name">
                  Para confirmar, escribe el nombre completo del usuario:
                  <span className="ml-1 font-semibold">{user.fullname}</span>
                </Label>
                <Input
                  id="confirm-name"
                  type="text"
                  placeholder={user.fullname}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={isLoading}
                />
                {!isConfirmValid && confirmText.length > 0 && (
                  <p className="text-xs text-destructive">
                    El nombre no coincide con "{user.fullname}"
                  </p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={!canDelete || !isConfirmValid || isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Eliminando...
              </>
            ) : (
              "Eliminar Usuario"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
