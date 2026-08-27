import { create } from "zustand";
import api from "../utils/api";
import { apiErrorList, apiErrorMessage } from "../utils/apiError";

// Define the User type here or import it from a types file
export interface User {
  id: string;
  email: string;
  username: string;
  fullname: string;
  identification?: string;
  phone_number?: string;
  roles: string[];
  created_at: string;
  updated_at: string;
  verified: boolean; // From account.status == 'verified'
  account_status: string; // 'unverified', 'verified', 'closed'
}

interface Pagination {
  current_page: number;
  total_pages: number;
  total_count: number;
  per_page: number;
}

interface UserFilters {
  search?: string;
  role?: string;
  fullname?: string;
  username?: string;
  email?: string;
  sort_by?: string;
  sort_direction?: string;
}

interface CreateUserData {
  fullname: string;
  username: string;
  email: string;
  identification?: string;
  phone_number?: string;
  roles: string[];
  password?: string;
  passwordConfirmation?: string;
}

// Añadir interfaz para datos de actualización
interface UpdateUserData {
  fullname?: string;
  username?: string;
  email?: string;
  identification?: string;
  phone_number?: string;
  roles?: string[];
}

// Actualizar la interfaz UserState
interface UserState {
  users: User[];
  isLoading: boolean;
  isExporting: boolean;
  error: string | null;
  pagination: Pagination;
  fetchUsers: (
    page?: number,
    perPage?: number,
    filters?: UserFilters,
    sort?: string
  ) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  createUser: (userData: CreateUserData) => Promise<void>;
  toggleUserConfirmation: (
    userId: string,
    isConfirmed: boolean
  ) => Promise<void>;
  updateUser: (id: string, userData: UpdateUserData) => Promise<void>;
  updateUserPassword: (
    id: string,
    password: string,
    passwordConfirmation: string
  ) => Promise<void>;
  exportUsers: (filters?: UserFilters) => Promise<void>;
  batchDeleteUsers: (ids: string[]) => Promise<void>;
  batchToggleConfirmation: (userIds: string[], isConfirmed: boolean) => Promise<void>;
  currentFilters: UserFilters | null;
}

