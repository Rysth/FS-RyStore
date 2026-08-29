import { useEffect, useRef, useReducer, useState } from "react";
import {
  ColumnDef,
  Row,
  RowSelectionState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  MoreHorizontal,
  ChevronDown,
  Download,
  Plus,
  X,
  Trash2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { useAuthStore } from "../../../stores/authStore";
import { useUserStore, User } from "../../../stores/userStore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Pagination from "../../../components/common/Pagination";
import SearchBar from "../../../components/common/SearchBar";
import UsersCreate from "./UsersCreate";
import UsersUpdate, { type UpdateTab } from "./UsersUpdate";
import UsersDelete from "./UsersDelete";
import { apiErrorMessage } from "../../../utils/apiError";

// ── State & Reducer ──────────────────────────────────────────

interface UsersState {
  searchTerm: string;
  perPage: number;
  filters: Record<string, unknown>;
  createModalOpen: boolean;
  deleteModalOpen: boolean;
  updateModalOpen: boolean;
  batchDeleteModalOpen: boolean;
  userToDelete: User | null;
  userToUpdate: User | null;
  updateTab: UpdateTab;
  confirmingUserId: string | null;
}

type UsersAction =
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_FILTERS"; payload: Record<string, unknown> }
  | { type: "OPEN_CREATE" }
  | { type: "CLOSE_CREATE" }
  | { type: "OPEN_DELETE"; payload: User }
  | { type: "CLOSE_DELETE" }
  | { type: "OPEN_UPDATE"; payload: { user: User; tab: UpdateTab } }
  | { type: "CLOSE_UPDATE" }
  | { type: "OPEN_BATCH_DELETE" }
  | { type: "CLOSE_BATCH_DELETE" }
  | { type: "SET_CONFIRMING"; payload: string | null };

const initialState: UsersState = {
  searchTerm: "",
  perPage: 12,
  filters: {},
  createModalOpen: false,
  deleteModalOpen: false,
  updateModalOpen: false,
  batchDeleteModalOpen: false,
  userToDelete: null,
  userToUpdate: null,
  updateTab: "general",
  confirmingUserId: null,
};

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case "SET_SEARCH":
      return { ...state, searchTerm: action.payload };
    case "SET_FILTERS":
      return { ...state, filters: action.payload };
    case "OPEN_CREATE":
      return { ...state, createModalOpen: true };
    case "CLOSE_CREATE":
      return { ...state, createModalOpen: false };
    case "OPEN_DELETE":
      return { ...state, deleteModalOpen: true, userToDelete: action.payload };
    case "CLOSE_DELETE":
      return { ...state, deleteModalOpen: false, userToDelete: null };
    case "OPEN_UPDATE":
      return {
        ...state,
        updateModalOpen: true,
        userToUpdate: action.payload.user,
        updateTab: action.payload.tab,
      };
    case "CLOSE_UPDATE":
      return { ...state, updateModalOpen: false, userToUpdate: null };
    case "OPEN_BATCH_DELETE":
      return { ...state, batchDeleteModalOpen: true };
    case "CLOSE_BATCH_DELETE":
      return { ...state, batchDeleteModalOpen: false };
    case "SET_CONFIRMING":
      return { ...state, confirmingUserId: action.payload };
    default:
      return state;
  }
}

// ── Columns ──────────────────────────────────────────────────

const getRoleConfig = (roleName: string) => {
  const roleConfig: Record<
    string,
    { label: string; variant: "default" | "secondary" | "outline" }
  > = {
    admin: { label: "Administrador", variant: "default" },
    manager: { label: "Gerente", variant: "secondary" },
    cashier: { label: "Cajero", variant: "secondary" },
    kitchen: { label: "Cocina", variant: "secondary" },
    operator: { label: "Operador", variant: "secondary" },
    user: { label: "Usuario", variant: "outline" },
  };
  return roleConfig[roleName] || roleConfig.user;
};

