import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

export interface CashRegister {
  id: number;
  status: "open" | "closed";
  business_date: string;
  opened_by: string;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  opening_amount: string;
  closing_amount: string | null;
  expected_cash: string | null;
  cash_total: string | null;
  transfer_total: string | null;
  card_total: string | null;
  platform_total: string | null;
  total_sales: string | null;
  difference: string | null;
  orders_count: number | null;
  orders_paid_count: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashRegisterLiveTotals {
  cashTotal: string;
  transferTotal: string;
  cardTotal: string;
  platformTotal: string;
  totalSales: string;
  ordersCount: number;
  ordersPaidCount: number;
}

interface CashRegisterState {
  current: CashRegister | null;
  liveTotals: CashRegisterLiveTotals | null;
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  fetchCurrent: () => Promise<void>;
  open: (openingAmount: string) => Promise<void>;
  close: (id: number, closingAmount: string, notes?: string) => Promise<void>;
}

export const useRestaurantCashRegisterStore = create<CashRegisterState>((set) => ({
  current: null,
  liveTotals: null,
  isLoading: false,
  isSubmitting: false,
  error: null,

  fetchCurrent: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/restaurant/cash-register/current");
      set({
        current: response.data.cash_register,
        liveTotals: response.data.live_totals,
        isLoading: false,
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo cargar la caja");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  open: async (openingAmount: string) => {
    set({ isSubmitting: true, error: null });
    try {
      const response = await api.post("/api/v1/restaurant/cash-register/open", {
        opening_amount: openingAmount,
      });
      set({
        current: response.data.cash_register,
        liveTotals: {
          cashTotal: "0.00",
          transferTotal: "0.00",
          cardTotal: "0.00",
          platformTotal: "0.00",
          totalSales: "0.00",
          ordersCount: 0,
          ordersPaidCount: 0,
        },
        isSubmitting: false,
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo abrir la caja");
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },

  close: async (id: number, closingAmount: string, notes?: string) => {
    set({ isSubmitting: true, error: null });
    try {
      const response = await api.post(`/api/v1/restaurant/cash-register/${id}/close`, {
        closing_amount: closingAmount,
        notes,
      });
      set({
        current: response.data.cash_register,
        liveTotals: null,
        isSubmitting: false,
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo cerrar la caja");
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },
}));
