import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

export interface KitchenOrder {
  id: number;
  number: number;
  customer_name: string;
  channel: string;
  status: "preparing" | "ready";
  confirmed_at: string | null;
  items: Array<{
    id: number;
    quantity: number;
    product_name: string;
    removed_ingredients: string[];
    extras: Array<{ name: string; price: string }>;
    notes: string | null;
  }>;
}

interface KitchenState {
  orders: KitchenOrder[];
  isLoading: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  markReady: (id: number) => Promise<void>;
}

export const useRestaurantKitchenStore = create<KitchenState>((set, get) => ({
  orders: [],
  isLoading: false,
  error: null,

  fetchOrders: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/restaurant/kitchen/orders");
      set({ orders: response.data.orders ?? [], isLoading: false });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo cargar la cocina");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  markReady: async (id) => {
    set({ error: null });
    try {
      const response = await api.post(`/api/v1/restaurant/kitchen/orders/${id}/ready`);
      const updated = response.data.order as KitchenOrder;
      set({
        orders: get().orders.map((order) => order.id === id ? updated : order),
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo marcar el pedido como listo");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