const getInitials = (fullname: string): string => {
  if (!fullname) return "U";
  const names = fullname.trim().split(" ");
  if (names.length >= 2) return `${names[0][0]}${names[1][0]}`.toUpperCase();
  return names[0].substring(0, 2).toUpperCase();
};

interface ColumnsProps {
  onUpdate: (user: User, tab?: UpdateTab) => void;
  onDelete: (user: User) => void;
  onToggleConfirmation: (user: User) => void;
  canManageUsers: boolean;
  currentUserId?: string;
  confirmingUserId: string | null;
}

function createUsersColumns({
  onUpdate,
  onDelete,
  onToggleConfirmation,
  canManageUsers,
  currentUserId,
  confirmingUserId,
}: ColumnsProps): ColumnDef<User>[] {
  return [
    // ── Checkbox select column ──
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() ? "indeterminate" : false)
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Seleccionar todo"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Seleccionar fila"
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableHiding: false,
      enableSorting: false,
    },
    {
      accessorKey: "fullname",
      header: "Usuario",
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-medium">
                {getInitials(user.fullname)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{user.fullname}</span>
              <span className="text-xs text-muted-foreground">
                @{user.username}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-sm">{row.getValue("email")}</span>
      ),
    },
    {
      accessorKey: "roles",
      header: "Rol",
      cell: ({ row }) => {
        const user = row.original;
        const roleData = getRoleConfig(user.roles[0]);
        return (
          <Badge variant={roleData.variant}>{roleData.label}</Badge>
        );
      },
    },
    {
      accessorKey: "verified",
      header: "Estado",
      cell: ({ row }) => {
        const user = row.original;
        return user.verified ? (
          <Badge
            variant="default"
            className="bg-green-100 text-green-800 hover:bg-green-100"
          >
            Verificado
          </Badge>
        ) : (
          <Badge
            variant="secondary"
            className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
          >
            Pendiente
          </Badge>
        );
      },
    },
    ...(canManageUsers
      ? [
          {
            id: "actions",
            header: "Acciones",
            cell: ({ row }: { row: Row<User> }) => {
              const user = row.original;
              const isCurrentUser = user.id === currentUserId;
              const isConfirming = confirmingUserId === user.id;
              const isAdminUser = user.roles.includes("admin");
              return (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <span className="sr-only">Abrir menú</span>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onUpdate(user)}>
                      Editar usuario
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onToggleConfirmation(user)}
                      disabled={isConfirming || isAdminUser}
                    >
                      {user.verified ? "Desconfirmar" : "Confirmar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onUpdate(user, "password")}>
                      Cambiar contraseña
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDelete(user)}
                      disabled={isCurrentUser}
                      className="text-red-600"
                    >
                      Eliminar usuario
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            },
          } as ColumnDef<User>,
        ]
      : []),
  ];
}

// ── Batch Delete Dialog ──────────────────────────────────────

interface BatchDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  users: User[];
  onConfirm: () => void;
  isLoading: boolean;
}

