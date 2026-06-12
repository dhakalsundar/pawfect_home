'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  authService,
  isTwoFactorRequired,
  type CaptchaAnswer,
  type LoginResult,
} from '@/services/auth.service';
import { setSessionExpiredHandler } from '@/services/http';
import type { User } from '@/types/auth';

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Resolves to the user, or a marker that a second factor is still required. */
  login: (email: string, password: string, captcha?: CaptchaAnswer) => Promise<LoginResult>;
  register: (
    name: string,
    email: string,
    password: string,
    captcha?: CaptchaAnswer,
  ) => Promise<User>;
  /** Completes a pending 2FA login with a TOTP or backup code. */
  completeTwoFactor: (code: string) => Promise<User>;
  /** Consumes a magic-link token; resolves to the user or a 2FA marker. */
  completeMagicLink: (token: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  /** Applied optimistically after a profile update, without a round trip. */
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  /**
   * Resolved on the server and passed down, so the first client render already knows who the user
   * is. Fetching it in an effect instead would flash a signed-out navbar on every page load.
   */
  initialUser: User | null;
}

export function AuthProvider({ children, initialUser }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  /**
   * Registered once during render rather than in an effect. http.ts calls this when a refresh
   * attempt fails, meaning the session is genuinely gone — clear local state so the UI stops
   * claiming the user is signed in.
   */
  setSessionExpiredHandler(() => setUser(null));

  const login = useCallback(
    async (email: string, password: string, captcha?: CaptchaAnswer): Promise<LoginResult> => {
      setIsLoading(true);
      try {
        const result = await authService.login({ email, password, ...captcha });
        // A 2FA challenge means no session was issued — leave the user signed out and let the form
        // collect a code. Only a real user object updates state.
        if (isTwoFactorRequired(result)) return result;
        setUser(result);
        // Server Components cached the signed-out state; without this the navbar and any
        // server-rendered user data stay stale until a hard reload.
        router.refresh();
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const completeTwoFactor = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        const loggedIn = await authService.twoFactorVerify(code);
        setUser(loggedIn);
        router.refresh();
        return loggedIn;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const completeMagicLink = useCallback(
    async (token: string): Promise<LoginResult> => {
      setIsLoading(true);
      try {
        const result = await authService.magicLinkVerify(token);
        if (isTwoFactorRequired(result)) return result;
        setUser(result);
        router.refresh();
        return result;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, captcha?: CaptchaAnswer) => {
      setIsLoading(true);
      try {
        const created = await authService.register({ name, email, password, ...captcha });
        setUser(created);
        router.refresh();
        return created;
      } finally {
        setIsLoading(false);
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await authService.logout();
    } catch {
      // Even if the call fails the user asked to leave — clear local state regardless.
    } finally {
      setUser(null);
      setIsLoading(false);
      router.push('/');
      router.refresh();
    }
  }, [router]);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await authService.me());
    } catch {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      completeTwoFactor,
      completeMagicLink,
      logout,
      refreshUser,
      setUser,
    }),
    [user, isLoading, login, register, completeTwoFactor, completeMagicLink, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an <AuthProvider>.');
  return context;
}
