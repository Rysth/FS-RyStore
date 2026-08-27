import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

export interface SalesReportRow {
  date: string;
  orders: number;
  revenue: string;
}

export interface SalesReportSummary {
  orders: number;
  revenue: string;
  average_order_value: string;
}

export interface ProductReportRow {
  product_name: string;
  quantity: number;
  revenue: string;
}

export interface CustomerReportRow {
  customer_id: number;
  name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: string;
}

export interface CouponReportRow {
  coupon_id: number;
  code: string | null;
  uses: number;
  total_discount: string;
}

export interface DateRange {
  from?: string;
  to?: string;
}

interface ReportState {
  sales: SalesReportRow[];
  salesSummary: SalesReportSummary | null;
  products: ProductReportRow[];
  customers: CustomerReportRow[];
  coupons: CouponReportRow[];
  isLoading: boolean;
  error: string | null;
  fetchSalesReport: (range?: DateRange) => Promise<void>;
  fetchProductsReport: (range?: DateRange) => Promise<void>;
  fetchCustomersReport: (range?: DateRange) => Promise<void>;
  fetchCouponsReport: (range?: DateRange) => Promise<void>;
  exportReport: (
    report: "sales" | "products" | "customers" | "coupons",
    range?: DateRange,
  ) => Promise<void>;
}

export const useReportStore = create<ReportState>((set) => ({
  sales: [],
  salesSummary: null,
  products: [],
  customers: [],
  coupons: [],
  isLoading: false,
  error: null,

  fetchSalesReport: async (range = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/reports/sales", { params: range });
      set({
        sales: response.data.rows || [],
        salesSummary: response.data.summary || null,
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el reporte de ventas");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  fetchProductsReport: async (range = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/reports/products", { params: range });
      set({ products: response.data.rows || [], isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el reporte de productos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  fetchCustomersReport: async (range = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/reports/customers", { params: range });
      set({ customers: response.data.rows || [], isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el reporte de clientes");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  fetchCouponsReport: async (range = {}) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/reports/coupons", { params: range });
      set({ coupons: response.data.rows || [], isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el reporte de cupones");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  // Downloads authenticate via the axios instance's bearer token, so a plain
  // <a href> can't trigger this — same blob-download pattern as
  // userStore.exportUsers.
  exportReport: async (report, range = {}) => {
    try {
      const response = await api.get(`/api/v1/reports/${report}`, {
        params: { ...range, export: "csv" },
        responseType: "blob",
      });

      const blob = new Blob([response.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${report}-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = apiErrorMessage(error, "Error al exportar el reporte");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
