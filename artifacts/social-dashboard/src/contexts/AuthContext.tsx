import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

/**
 * API base seguro:
 * - En Vercel puedes poner VITE_API_URL con o sin /api.
 * - Este código normaliza y evita errores tipo /api/api o /login suelto.
 */
const RAW_API_BASE_URL = (import.meta.env.VITE_API_URL || "https://v2.hazpost.com").replace(/\/$/, "");
const API_ROOT = RAW_API_BASE_URL.endsWith("/api")
  ? RAW_API_BASE_URL
  : `${RAW_API_BASE_URL}/api`;

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  plan: string;
  aiCredits: number;
  onboardingStep: number;
  emailVerified: boolean;
  avatarUrl?: string | null;
  /** IANA timezone string resuelto por el servidor (ej: "Pacific/Auckland"). Nunca null. */
  timezone: string;
}

export interface Subscription {
  id: number;
  userId: number;
  plan: string;
  status: string;
  creditsRemaining: number;
  creditsTotal: number;
  periodEnd: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  subscription: Subscription | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasUsers: boolean;
  login: (email: string, password: string) => Promise<{ totpRequired?: boolean; preAuthToken?: string }>;
  register: (email: string, password: string, displayName?: string, affiliateCode?: string, referralCode?: string, selectedPlan?: string, logoUrl?: string, primaryColor?: string) => Promise<{ pendingPlan?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

async function apiFetch(path: string, init?: RequestInit) {
  const safePath = path.startsWith("/") ? path : `/${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string> | undefined),
  };

  const res = await fetch(`${API_ROOT}${safePath}`, {
    credentials: "include",
    ...init,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json()
    : { error: await res.text() };

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error || `Error ${res.status}`),
      { code: data.code as string | undefined }
    );
  }

  return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUsers, setHasUsers] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const data = await apiFetch("/user/me");
      setUser(data.user);
      setSubscription(data.subscription);
    } catch {
      setUser(null);
      setSubscription(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const bootstrap = await apiFetch("/user/bootstrap");
        setHasUsers(bootstrap.hasUsers);
      } catch {}
      await refreshUser();
      setIsLoading(false);
    })();
  }, [refreshUser]);

  // Flush any brand data saved to localStorage before a Google OAuth redirect.
  // Keys are removed ONLY after a successful API write to avoid silent data loss.
  useEffect(() => {
    if (!user) return;
    const pendingLogo = localStorage.getItem("hz_pending_logo");
    const pendingColor = localStorage.getItem("hz_pending_color");
    const pendingWebsite = localStorage.getItem("hz_pending_website");
    if (!pendingLogo && !pendingColor && !pendingWebsite) return;
    apiFetch("/brand-profile", {
      method: "PUT",
      body: JSON.stringify({
        ...(pendingLogo ? { logoUrl: pendingLogo } : {}),
        ...(pendingColor ? { primaryColor: pendingColor } : {}),
        ...(pendingWebsite ? { website: pendingWebsite } : {}),
      }),
    }).then(() => {
      localStorage.removeItem("hz_pending_logo");
      localStorage.removeItem("hz_pending_color");
      localStorage.removeItem("hz_pending_website");
    }).catch(() => {});
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch("/user/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (data.totpRequired) {
      // TOTP required — don't refresh user yet; caller handles the 2FA step
      return { totpRequired: true as const, preAuthToken: data.preAuthToken as string };
    }
    // Clear ALL cached queries before loading the new user's data.
    // This prevents stale data from a previous user session from bleeding
    // into the newly logged-in user's view (data isolation between users).
    queryClient.clear();
    await refreshUser();
    return {};
  }, [refreshUser]);

  const register = useCallback(async (email: string, password: string, displayName?: string, affiliateCode?: string, referralCode?: string, selectedPlan?: string, logoUrl?: string, primaryColor?: string) => {
    const data = await apiFetch("/user/register", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        displayName,
        affiliateCode: affiliateCode?.trim().toUpperCase() || undefined,
        referralCode: referralCode?.trim().toUpperCase() || undefined,
        selectedPlan: selectedPlan && selectedPlan !== "free" ? selectedPlan : undefined,
        logoUrl: logoUrl?.trim() || undefined,
        primaryColor: primaryColor?.trim() || undefined,
      }),
    });
    setHasUsers(true);
    // Clear cache so the new user starts with a clean slate, not another
    // user's cached queries.
    queryClient.clear();
    await refreshUser();
    return { pendingPlan: data.pendingPlan as string | undefined };
  }, [refreshUser]);

  const logout = useCallback(async () => {
    try { await apiFetch("/user/logout", { method: "POST" }); } catch {}
    // Clear the query cache on logout so the next user who logs in does not
    // see data that was loaded during this session.
    queryClient.clear();
    setUser(null);
    setSubscription(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, subscription, isLoading, hasUsers,
      isAuthenticated: !!user,
      login, register, logout, refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
