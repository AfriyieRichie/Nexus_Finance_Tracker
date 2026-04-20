import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  organisations: Array<{
    organisationId: string;
    organisationName: string;
    baseCurrency: string;
    role: string;
  }>;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  activeOrganisationId: string | null;

  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: UserProfile) => void;
  setActiveOrganisation: (organisationId: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      activeOrganisationId: null,

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

      setUser: (user) => {
        const current = get();
        const firstOrg = user.organisations[0]?.organisationId ?? null;
        set({
          user,
          activeOrganisationId: current.activeOrganisationId ?? firstOrg,
        });
      },

      setActiveOrganisation: (organisationId) =>
        set({ activeOrganisationId: organisationId }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          activeOrganisationId: null,
        }),

      isAuthenticated: () => Boolean(get().accessToken && get().user),
    }),
    {
      name: 'nexus-auth',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist refresh token and user — access token is intentionally in-memory equivalent
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        user: state.user,
        activeOrganisationId: state.activeOrganisationId,
      }),
    },
  ),
);
