import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type {
  DeliveryMethod,
  Order,
  OrderStatus,
  PaymentMethod,
  Pagination,
} from "../types/store";

type StatusSummary = Record<OrderStatus, number>;

interface OrderFilters {
  search?: string;
  status?: string;
}

interface OrderState {
  orders: Order[];
  selectedOrder: Order | null;
  summary: StatusSummary | null;
  pagination: Pagination;
  isLoading: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  fetchOrders: (
    page?: number,
    perPage?: number,
    filters?: OrderFilters,
  ) => Promise<void>;
  fetchOrder: (id: number) => Promise<Order>;
  createOrder: (payload: NewOrderPayload) => Promise<Order>;
  updateStatus: (id: number, status: OrderStatus) => Promise<void>;
  clearSelectedOrder: () => void;
}

/**
 * An order the shop enters by hand. Only quantities and product ids travel —
 * prices, subtotals and the total are resolved server-side from the catalog, so
 * the wholesale ladder applies and nothing here can disagree with it.
 */
export interface NewOrderPayload {
  order: {
    customer_name: string;
    phone: string;
    address?: string;
    city?: string;
    notes?: string;
    payment_method: PaymentMethod;
    delivery_method: DeliveryMethod;
    status?: OrderStatus;
  };
  items: { product_id: number; quantity: number }[];
}

const DEFAULT_PAGINATION: Pagination = {
  current_page: 1,
  total_pages: 1,
  total_count: 0,
  per_page: 12,
};

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  selectedOrder: null,
  summary: null,
  pagination: DEFAULT_PAGINATION,
  isLoading: false,
  isLoadingDetail: false,
  error: null,

  fetchOrders: async (page = 1, perPage = 12, filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, unknown> = { page, per_page: perPage };
      if (filters.search) params.search = filters.search;
      if (filters.status) params.status = filters.status;

      const response = await api.get("/api/v1/orders", { params });
      set({
        orders: response.data.orders || [],
        summary: response.data.summary || null,
        pagination: response.data.pagination || DEFAULT_PAGINATION,
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar los pedidos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  fetchOrder: async (id) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const response = await api.get(`/api/v1/orders/${id}`);
      const order: Order = response.data.order;
      set({ selectedOrder: order, isLoadingDetail: false });
      return order;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el pedido");
      set({ error: message, isLoadingDetail: false });
      throw new Error(message);
    }
  },

  createOrder: async (payload) => {
    set({ error: null });
    try {
      const response = await api.post("/api/v1/orders", payload);
      return response.data.order as Order;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al registrar el pedido");
      set({ error: message });
      throw new Error(message);
    }
  },

  updateStatus: async (id, status) => {
    set({ error: null });
    try {
      const response = await api.put(`/api/v1/orders/${id}/update_status`, {
        status,
      });
      const updated: Order = response.data.order;
      set((state) => ({
        orders: state.orders.map((order) =>
          order.id === id ? { ...order, status: updated.status } : order,
        ),
        selectedOrder:
          state.selectedOrder?.id === id ? updated : state.selectedOrder,
      }));
    } catch (error) {
      const message = apiErrorMessage(
        error,
        "Error al actualizar el estado del pedido",
      );
      set({ error: message });
      throw new Error(message);
    }
  },

  clearSelectedOrder: () => set({ selectedOrder: null }),
}));
