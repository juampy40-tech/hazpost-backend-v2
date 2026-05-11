import { createContext, useContext, useEffect, useState, useCallback } from "react";

const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

type BusinessItem = {
  id: number;
  name: string;
  isDefault: boolean;
  industry?: string | null;
};

export interface ActiveBusiness {
  id: number | undefined;
  name: string | undefined;
  industry: string | null | undefined;
  total: number;
  loaded: boolean;
  list: BusinessItem[];
  switchBusiness: (id: number) => Promise<void>;
}

const ActiveBusinessContext = createContext<ActiveBusiness>({
  id: undefined,
  name: undefined,
  industry: undefined,
  total: 0,
  loaded: false,
  list: [],
  switchBusiness: async () => {},
});

export function ActiveBusinessProvider({ children }: { children: React.ReactNode }) {
  const [business, setBusiness] = useState<Omit<ActiveBusiness, "switchBusiness">>({
    id: undefined,
    name: undefined,
    industry: undefined,
    total: 0,
    loaded: false,
    list: [],
  });

  const loadBusinesses = useCallback(() => {
    fetch(`${BASE}/api/businesses`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) {
          setBusiness({
            id: undefined,
            name: undefined,
            industry: undefined,
            total: 0,
            loaded: true,
            list: [],
          });
          return;
        }
        const list: BusinessItem[] = d.businesses ?? [];
        const active = list.find(b => b.isDefault === true);

        if (active) {
          setBusiness({
            id: active.id,
            name: active.name,
            industry: active.industry ?? null,
            total: list.length,
            loaded: true,
            list,
          });
        } else {
          setBusiness({
            id: undefined,
            name: undefined,
            industry: undefined,
            total: list.length,
            loaded: true,
            list,
          });
        }
      })
      .catch(() => {
        setBusiness({
          id: undefined,
          name: undefined,
          industry: undefined,
          total: 0,
          loaded: true,
          list: [],
        });
      });
  }, []);

  useEffect(() => {
    loadBusinesses();
  }, [loadBusinesses]);

  const switchBusiness = useCallback(async (id: number) => {
    await fetch(`${BASE}/api/businesses/${id}/set-active`, {
      method: "POST",
      credentials: "include",
    });
    loadBusinesses();
  }, [loadBusinesses]);

  return (
    <ActiveBusinessContext.Provider value={{ ...business, switchBusiness }}>
      {children}
    </ActiveBusinessContext.Provider>
  );
}

export function useActiveBusiness(): ActiveBusiness {
  return useContext(ActiveBusinessContext);
}
