import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Customer, CustomerOrderSummary, Pagination } from "../types/store";

export interface CustomerFormData {
  name?: string;
  address?: string;
  city?: string;
  notes?: string;
}

export interface NewCustomerFormData extends CustomerFormData {
  phone: string;
}

interface CustomerState {
  customers: Customer[];
  selectedCustomer: Customer | null;
  selectedCustomerOrders: CustomerOrderSummary[];
  pagination: Pagination;
  isLoading: boolean;
  isLoadingDetail: boolean;
  error: string | null;
  fetchCustomers: (
    page?: number,
    search?: string,
    sort?: string,
  ) => Promise<void>;
  fetchCustomer: (id: number) => Promise<void>;
  createCustomer: (data: NewCustomerFormData) => Promise<Customer>;
  updateCustomer: (id: number, data: CustomerFormData) => Promise<void>;
  clearSelectedCustomer: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  current_page: 1,
  total_pages: 1,
  total_count: 0,
  per_page: 12,
};

export const useCustomerStore = create<CustomerState>((set, get) => ({
  customers: [],
  selectedCustomer: null,
  selectedCustomerOrders: [],
  pagination: DEFAULT_PAGINATION,
  isLoading: false,
  isLoadingDetail: false,
  error: null,

  fetchCustomers: async (page = 1, search = "", sort = "") => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, unknown> = { page };
      if (search) params.search = search;
      if (sort) params.sort = sort;

      const response = await api.get("/api/v1/customers", { params });
      set({
        customers: response.data.customers || [],
        pagination: response.data.pagination || DEFAULT_PAGINATION,
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar los contactos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  fetchCustomer: async (id) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const response = await api.get(`/api/v1/customers/${id}`);
      set({
        selectedCustomer: response.data.customer,
        selectedCustomerOrders: response.data.orders || [],
        isLoadingDetail: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el contacto");
      set({ error: message, isLoadingDetail: false });
      throw new Error(message);
    }
  },

  createCustomer: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/api/v1/customers", { customer: data });
      set({ isLoading: false });
      await get().fetchCustomers();
      return response.data.customer as Customer;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear el contacto");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateCustomer: async (id, data) => {
    set({ error: null });
    try {
      const response = await api.put(`/api/v1/customers/${id}`, {
        customer: data,
      });
      const updated: Customer = response.data.customer;
      set((state) => ({
        customers: state.customers.map((customer) =>
          customer.id === id ? updated : customer,
        ),
        selectedCustomer:
          state.selectedCustomer?.id === id ? updated : state.selectedCustomer,
      }));
      await get().fetchCustomers();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar el contacto");
      set({ error: message });
      throw new Error(message);
    }
  },

  clearSelectedCustomer: () =>
    set({ selectedCustomer: null, selectedCustomerOrders: [] }),
}));
