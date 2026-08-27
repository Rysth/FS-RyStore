import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

// ── Types ───────────────────────────────────────────────────

interface DashboardStats {
  total_orders: number;
  pending_orders: number;
  orders_today: number;
  orders_this_week: number;
  orders_this_month: number;
  orders_last_month: number;
  total_revenue: string;
  revenue_this_month: string;
  revenue_last_month: string;
  growth_percentage: number;
  average_order_value: string;
  total_products: number;
  active_products: number;
  low_stock_products: number;
  total_categories: number;
}

export interface OrderStatusCount {
  status: string;
  label: string;
  count: number;
}

export interface SalesTrend {
  date: string;
  month: string;
  orders: number;
  revenue: string;
}

export interface RecentOrder {
  id: number;
  number: string;
  customer_name: string;
  total: string;
  status: string;
  payment_method: string;
  created_at: string;
}

interface DashboardState {
  stats: DashboardStats | null;
  orderStatuses: OrderStatusCount[];
  salesTrend: SalesTrend[];
  recentOrders: RecentOrder[];
  isLoading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

// ── Store ───────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  orderStatuses: [],
  salesTrend: [],
  recentOrders: [],
  isLoading: false,
  error: null,

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/dashboard/stats");
      const data = response.data;

      set({
        stats: data.stats ?? null,
        orderStatuses: data.order_statuses ?? [],
        salesTrend: data.sales_trend ?? [],
        recentOrders: data.recent_orders ?? [],
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(
        error,
        "Error al cargar datos del dashboard"
      );
      set({ error: message, isLoading: false });
    }
  },
}));
