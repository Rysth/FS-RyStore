import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Category } from "../types/store";

export interface CategoryFormData {
  name: string;
  active: boolean;
  featured?: boolean;
}

/**
 * A FormData payload carries the featured image; a plain object is used when
 * there is no file to send. Same dual-mode pattern as businessStore.
 */
type CategoryPayload = CategoryFormData | FormData;

function requestConfig(data: CategoryPayload) {
  return data instanceof FormData
    ? { headers: { "Content-Type": "multipart/form-data" } }
    : {};
}

function requestBody(data: CategoryPayload) {
  return data instanceof FormData ? data : { category: data };
}

interface CategoryState {
  categories: Category[];
  isLoading: boolean;
  error: string | null;
  fetchCategories: () => Promise<void>;
  createCategory: (data: CategoryPayload) => Promise<void>;
  updateCategory: (id: number, data: CategoryPayload) => Promise<void>;
  deleteCategory: (id: number) => Promise<void>;
  reorderCategories: (orderedIds: number[]) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,

  fetchCategories: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/categories");
      set({ categories: response.data.categories || [], isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar las categorías");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createCategory: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/api/v1/categories", requestBody(data), requestConfig(data));
      set({ isLoading: false });
      await get().fetchCategories();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear la categoría");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateCategory: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(
        `/api/v1/categories/${id}`,
        requestBody(data),
        requestConfig(data),
      );
      set({ isLoading: false });
      await get().fetchCategories();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar la categoría");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteCategory: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/categories/${id}`);
      set((state) => ({
        categories: state.categories.filter((category) => category.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar la categoría");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  /**
   * Persists the drag & drop order. The caller applies the new order
   * optimistically and reverts if this rejects.
   */
  reorderCategories: async (orderedIds) => {
    set({ error: null });
    try {
      const response = await api.put("/api/v1/categories/reorder", {
        positions: orderedIds.map((id, index) => ({ id, position: index + 1 })),
      });
      set({ categories: response.data.categories || [] });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al reordenar las categorías");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
