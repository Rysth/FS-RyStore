import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

export type RestaurantPaymentMethod = "cash" | "transfer" | "card" | "platform";

export interface RestaurantOrderItemInput {
  product_id: number;
  quantity: number;
  removed_ingredients?: string[];
  extras?: Array<{ name: string; price: string }>;
  notes?: string | null;
}

export interface RestaurantOrder {
  id: number;
  number: number;
  business_date: string;
  customer_name: string;
  channel: string;
  status: string;
  payment_status: string;
  total_amount: string;
  paid_amount: string;
  balance_amount: string;
  confirmed_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  prep_seconds: number | null;
  delivery_seconds: number | null;
  cash_register_id: number;
  items: Array<{
    id: number;
    product_id: number;
    product_name: string;
    unit_price: string;
    quantity: number;
    subtotal: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface CreateRestaurantOrderPayload {
  customer_name: string;
  channel: "local" | "whatsapp" | "rappi" | "pedidosya" | "self_order";
  payment_method: RestaurantPaymentMethod;
  received_amount?: string | null;
  reference?: string | null;
  items: RestaurantOrderItemInput[];
}

interface RestaurantOrderState {
  orders: RestaurantOrder[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  fetchOrders: () => Promise<void>;
  createOrder: (payload: CreateRestaurantOrderPayload) => Promise<RestaurantOrder>;
  deliverOrder: (id: number) => Promise<void>;
  cancelOrder: (id: number, reason: string) => Promise<void>;
}

export const useRestaurantOrderStore = create<RestaurantOrderState>((set, get) => ({
  orders: [],
  isLoading: false,
  isSubmitting: false,
  error: null,

  fetchOrders: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/restaurant/orders");
      set({ orders: response.data.orders ?? [], isLoading: false });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudieron cargar los pedidos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createOrder: async (payload) => {
    set({ isSubmitting: true, error: null });
    try {
      const response = await api.post("/api/v1/restaurant/orders", payload);
      const order = response.data.order as RestaurantOrder;
      set({ orders: [order, ...get().orders], isSubmitting: false });
      return order;
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo registrar el pedido");
      set({ error: message, isSubmitting: false });
      throw new Error(message);
    }
  },

  deliverOrder: async (id) => {
    set({ error: null });
    try {
      const response = await api.post(`/api/v1/restaurant/orders/${id}/deliver`);
      const updated = response.data.order as RestaurantOrder;
      set({
        orders: get().orders.map((order) => order.id === id ? updated : order),
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo entregar el pedido");
      set({ error: message });
      throw new Error(message);
    }
  },

  cancelOrder: async (id, reason) => {
    set({ error: null });
    try {
      const response = await api.post(`/api/v1/restaurant/orders/${id}/cancel`, { reason });
      const updated = response.data.order as RestaurantOrder;
      set({
        orders: get().orders.map((order) => order.id === id ? updated : order),
      });
    } catch (error: unknown) {
      const message = apiErrorMessage(error, "No se pudo cancelar el pedido");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
