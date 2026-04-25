import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";

/**

* 🔥 CAMBIO CRÍTICO:
* Usar VITE_API_URL en lugar de BASE_URL
  */
  const BASE = import.meta.env.VITE_API_URL?.replace(//$/, "") || "";

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
const headers: Record<string, string> = {
"Content-Type": "application/json",
};

const res = await fetch(`${BASE}${path}`, {   // 🔥 AQUÍ TAMBIÉN SE AJUSTA
credentials: "include",
headers,
...init,
});

const data = await res.json();
if (!res.ok) throw Object.assign(new Error(data.error || `Error ${res.status}`), { code: data.code as string | undefined });
return data;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
const [user, setUser] = useState<AuthUser | null>(null);
const [subscription, setSubscription] = useState<Subscription | null>(null);
const [isLoading, setIsLoading] = useState(true);
const [hasUsers, setHasUsers] = useState(true);

const refreshUser = useCallback(async () => {
try {
const data = await apiFetch("/api/user/me");
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
const bootstrap = await apiFetch("/api/user/bootstrap");
setHasUsers(bootstrap.hasUsers);
} catch {}
await refreshUser();
setIsLoading(false);
})();
}, [refreshUser]);

useEffect(() => {
if (!user) return;
const pendingLogo = localStorage.getItem("hz_pending_logo");
const pendingColor = localStorage.getItem("hz_pending_color");
const pendingWebsite = localStorage.getItem("hz_pending_website");
if (!pendingLogo && !pendingColor && !pendingWebsite) return;

```
apiFetch("/api/brand-profile", {
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
```

}, [user?.id]);

const login = useCallback(async (email: string, password: string) => {
const data = await apiFetch("/api/user/login", {
method: "POST",
body: JSON.stringify({ email, password }),
});

```
if (data.totpRequired) {
  return { totpRequired: true as const, preAuthToken: data.preAuthToken as string };
}

queryClient.clear();
await refreshUser();
return {};
```

}, [refreshUser]);

const register = useCallback(async (email: string, password: string, displayName?: string, affiliateCode?: string, referralCode?: string, selectedPlan?: string, logoUrl?: string, primaryColor?: string) => {
const data = await apiFetch("/api/user/register", {
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

```
setHasUsers(true);
queryClient.clear();
await refreshUser();

return { pendingPlan: data.pendingPlan as string | undefined };
```

}, [refreshUser]);

const logout = useCallback(async () => {
try { await apiFetch("/api/user/logout", { method: "POST" }); } catch {}
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
