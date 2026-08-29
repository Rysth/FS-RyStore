import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";
import type { Branch, DownloadableCatalog } from "../types/store";

export interface WebBusinessContent {
  about_title: string | null;
  about_body: string | null;
  contact_intro: string | null;
}

export interface BranchFormData {
  name: string;
  address?: string | null;
  hours?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  maps_url?: string | null;
  active: boolean;
}

export type DownloadableCatalogPayload = FormData;

interface WebContentState {
  business: WebBusinessContent | null;
  branches: Branch[];
  downloadableCatalogs: DownloadableCatalog[];
  isLoading: boolean;
  error: string | null;
  fetchWebContent: () => Promise<void>;
  updateBusinessContent: (data: WebBusinessContent) => Promise<void>;
  createBranch: (data: BranchFormData) => Promise<void>;
  updateBranch: (id: number, data: BranchFormData) => Promise<void>;
  deleteBranch: (id: number) => Promise<void>;
  reorderBranches: (orderedIds: number[]) => Promise<void>;
  createDownloadableCatalog: (data: DownloadableCatalogPayload) => Promise<void>;
  updateDownloadableCatalog: (id: number, data: DownloadableCatalogPayload) => Promise<void>;
  deleteDownloadableCatalog: (id: number) => Promise<void>;
  reorderDownloadableCatalogs: (orderedIds: number[]) => Promise<void>;
}

function branchBody(data: BranchFormData) {
  return { branch: data };
}

export const useWebContentStore = create<WebContentState>((set, get) => ({
  business: null,
  branches: [],
  downloadableCatalogs: [],
  isLoading: false,
  error: null,

  fetchWebContent: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/web-content");
      set({
        business: response.data.business || null,
        branches: response.data.branches || [],
        downloadableCatalogs: response.data.downloadable_catalogs || [],
        isLoading: false,
      });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al cargar el contenido web");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateBusinessContent: async (data) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.patch("/api/v1/web-content/business", { business: data });
      set({ business: response.data.business || data, isLoading: false });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al guardar la información web");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  createBranch: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/api/v1/branches", branchBody(data));
      set({ isLoading: false });
      await get().fetchWebContent();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear la sucursal");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateBranch: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/api/v1/branches/${id}`, branchBody(data));
      set({ isLoading: false });
      await get().fetchWebContent();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar la sucursal");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteBranch: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/branches/${id}`);
      set((state) => ({
        branches: state.branches.filter((branch) => branch.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar la sucursal");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  reorderBranches: async (orderedIds) => {
    set({ error: null });
    try {
      const response = await api.put("/api/v1/branches/reorder", {
        positions: orderedIds.map((id, index) => ({ id, position: index + 1 })),
      });
      set({ branches: response.data.branches || [] });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al reordenar las sucursales");
      set({ error: message });
      throw new Error(message);
    }
  },

  createDownloadableCatalog: async (data) => {
    set({ isLoading: true, error: null });
    try {
      await api.post("/api/v1/downloadable-catalogs", data);
      set({ isLoading: false });
      await get().fetchWebContent();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al crear el catálogo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  updateDownloadableCatalog: async (id, data) => {
    set({ isLoading: true, error: null });
    try {
      await api.put(`/api/v1/downloadable-catalogs/${id}`, data);
      set({ isLoading: false });
      await get().fetchWebContent();
    } catch (error) {
      const message = apiErrorMessage(error, "Error al actualizar el catálogo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  deleteDownloadableCatalog: async (id) => {
    set({ isLoading: true, error: null });
    try {
      await api.delete(`/api/v1/downloadable-catalogs/${id}`);
      set((state) => ({
        downloadableCatalogs: state.downloadableCatalogs.filter((catalog) => catalog.id !== id),
        isLoading: false,
      }));
    } catch (error) {
      const message = apiErrorMessage(error, "Error al eliminar el catálogo");
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  reorderDownloadableCatalogs: async (orderedIds) => {
    set({ error: null });
    try {
      const response = await api.put("/api/v1/downloadable-catalogs/reorder", {
        positions: orderedIds.map((id, index) => ({ id, position: index + 1 })),
      });
      set({ downloadableCatalogs: response.data.downloadable_catalogs || [] });
    } catch (error) {
      const message = apiErrorMessage(error, "Error al reordenar los catálogos");
      set({ error: message });
      throw new Error(message);
    }
  },
}));
