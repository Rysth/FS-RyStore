import { create } from "zustand";
import api from "../utils/api";
import type { User } from "../types/auth";
import { apiErrorList, apiErrorMessage } from "../utils/apiError";

interface UpdateProfileData {
  email?: string;
  username?: string;
  fullname?: string;
  identification?: string;
  phone_number?: string;
}

interface UpdatePasswordData {
  current_password: string;
  password: string;
  password_confirmation: string;
}

interface ProfileState {
  isLoading: boolean;
  error: string | null;
  updateProfile: (data: UpdateProfileData) => Promise<User>;
  updatePassword: (data: UpdatePasswordData) => Promise<void>;
}

export const useProfileStore = create<ProfileState>((set) => ({
  isLoading: false,
  error: null,

  updateProfile: async (data: UpdateProfileData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put("/api/v1/profile/update_info", data);

      if (response.status === 200) {
        set({ isLoading: false });
        return response.data.user;
      }

      throw new Error("Error al actualizar el perfil");
    } catch (error: unknown) {
      console.error("Error updating profile:", error);
      const validationErrors = apiErrorList(error);
      const errorMessage = validationErrors.length
        ? validationErrors.join(", ")
        : apiErrorMessage(error, "Error al actualizar el perfil");

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },

  updatePassword: async (data: UpdatePasswordData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.put("/api/v1/profile/update_password", data);

      if (response.status === 200) {
        set({ isLoading: false });
        return;
      }

      throw new Error("Error al actualizar la contraseña");
    } catch (error: unknown) {
      console.error("Error updating password:", error);
      // A wrong current password answers 401 with the reason in `message`;
      // validation failures answer 422 with `errors`. The previous version
      // read `data.error` and `data.field`, which no endpoint has ever sent.
      const validationErrors = apiErrorList(error);
      const errorMessage = validationErrors.length
        ? validationErrors.join(", ")
        : apiErrorMessage(error, "Error al actualizar la contraseña");

      set({ error: errorMessage, isLoading: false });
      throw new Error(errorMessage);
    }
  },
}));
