import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChefHat,
  Loader2,
  Lock,
  ReceiptText,
  ShieldCheck,
  UserCog,
  UserIcon,
  Wrench,
} from "lucide-react";
import { useRoleStore } from "../../stores/roleStore";

/**
 * Role picker shared by the create and edit dialogs.
 *
 * Previously each dialog carried its own copy of the role list, the permission
 * map and a card component — about 200 duplicated lines that had already
 * drifted from the backend. Roles now come from the API; only presentation
 * (icon, description, accent) lives here.
 *
 * The layout is a vertical list rather than three side-by-side cards: inside a
 * 672px dialog each card got roughly 200px, which wrapped every description
 * onto three lines.
 */

export const MANDATORY_ROLE = "user";

const ROLE_PRESENTATION: Record<
  string,
  { label: string; description: string; icon: React.ElementType; accent: string; dot: string }
> = {
  user: {
    label: "Usuario",
    description: "Acceso básico al sistema",
    icon: UserIcon,
    accent: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  operator: {
    label: "Operador",
    description: "Consulta el panel y edita su propio perfil",
    icon: Wrench,
    accent: "text-teal-600 dark:text-teal-400",
    dot: "bg-teal-500",
  },
  manager: {
    label: "Gerente",
    description: "Gestiona usuarios y la configuración del negocio",
    icon: UserCog,
    accent: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  cashier: {
    label: "Cajero",
    description: "Abre caja, registra comandas y cobra pedidos",
    icon: ReceiptText,
    accent: "text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  kitchen: {
    label: "Cocina",
    description: "Ve pedidos en cocina y los marca como listos",
    icon: ChefHat,
    accent: "text-orange-600 dark:text-orange-400",
    dot: "bg-orange-500",
  },
  admin: {
    label: "Administrador",
    description: "Acceso completo, incluida la gestión de administradores",
    icon: ShieldCheck,
    accent: "text-red-600 dark:text-red-400",
    dot: "bg-red-500",
  },
};

/** Least privileged first, so the list reads as an escalation. */
const ROLE_ORDER = ["user", "kitchen", "operator", "cashier", "manager", "admin"];

function presentationFor(name: string) {
  return (
    ROLE_PRESENTATION[name] ?? {
      label: name.charAt(0).toUpperCase() + name.slice(1),
      description: "Rol personalizado",
      icon: UserIcon,
      accent: "text-slate-600 dark:text-slate-400",
      dot: "bg-slate-500",
    }
  );
}

interface RoleRowProps {
  name: string;
  permissions: string[];
  permissionLabels: Record<string, string>;
  isChecked: boolean;
  isMandatory: boolean;
  isLocked: boolean;
  onToggle: (checked: boolean) => void;
}

function RoleRow({
  name,
  permissions,
  permissionLabels,
  isChecked,
  isMandatory,
  isLocked,
  onToggle,
}: RoleRowProps) {
  const [showPermissions, setShowPermissions] = useState(false);
  const presentation = presentationFor(name);
  const Icon = presentation.icon;
  const selected = isMandatory || isChecked;
  const interactive = !isMandatory && !isLocked;

  return (
    <div
      role="checkbox"
      aria-checked={selected}
      aria-disabled={!interactive}
      aria-label={presentation.label}
      tabIndex={interactive ? 0 : -1}
      onClick={() => interactive && onToggle(!isChecked)}
      onKeyDown={(event) => {
        if (interactive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onToggle(!isChecked);
        }
      }}
      className={`rounded-lg border transition-colors ${
        selected ? "border-foreground/25 bg-muted/40" : "border-border bg-card"
      } ${
        interactive
          ? "cursor-pointer hover:border-foreground/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          : "cursor-default"
      } ${isLocked ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3 p-3">
        {/* Selection indicator */}
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected
              ? `${presentation.dot} border-transparent`
              : "border-input bg-background"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
        </div>

        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? presentation.accent : "text-muted-foreground"}`} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium leading-none">{presentation.label}</span>

            {isMandatory && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                Por defecto
              </span>
            )}

            {isLocked && !isMandatory && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                Solo administradores
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-muted-foreground">{presentation.description}</p>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setShowPermissions((value) => !value);
            }}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showPermissions ? "rotate-180" : ""}`}
            />
            {permissions.length} {permissions.length === 1 ? "permiso" : "permisos"}
          </button>

          {showPermissions && (
            <div className="mt-2 flex flex-wrap gap-1">
              {permissions.map((key) => (
                <span
                  key={key}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {permissionLabels[key] ?? key}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface RoleSelectorProps {
  selectedRoles: string[];
  onChange: (roles: string[]) => void;
  /** Only administrators may grant or revoke `admin` and `manager`. */
  canAssignPrivilegedRoles: boolean;
  /** Blocks every change, used when a manager opens their own record. */
  disabled?: boolean;
  onDeniedChange?: (message: string) => void;
}

export default function RoleSelector({
  selectedRoles,
  onChange,
  canAssignPrivilegedRoles,
  disabled = false,
  onDeniedChange,
}: RoleSelectorProps) {
  const { roles, permissionLabels, isLoading, error, fetchRoles } = useRoleStore();

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  const sorted = [...roles].sort((a, b) => {
    const indexA = ROLE_ORDER.indexOf(a.name);
    const indexB = ROLE_ORDER.indexOf(b.name);
    return (indexA === -1 ? ROLE_ORDER.length : indexA) - (indexB === -1 ? ROLE_ORDER.length : indexB);
  });

  const handleToggle = (name: string, checked: boolean) => {
    if (disabled) {
      onDeniedChange?.("No puedes modificar tus propios roles");
      return;
    }
    if (name === MANDATORY_ROLE && !checked) {
      onDeniedChange?.("El rol de usuario es obligatorio y no puede ser removido");
      return;
    }
    if (!canAssignPrivilegedRoles && (name === "admin" || name === "manager")) {
      onDeniedChange?.("Solo los administradores pueden asignar este rol");
      return;
    }

    onChange(
      checked
        ? [...new Set([...selectedRoles, name])]
        : selectedRoles.filter((role) => role !== name),
    );
  };

  if (isLoading && sorted.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando roles...
      </div>
    );
  }

  if (error && sorted.length === 0) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((role) => (
        <RoleRow
          key={role.id}
          name={role.name}
          permissions={role.permissions}
          permissionLabels={permissionLabels}
          isChecked={selectedRoles.includes(role.name)}
          isMandatory={role.name === MANDATORY_ROLE}
          isLocked={
            disabled ||
            (!canAssignPrivilegedRoles && (role.name === "admin" || role.name === "manager"))
          }
          onToggle={(checked) => handleToggle(role.name, checked)}
        />
      ))}
    </div>
  );
}
