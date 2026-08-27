import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Promotion } from "../types/store";

export interface PromotionItemInput {
  product_id: number;
  quantity: number;
}

export interface PromotionFormData {
  name: string;
  description?: string | null;
  price: string;
  active: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  /** The whole bundle replaces whatever is stored; the server rebuilds the set. */
  items: PromotionItemInput[];
}

interface PromotionState {
  promotions: Promotion[];
  isLoading: boolean;
  error: string | null;
  fetchPromotions: () => Promise<void>;
  createPromotion: (data: PromotionFormData) => Promise<Promotion>;
  updatePromotion: (id: number, data: PromotionFormData) => Promise<Promotion>;
  deletePromotion: (id: number) => Promise<void>;
  /**
   * The picture travels on its own endpoint for the same reason a product's
   * does: the promotion payload carries the nested items array, and multipart
   * cannot express it.
   */
  uploadPromotionImage: (id: number, file: File) => Promise<Promotion>;
  removePromotionImage: (id: number) => Promise<Promotion>;
}

/** Swaps one row in place so the list reflects a change without a refetch. */
function replacePromotion(
  set: (fn: (state: PromotionState) => Partial<PromotionState>) => void,
  updated: Promotion,
) {
  set((state) => ({
    promotions: state.promotions.map((promotion) =>
      promotion.id === updated.id ? updated : promotion,
    ),
  }));
}

export const usePromotionStore = create<PromotionState>((set, get) => ({
  promotions: [],
  isLoading: false,
  error: null,

  fetchPromotions: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/promotions");
      set({ promotions: response.data.promotions || [], isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar los combos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createPromotion: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/api/v1/promotions", { promotion: data });
      set({ isLoading: false });
      await get().fetchPromotions();
      return response.data.promotion as Promotion;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear el combo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updatePromotion: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put(`/api/v1/promotions/${id}`, { promotion: data });
      const promotion = response.data.promotion as Promotion;
      set({ isLoading: false });
      replacePromotion(set, promotion);
      return promotion;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar el combo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deletePromotion: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/promotions/${id}`);
      set((state) => ({
        promotions: state.promotions.filter((promotion) => promotion.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar el combo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  uploadPromotionImage: async (id, file) => {
    try {
      const body = new FormData();
      body.append("image", file);

      const response = await api.post(`/api/v1/promotions/${id}/image`, body);
      const promotion = response.data.promotion as Promotion;
      replacePromotion(set, promotion);
      return promotion;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al subir la imagen"));
    }
  },

  removePromotionImage: async (id) => {
    try {
      const response = await api.delete(`/api/v1/promotions/${id}/image`);
      const promotion = response.data.promotion as Promotion;
      replacePromotion(set, promotion);
      return promotion;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al quitar la imagen"));
    }
  },
}));
