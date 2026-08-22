import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type AuthUser } from '@/types/user.types';
import { clearTokenCache } from '@/lib/tokenCache';

const SESSION_MARKER_KEY = 'ramis_session_active';
/** Middleware auth kontrolü için cookie — token localStorage'da, cookie sadece "var mı" kontrolü için */
const AUTH_COOKIE_NAME = 'ramis_auth';
const AUTH_COOKIE_MAX_AGE_REMEMBER = 30 * 24 * 60 * 60; // 30 gün
const AUTH_COOKIE_MAX_AGE_SESSION = 8 * 60 * 60; // 8 saat (oturum bazlı)

function setAuthCookie(rememberMe: boolean) {
    try {
        const maxAge = rememberMe ? AUTH_COOKIE_MAX_AGE_REMEMBER : AUTH_COOKIE_MAX_AGE_SESSION;
        document.cookie = `${AUTH_COOKIE_NAME}=1;path=/;max-age=${maxAge};SameSite=Lax`;
    } catch { /* SSR/private mode */ }
}

function clearAuthCookie() {
    try {
        document.cookie = `${AUTH_COOKIE_NAME}=;path=/;max-age=0;SameSite=Lax`;
    } catch { /* SSR/private mode */ }
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    rememberMe: boolean;
    setAuth: (user: AuthUser, token: string) => void;
    setRememberMe: (value: boolean) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            rememberMe: true,
            setAuth: (user, token) => {
                set({ user, token });
                try {
                    sessionStorage.setItem(SESSION_MARKER_KEY, '1');
                } catch { /* private mode */ }
                // Middleware auth kontrolü için cookie set et
                setAuthCookie(useAuthStore.getState().rememberMe);
            },
            setRememberMe: (value) => {
                set({ rememberMe: value });
            },
            logout: () => {
                set({ user: null, token: null, rememberMe: true });
                try {
                    sessionStorage.removeItem(SESSION_MARKER_KEY);
                } catch { /* private mode */ }
                clearAuthCookie();
                clearTokenCache();
            },
        }),
        {
            name: 'auth-storage',
            onRehydrateStorage: () => (state) => {
                if (!state?.user) return;
                if (state.rememberMe) return;

                try {
                    const hasSession = sessionStorage.getItem(SESSION_MARKER_KEY) === '1';
                    if (!hasSession) {
                        state.logout();
                    }
                } catch { /* private mode */ }
            },
        }
    )
);
