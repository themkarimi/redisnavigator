import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '../types';

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, accessToken: string) => void;
  setAccessToken: (token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setAuth: (user, accessToken) =>
        set({ user, accessToken, isAuthenticated: true }),
      setAccessToken: (accessToken) =>
        set({ accessToken }),
      logout: () =>
        set({ user: null, accessToken: null, isAuthenticated: false }),
    }),
    {
      name: 'redis-navigator-auth',
      // Intentionally do NOT persist `accessToken` to localStorage. Keeping it
      // in memory only limits the blast radius of any XSS: an attacker can
      // read it while the tab is open, but not exfiltrate a long-lived token
      // from storage. The httpOnly `refreshToken` cookie is used to restore
      // the session via /auth/refresh on reload (see PrivateRoute).
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