export const useUserStore = create<UserState>((set, get) => ({
  users: [],
  isLoading: false,
  isExporting: false,
  error: null,
  pagination: {
    current_page: 1,
    total_pages: 1,
    total_count: 0,
    per_page: 12,
  },
  currentFilters: null, // Inicializar como null

  fetchUsers: async (page = 1, perPage = 12, filters = {}, sort?: string) => {
    set({ isLoading: true, error: null, currentFilters: filters });
    try {
      // Construir la URL con los parámetros de consulta necesarios
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };

      // Añadir los filtros si existen
      if (filters.search) {
        params.search = filters.search;
      }

      if (filters.role) {
        params.role = filters.role;
      }

      // Añadir parámetros de ordenamiento
      if (filters.sort_by) {
        params.sort_by = filters.sort_by;
      }

      if (filters.sort_direction) {
        params.sort_direction = filters.sort_direction;
      }

      // Handle legacy sort parameter
      if (sort) {
        params.sort = sort;
      }

      const response = await api.get("/api/v1/users", { params });

      if (response.status === 200) {
        set({
          users: response.data.users,
          pagination: response.data.pagination,
          isLoading: false,
        });
        return;
      }

      throw new Error("Error al obtener usuarios");
    } catch (error: unknown) {
      console.error("Error fetching users:", error);
      const message =
        apiErrorMessage(error, "Error al obtener usuarios");
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteUser: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.delete(`/api/v1/users/${id}`);

      if (response.status === 200) {
        // Obtener el estado actual de la paginación y filtros
        const { pagination, currentFilters } = get();

        // Si se eliminó el último usuario de una página (excepto la primera)
        if (get().users.length === 1 && pagination.current_page > 1) {
          // Cargar la página anterior
          await get().fetchUsers(
            pagination.current_page - 1,
            pagination.per_page,
            currentFilters || {}
          );
        } else {
          // Refrescar la página actual con los filtros existentes
          await get().fetchUsers(
            pagination.current_page,
            pagination.per_page,
            currentFilters || {}
          );
        }
        return;
      }

      throw new Error("Error al eliminar usuario");
    } catch (error: unknown) {
      console.error("Error deleting user:", error);
      const message =
        apiErrorMessage(error, "Error al eliminar usuario");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createUser: async (userData: CreateUserData) => {
    set({ isLoading: true, error: null });
    try {
      const requestData: Record<string, unknown> = {
        fullname: userData.fullname,
        username: userData.username,
        email: userData.email,
        identification: userData.identification,
        phone_number: userData.phone_number,
        roles: userData.roles,
      };

      if (userData.password) {
        requestData.password = userData.password;
      }

      const response = await api.post("/api/v1/users", requestData);

      if (response.status === 201) {
        const { pagination } = get();
        await get().fetchUsers(pagination.current_page, pagination.per_page);
        return;
      }

      throw new Error("Error al crear usuario");
    } catch (error: unknown) {
      console.error("Error creating user:", error);
      const validationErrors = apiErrorList(error);
      const errorMessage = validationErrors.length
        ? validationErrors.join(", ")
        : apiErrorMessage(error, "Error al crear usuario");

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  toggleUserConfirmation: async (userId: string, isConfirmed: boolean) => {
    set({ isLoading: false, error: null });
    try {
      const targetUser = get().users.find((u) => u.id === userId);
      if (targetUser?.roles.includes("admin")) {
        const message = "No puedes cambiar la confirmación de un administrador";
        set({ error: message });
        throw new Error(message);
      }

      const response = await api.put(
        `/api/v1/users/${userId}/toggle_confirmation`,
        {
          confirmed: isConfirmed,
        }
      );

      if (response.status === 200) {
        // Update the user in the local state
        const users = [...get().users];
        const userIndex = users.findIndex((user) => user.id === userId);

        if (userIndex !== -1) {
          users[userIndex] = {
            ...users[userIndex],
            verified: response.data.verified,
            account_status: response.data.account_status,
          };

          set({ users, isLoading: false });
        }

        return;
      }

      throw new Error("Error al actualizar la confirmación del usuario");
    } catch (error: unknown) {
      console.error("Error toggling user confirmation:", error);
      const message =
        apiErrorMessage(error, "Error al actualizar la confirmación del usuario");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateUser: async (id: string, userData: UpdateUserData) => {
    set({ isLoading: true, error: null });
    try {
      const requestData: Record<string, unknown> = { ...userData };

      const response = await api.put(`/api/v1/users/${id}`, requestData);

      if (response.status === 200) {
        // Update the local state with the updated user
        set((state) => ({
          users: state.users.map((user) =>
            user.id === id ? { ...user, ...response.data.user } : user
          ),
        }));
        set({ isLoading: false });
      } else {
        throw new Error("Error al actualizar usuario");
      }
    } catch (error: unknown) {
      const message =
        apiErrorMessage(error, "Error al actualizar usuario");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateUserPassword: async (
    id: string,
    password: string,
    passwordConfirmation: string
  ) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put(`/api/v1/users/${id}/update_password`, {
        password,
        password_confirmation: passwordConfirmation,
      });

      if (response.status === 200) {
        set({ isLoading: false });
        return;
      }

      throw new Error("Error al actualizar la contraseña");
    } catch (error: unknown) {
      console.error("Error updating password:", error);
      // `errors` is a string[] on this API. The previous version ran
      // Object.entries over it as if it were the Rails field->messages hash,
      // which turned ["..."] into "0: ...".
      const validationErrors = apiErrorList(error);
      const errorMessage = validationErrors.length
        ? validationErrors.join(", ")
        : apiErrorMessage(error, "Error al actualizar la contraseña");

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  exportUsers: async (filters = {}) => {
    try {
      // Build query parameters
      const params: Record<string, string> = {};

      if (filters.search) {
        params.search = filters.search;
      }

      if (filters.role) {
        params.role = filters.role;
      }

      // Make request with responseType blob for file download
      const response = await api.get("/api/v1/users/export", {
        params,
        responseType: "blob",
      });

      // Create a blob from the response
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename with timestamp
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, -5);
      link.setAttribute("download", `usuarios_${timestamp}.xlsx`);

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      set({ isExporting: false });
    } catch (error: unknown) {
      console.error("Error exporting users:", error);
      const message =
        apiErrorMessage(error, "Error al exportar usuarios");
      set({ error: message, isExporting: false });
      throw new Error(message);
    }
  },

  batchDeleteUsers: async (ids: string[]) => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all(ids.map((id) => api.delete(`/api/v1/users/${id}`)));
      // Refetch once after all deletes
      const { pagination, currentFilters } = get();
      await get().fetchUsers(
        pagination.current_page,
        pagination.per_page,
        currentFilters || {}
      );
    } catch (error: unknown) {
      console.error("Error batch deleting users:", error);
      const message =
        apiErrorMessage(error, "Error al eliminar usuarios");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  batchToggleConfirmation: async (userIds: string[], isConfirmed: boolean) => {
    set({ isLoading: true, error: null });
    try {
      await Promise.all(
        userIds.map((id) =>
          api.put(`/api/v1/users/${id}/toggle_confirmation`, {
            confirmed: isConfirmed,
          })
        )
      );
      // Refetch once after all updates
      const { pagination, currentFilters } = get();
      await get().fetchUsers(
        pagination.current_page,
        pagination.per_page,
        currentFilters || {}
      );
    } catch (error: unknown) {
      console.error("Error batch toggling confirmation:", error);
      const message =
        apiErrorMessage(error, "Error al actualizar confirmaciones");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },
}));
