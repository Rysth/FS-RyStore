import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Pagination, Product } from "../types/store";

export interface PriceTierInput {
  min_quantity: number;
  unit_price: string;
}

export interface ProductOptionTypeInput {
  name: string;
  values: string[];
}

export interface ProductVariantInput {
  options: Record<string, string>;
  sku?: string | null;
  price?: string | null;
  stock?: number | null;
}

export interface ProductFormData {
  name: string;
  kind?: "product" | "service";
  description?: string;
  price: string;
  compare_at_price?: string | null;
  category_id?: number | null;
  active: boolean;
  stock?: number | null;
  /** The full ladder replaces whatever is stored; `[]` clears it. */
  price_tiers?: PriceTierInput[];
  /** The full option matrix replaces whatever is stored; `[]` clears it. */
  option_types?: ProductOptionTypeInput[];
  variants?: ProductVariantInput[];
}

interface ProductFilters {
  search?: string;
  category_id?: number | string;
  active?: string;
}

interface ProductState {
  products: Product[];
  pagination: Pagination;
  isLoading: boolean;
  error: string | null;
  fetchProducts: (
    page?: number,
    perPage?: number,
    filters?: ProductFilters,
  ) => Promise<void>;
  fetchProduct: (id: number) => Promise<Product>;
  createProduct: (data: ProductFormData) => Promise<Product>;
  updateProduct: (id: number, data: ProductFormData) => Promise<void>;
  deleteProduct: (id: number) => Promise<void>;
  /**
   * The image travels on its own endpoint instead of riding along in the
   * product payload: that payload carries the nested price_tiers ladder, and
   * multipart cannot express the empty array that clears it.
   */
  uploadProductImage: (id: number, file: File) => Promise<void>;
  removeProductImage: (id: number) => Promise<void>;
  /** Gallery: several photos per product, ordered, main one first. */
  uploadProductImages: (id: number, files: File[]) => Promise<Product>;
  reorderProductImages: (id: number, imageIds: number[]) => Promise<Product>;
  deleteProductImage: (id: number, imageId: number) => Promise<Product>;
  /** One clip per product, so an upload replaces whatever was there. */
  uploadProductVideo: (id: number, file: File) => Promise<Product>;
  removeProductVideo: (id: number) => Promise<Product>;
}

/** Swaps one row in place so the list reflects a new image without a refetch. */
function replaceProduct(
  set: (fn: (state: ProductState) => Partial<ProductState>) => void,
  updated: Product,
) {
  set((state) => ({
    products: state.products.map((product) =>
      product.id === updated.id ? updated : product,
    ),
  }));
}

const DEFAULT_PAGINATION: Pagination = {
  current_page: 1,
  total_pages: 1,
  total_count: 0,
  per_page: 12,
};

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  pagination: DEFAULT_PAGINATION,
  isLoading: false,
  error: null,

  fetchProducts: async (page = 1, perPage = 12, filters = {}) => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, unknown> = { page, per_page: perPage };
      if (filters.search) params.search = filters.search;
      if (filters.category_id) params.category_id = filters.category_id;
      if (filters.active) params.active = filters.active;

      const response = await api.get("/api/v1/products", { params });
      set({
        products: response.data.products || [],
        pagination: response.data.pagination || DEFAULT_PAGINATION,
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar los productos");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  // The edit page can be reached by URL, so it cannot assume the list was
  // loaded first and hold the record already.
  fetchProduct: async (id) => {
    set({ error: null });
    try {
      const response = await api.get(`/api/v1/products/${id}`);
      return response.data.product as Product;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el producto");
      set({ error: message });
      throw new Error(message);
    }
  },

  createProduct: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.post("/api/v1/products", { product: data });
      set({ isLoading: false });
      await get().fetchProducts(1, get().pagination.per_page);
      return response.data.product as Product;
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear el producto");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateProduct: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put(`/api/v1/products/${id}`, {
        product: data,
      });
      const updated: Product = response.data.product;
      set((state) => ({
        products: state.products.map((product) =>
          product.id === id ? updated : product,
        ),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar el producto");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteProduct: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/products/${id}`);
      set((state) => ({
        products: state.products.filter((product) => product.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar el producto");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  uploadProductImage: async (id, file) => {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const response = await api.post(`/api/v1/products/${id}/image`, formData);
      replaceProduct(set, response.data.product as Product);
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al subir la imagen"));
    }
  },

  removeProductImage: async (id) => {
    try {
      const response = await api.delete(`/api/v1/products/${id}/image`);
      replaceProduct(set, response.data.product as Product);
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al quitar la imagen"));
    }
  },

  // All three answer with the whole product, so the caller never has to guess
  // what the new order or the remaining images are.
  uploadProductImages: async (id, files) => {
    try {
      const body = new FormData();
      // Sent in one request: the server checks the batch before uploading any of
      // it, so a rejected file cannot leave the gallery half-updated.
      for (const file of files) body.append("images[]", file);

      const response = await api.post(`/api/v1/products/${id}/images`, body);
      const product = response.data.product as Product;
      replaceProduct(set, product);
      return product;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al subir las imágenes"));
    }
  },

  reorderProductImages: async (id, imageIds) => {
    try {
      const response = await api.put(`/api/v1/products/${id}/images/reorder`, {
        image_ids: imageIds,
      });
      const product = response.data.product as Product;
      replaceProduct(set, product);
      return product;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al reordenar las imágenes"));
    }
  },

  deleteProductImage: async (id, imageId) => {
    try {
      const response = await api.delete(`/api/v1/products/${id}/images/${imageId}`);
      const product = response.data.product as Product;
      replaceProduct(set, product);
      return product;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al eliminar la imagen"));
    }
  },

  uploadProductVideo: async (id, file) => {
    try {
      const body = new FormData();
      body.append("video", file);

      const response = await api.post(`/api/v1/products/${id}/video`, body);
      const product = response.data.product as Product;
      replaceProduct(set, product);
      return product;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al subir el video"));
    }
  },

  removeProductVideo: async (id) => {
    try {
      const response = await api.delete(`/api/v1/products/${id}/video`);
      const product = response.data.product as Product;
      replaceProduct(set, product);
      return product;
    } catch (error) {
      throw new Error(apiErrorMessage(error, "Error al eliminar el video"));
    }
  },
}));
