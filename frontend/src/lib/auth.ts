import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import api from './api';

// ================= ROLE SYSTEM =================
export type Role =
  | 'super_admin'
  | 'owner'
  | 'manager'
  | 'staff'
  | 'customer';

// ================= USER =================
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  company_id: string;
  company_slug: string;
  company_name: string;
  plan_tier: string;
  subscription_status: string;
  currency: string;
}

// ================= STORE =================
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User, token: string) => void;
}

// ================= ROLE HELPERS =================
export const OWNER_ROLES: Role[] = ['super_admin', 'owner'];
export const MANAGER_ROLES: Role[] = ['super_admin', 'owner', 'manager'];
export const STAFF_ROLES: Role[] = ['super_admin', 'owner', 'manager', 'staff'];

export const canSeeFinancials = (role: Role) =>
  role === 'super_admin' || role === 'owner';

export const isOwner = (role: Role) =>
  role === 'super_admin' || role === 'owner';

export const isManager = (role: Role) =>
  role === 'super_admin' || role === 'owner' || role === 'manager';

export const isStaff = (role: Role) =>
  role === 'super_admin' || role === 'owner' || role === 'manager' || role === 'staff';

export const isCustomer = (role: Role) => role === 'customer';

// ================= ROUTING =================
export const roleDashboard = (role: Role): string => {
  if (role === 'super_admin') return '/admin';
  if (role === 'customer') return '/customer';
  if (role === 'staff') return '/kitchen';
  return '/dashboard';
};

// ================= STORE =================
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });

        try {
          const res = await api.post('/auth/login', { email, password });

          const { token, user } = res.data;

          api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

          set({ user, token, isLoading: false });

        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      logout: () => {
        delete api.defaults.headers.common['Authorization'];
        set({ user: null, token: null });

        if (typeof window !== 'undefined') {
          window.location.href = '/auth/login';
        }
      },

      setUser: (user, token) => {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        set({ user, token });
      }
    }),
    {
      name: 'ibirdos-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.token) {
          api.defaults.headers.common['Authorization'] = `Bearer ${state.token}`;
        }
      }
    }
  )
);