function BatchDeleteDialog({
  isOpen,
  onClose,
  users,
  onConfirm,
  isLoading,
}: BatchDeleteDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Eliminar {users.length} usuario{users.length !== 1 ? "s" : ""}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">
                  ¡Esta acción no se puede deshacer!
                </p>
                <p className="text-sm text-muted-foreground">
                  Se eliminarán permanentemente todos los datos de los usuarios
                  seleccionados.
                </p>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Usuarios a eliminar
                </p>
                <ul className="space-y-1.5">
                  {users.map((user) => (
                    <li
                      key={user.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarFallback className="text-[10px]">
                          {getInitials(user.fullname)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.fullname}</span>
                      <span className="text-muted-foreground">
                        @{user.username}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Eliminando...
              </>
            ) : (
              `Eliminar ${users.length} usuario${users.length !== 1 ? "s" : ""}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Data Table ───────────────────────────────────────────────

interface DataTableProps {
  columns: ColumnDef<User>[];
  data: User[];
  onCreateUser: () => void;
  onExportUsers: () => void;
  onFilterChange: (filters: { role?: string }) => void;
  onSearchChange: (term: string) => void;
  onPageChange: (selectedItem: { selected: number }) => void;
  onBatchDelete: (users: User[]) => void;
  onBatchToggleConfirmation: (users: User[], confirm: boolean) => void;
  canManageUsers: boolean;
  isLoading: boolean;
  isExporting: boolean;
  pagination?: {
    currentPage: number;
    pageCount: number;
    totalCount: number;
    perPage: number;
  };
}

function UsersDataTable({
  columns,
  data,
  onCreateUser,
  onExportUsers,
  onFilterChange,
  onSearchChange,
  onPageChange,
  onBatchDelete,
  onBatchToggleConfirmation,
  canManageUsers,
  isLoading,
  isExporting,
  pagination,
}: DataTableProps) {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchValue, setSearchValue] = useState("");
  const [selectedRole, setSelectedRole] = useState("");

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    getRowId: (row) => String(row.id),
    manualSorting: true,
    manualFiltering: true,
    state: { columnVisibility, rowSelection },
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedUsers = selectedRows.map((r) => r.original);

  const roleLabel: Record<string, string> = {
    "": "Todos los roles",
    admin: "Administrador",
    manager: "Gerente",
    cashier: "Cajero",
    kitchen: "Cocina",
    operator: "Operador",
    user: "Usuario",
  };

  return (
    <div className="space-y-4">
      {/* Header Actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center flex-1 gap-2">
          <SearchBar
            placeholder="Buscar usuarios..."
            value={searchValue}
            onSearch={(term) => {
              setSearchValue(term);
              onSearchChange(term);
            }}
            className="max-w-sm"
          />

          {/* Role Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {roleLabel[selectedRole] ?? "Filtrar por rol"}
                <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {Object.entries(roleLabel).map(([value, label]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={selectedRole === value}
                  onCheckedChange={() => {
                    setSelectedRole(value);
                    onFilterChange({ role: value });
                  }}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Clear Filters */}
          {(searchValue !== "" || selectedRole !== "") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchValue("");
                setSelectedRole("");
                onSearchChange("");
                onFilterChange({ role: "" });
              }}
              className="h-8 px-2 lg:px-3"
            >
              <X className="w-4 h-4 mr-2" />
              Limpiar filtros
            </Button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {canManageUsers && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExportUsers}
              disabled={isExporting}
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-gray-300 rounded-full animate-spin border-t-gray-600" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                </>
              )}
            </Button>
          )}

          {/* Column Visibility */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Columnas <ChevronDown className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((col) => col.getCanHide())
                .map((col) => (
                  <DropdownMenuCheckboxItem
                    key={col.id}
                    className="capitalize"
                    checked={col.getIsVisible()}
                    onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  >
                    {col.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {canManageUsers && (
            <Button onClick={onCreateUser} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Usuario
            </Button>
          )}
        </div>
      </div>

      {/* Batch Actions Bar */}
      {canManageUsers && selectedUsers.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 px-4 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-sm font-medium text-foreground">
            {selectedUsers.length} seleccionado
            {selectedUsers.length !== 1 ? "s" : ""}
          </span>

          <Separator orientation="vertical" className="h-4" />

          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onBatchToggleConfirmation(selectedUsers, true)}
          >
            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
            Confirmar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onBatchToggleConfirmation(selectedUsers, false)}
          >
            <XCircle className="h-3.5 w-3.5 text-yellow-600" />
            Desconfirmar
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
            onClick={() => onBatchDelete(selectedUsers)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 w-7 p-0"
            onClick={() => table.resetRowSelection()}
            title="Limpiar selección"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="p-0 rounded-xl">
        <CardContent className="p-0 !border-none border-transparent rounded-none">
          <div className="bg-white !border-transparent">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin border-t-gray-600" />
                        <span className="ml-2">Cargando usuarios...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={
                        row.getIsSelected() ? "bg-muted/50" : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <div className="text-muted-foreground">
                          No se encontraron usuarios.
                        </div>
                        {canManageUsers && (
                          <Button variant="outline" onClick={onCreateUser}>
                            <Plus className="w-4 h-4 mr-2" />
                            Crear primer usuario
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          pageCount={pagination.pageCount}
          totalCount={pagination.totalCount}
          perPage={pagination.perPage}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

// ── Page Component ───────────────────────────────────────────

export default function UsersIndex() {
  const { user: currentUser, hasPermission, hasRole } = useAuthStore();
  const {
    users,
    isLoading,
    isExporting,
    fetchUsers,
    toggleUserConfirmation,
    exportUsers,
    batchDeleteUsers,
    batchToggleConfirmation,
    pagination,
  } = useUserStore();

  const [state, dispatch] = useReducer(usersReducer, initialState);
  const [batchUsers, setBatchUsers] = useState<User[]>([]);
  const isMounted = useRef(false);
  const canManageUsers = hasPermission("edit_users");

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isMounted.current) return;
    const loadUsers = async () => {
      try {
        await fetchUsers(1, state.perPage, {
          ...state.filters,
          search: state.searchTerm,
        });
      } catch (error: unknown) {
        if (isMounted.current) {
          toast.error(apiErrorMessage(error, "Error al cargar usuarios"));
        }
      }
    };
    loadUsers();
  }, [fetchUsers, state.perPage, state.searchTerm, state.filters]);

  const handleDeleteClick = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("No puedes eliminar tu propio usuario");
      return;
    }
    if (user.roles.includes("admin") && !hasRole("admin")) {
      toast.error("No tienes permiso para eliminar usuarios administradores");
      return;
    }
    if (
      user.roles.includes("manager") &&
      hasRole("manager") &&
      !hasRole("admin")
    ) {
      toast.error("Solo los administradores pueden eliminar usuarios gerentes");
      return;
    }
    dispatch({ type: "OPEN_DELETE", payload: user });
  };

  const handleConfirmationToggle = async (user: User) => {
    if (!canManageUsers) {
      toast.error("No tienes permisos para cambiar el estado de confirmación");
      return;
    }
    if (user.roles.includes("admin")) {
      toast.error(
        "No puedes cambiar la confirmación de usuarios administradores",
      );
      return;
    }
    dispatch({ type: "SET_CONFIRMING", payload: user.id });
    try {
      const newState = !user.verified;
      await toggleUserConfirmation(user.id, newState);
      toast.success(
        `Usuario ${user.fullname} ${newState ? "confirmado" : "desconfirmado"} correctamente`,
      );
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, "Error al actualizar la confirmación"));
    } finally {
      if (isMounted.current) {
        dispatch({ type: "SET_CONFIRMING", payload: null });
      }
    }
  };

  const handleExportUsers = async () => {
    try {
      await exportUsers({ ...state.filters, search: state.searchTerm });
      toast.success("Usuarios exportados correctamente");
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, "Error al exportar usuarios"));
    }
  };

  const handlePageChange = (selectedItem: { selected: number }) => {
    fetchUsers(selectedItem.selected + 1, state.perPage, {
      ...state.filters,
      search: state.searchTerm,
    });
  };

  // ── Batch handlers ───────────────────────────────────────

  const handleBatchDelete = (selected: User[]) => {
    // Filter out current user and admins (if not admin)
    const eligible = selected.filter((u) => {
      if (u.id === currentUser?.id) return false;
      if (u.roles.includes("admin") && !hasRole("admin")) return false;
      return true;
    });

    const skipped = selected.length - eligible.length;
    if (skipped > 0) {
      toast(
        `${skipped} usuario${skipped !== 1 ? "s" : ""} omitido${skipped !== 1 ? "s" : ""} (sin permiso)`,
        { icon: "ℹ️" },
      );
    }

    if (eligible.length === 0) return;

    setBatchUsers(eligible);
    dispatch({ type: "OPEN_BATCH_DELETE" });
  };

  const handleBatchDeleteConfirm = async () => {
    try {
      await batchDeleteUsers(batchUsers.map((u) => u.id));
      toast.success(
        `${batchUsers.length} usuario${batchUsers.length !== 1 ? "s" : ""} eliminado${batchUsers.length !== 1 ? "s" : ""} correctamente`,
      );
      dispatch({ type: "CLOSE_BATCH_DELETE" });
      setBatchUsers([]);
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, "Error al eliminar usuarios"));
    }
  };

  const handleBatchToggleConfirmation = async (
    selected: User[],
    confirm: boolean,
  ) => {
    if (!canManageUsers) {
      toast.error("No tienes permisos para cambiar el estado de confirmación");
      return;
    }

    // Filter out admins (cannot change their confirmation)
    const eligible = selected.filter((u) => !u.roles.includes("admin"));
    const skipped = selected.length - eligible.length;

    if (skipped > 0) {
      toast(
        `${skipped} administrador${skipped !== 1 ? "es" : ""} omitido${skipped !== 1 ? "s" : ""}`,
        { icon: "ℹ️" },
      );
    }

    if (eligible.length === 0) return;

    try {
      await batchToggleConfirmation(
        eligible.map((u) => u.id),
        confirm,
      );
      const action = confirm ? "confirmados" : "desconfirmados";
      toast.success(
        `${eligible.length} usuario${eligible.length !== 1 ? "s" : ""} ${action} correctamente`,
      );
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, "Error al actualizar confirmaciones"));
    }
  };

  const filteredUsers = users.filter((user) =>
    hasRole("admin") ? true : !user.roles.includes("admin"),
  );

  const columns = createUsersColumns({
    onUpdate: (user, tab = "general") =>
      dispatch({ type: "OPEN_UPDATE", payload: { user, tab } }),
    onDelete: handleDeleteClick,
    onToggleConfirmation: handleConfirmationToggle,
    canManageUsers: !!canManageUsers,
    currentUserId: currentUser?.id,
    confirmingUserId: state.confirmingUserId,
  });

  return (
    <div className="space-y-6">
      <UsersDataTable
        columns={columns}
        data={filteredUsers}
        onCreateUser={() => dispatch({ type: "OPEN_CREATE" })}
        onExportUsers={handleExportUsers}
        onFilterChange={(filters) =>
          dispatch({ type: "SET_FILTERS", payload: filters })
        }
        onSearchChange={(term) =>
          dispatch({ type: "SET_SEARCH", payload: term })
        }
        onPageChange={handlePageChange}
        onBatchDelete={handleBatchDelete}
        onBatchToggleConfirmation={handleBatchToggleConfirmation}
        canManageUsers={!!canManageUsers}
        isLoading={isLoading}
        isExporting={isExporting || false}
        pagination={
          pagination
            ? {
                currentPage: pagination.current_page - 1,
                pageCount: pagination.total_pages,
                totalCount: pagination.total_count,
                perPage: pagination.per_page,
              }
            : undefined
        }
      />

      <UsersCreate
        isOpen={state.createModalOpen}
        onClose={() => dispatch({ type: "CLOSE_CREATE" })}
      />

      <UsersUpdate
        isOpen={state.updateModalOpen}
        onClose={() => dispatch({ type: "CLOSE_UPDATE" })}
        user={state.userToUpdate}
        initialTab={state.updateTab}
      />

      <UsersDelete
        isOpen={state.deleteModalOpen}
        onClose={() => dispatch({ type: "CLOSE_DELETE" })}
        user={state.userToDelete}
      />

      <BatchDeleteDialog
        isOpen={state.batchDeleteModalOpen}
        onClose={() => dispatch({ type: "CLOSE_BATCH_DELETE" })}
        users={batchUsers}
        onConfirm={handleBatchDeleteConfirm}
        isLoading={isLoading}
      />
    </div>
  );
}
