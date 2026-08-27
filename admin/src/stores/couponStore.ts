import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Coupon, DiscountType, Pagination } from "../types/store";

export interface CouponFormData {
  code: string;
  discount_type: DiscountType;
  discount_value: number;
  active: boolean;
  starts_at?: string | null;
  expires_at?: string | null;
  usage_limit?: number | null;
  min_order_total?: number | null;
}

interface CouponState {
  coupons: Coupon[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;
  fetchCoupons: (page?: number, search?: string) => Promise<void>;
  createCoupon: (data: CouponFormData) => Promise<void>;
  updateCoupon: (id: number, data: CouponFormData) => Promise<void>;
  deleteCoupon: (id: number) => Promise<void>;
}

const DEFAULT_PAGINATION: Pagination = {
  current_page: 1,
  total_pages: 1,
  total_count: 0,
  per_page: 12,
};

export const useCouponStore = create<CouponState>((set, get) => ({
  coupons: [],
  pagination: DEFAULT_PAGINATION,
  isLoading: false,
  error: null,

  fetchCoupons: async (page = 1, search = "") => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, unknown> = { page };
      if (search) params.search = search;

      const response = await api.get("/api/v1/coupons", { params });
      set({
        coupons: response.data.coupons || [],
        pagination: response.data.pagination || DEFAULT_PAGINATION,
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar los cupones");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createCoupon: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/api/v1/coupons", { coupon: data });
      set({ isLoading: false });
      await get().fetchCoupons();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear el cupón");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateCoupon: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/api/v1/coupons/${id}`, { coupon: data });
      set({ isLoading: false });
      await get().fetchCoupons();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar el cupón");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteCoupon: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/coupons/${id}`);
      set((state) => ({
        coupons: state.coupons.filter((coupon) => coupon.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar el cupón");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },
}));
