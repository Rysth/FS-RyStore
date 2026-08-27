import { create } from "zustand";
import api from "../utils/api";
import { apiErrorMessage } from "../utils/apiError";

// ── Types ───────────────────────────────────────────────────

interface DashboardStats {
  total_users: number;
  verified_users: number;
  unverified_users: number;
  users_today: number;
  users_this_week: number;
  users_this_month: number;
  users_last_month: number;
  growth_percentage: number;
  total_roles: number;
  total_permissions: number;
  verification_rate: number;
}

export interface RoleDistribution {
  name: string;
  key: string;
  count: number;
}

export interface AccountStatus {
  status: string;
  label: string;
  count: number;
}

export interface RegistrationTrend {
  date: string;
  month: string;
  total: number;
  verified: number;
}

export interface RecentUser {
  id: number;
  fullname: string;
  username: string;
  email: string;
  roles: string[];
  verified: boolean;
  created_at: string;
}

interface DashboardState {
  stats: DashboardStats | null;
  rolesDistribution: RoleDistribution[];
  accountStatuses: AccountStatus[];
  registrationTrend: RegistrationTrend[];
  recentUsers: RecentUser[];
  isLoading: boolean;
  error: string | null;
  fetchDashboard: () => Promise<void>;
}

// ── Store ───────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState>((set) => ({
  stats: null,
  rolesDistribution: [],
  accountStatuses: [],
  registrationTrend: [],
  recentUsers: [],
  isLoading: false,
  error: null,

  fetchDashboard: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.get("/api/v1/dashboard/stats");
      const data = response.data;

      set({
        stats: data.stats ?? null,
        rolesDistribution: data.roles_distribution ?? [],
        accountStatuses: data.account_statuses ?? [],
        registrationTrend: data.registration_trend ?? [],
        recentUsers: data.recent_users ?? [],
        isLoading: false,
      });
    } catch (error: unknown) {
      const message =
        apiErrorMessage(error, "Error al cargar datos del dashboard");
      set({ error: message, isLoading: false });
    }
  },
}));
