import { create } from "zustand";
import api from "../utils/api";

/**
 * Roles and their permissions, read from the API.
 *
 * These used to be hard-coded in UsersCreate and UsersUpdate, duplicated
 * between the two files and already out of step with the backend: `operator`
 * was missing entirely, so an operator's role was invisible in the UI.
 * Reading GET /api/v1/permissions keeps the list correct by construction.
 */

export interface RoleWithPermissions {
  id: number;
  name: string;
  permissions: string[];
}

interface PermissionDefinition {
  id: number;
  key: string;
  name: string;
  description: string | null;
  group: string;
}

interface RoleState {
  roles: RoleWithPermissions[];
  /** Permission key -> Spanish label, e.g. "view_users" -> "Ver Usuarios". */
  permissionLabels: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  loaded: boolean;
  fetchRoles: () => Promise<void>;
}

export const useRoleStore = create<RoleState>((set, get) => ({
  roles: [],
  permissionLabels: {},
  isLoading: false,
  error: null,
  loaded: false,

  fetchRoles: async () => {
    // The catalogue changes only on deploy, so one fetch per session is enough.
    if (get().loaded || get().isLoading) return;

    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/permissions");
      const definitions: PermissionDefinition[] = response.data?.permissions ?? [];

      set({
        roles: response.data?.roles ?? [],
        permissionLabels: Object.fromEntries(
          definitions.map((permission) => [permission.key, permission.name]),
        ),
        isLoading: false,
        loaded: true,
      });
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ??
        "No se pudieron cargar los roles";
      set({ error: message, isLoading: false });
    }
  },
}));
