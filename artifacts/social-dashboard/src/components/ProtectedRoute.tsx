import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  adminOnly?: boolean;
  adminRedirectTo?: string;
}

export function ProtectedRoute({ children, adminOnly = false, adminRedirectTo = "/dashboard" }: Props) {
  const { isAuthenticated, isLoading, user, hasUsers } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!hasUsers) {
      navigate("/register");
      return;
    }
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    if (adminOnly && user?.role !== "admin") {
      navigate(adminRedirectTo);
      return;
    }
  }, [isLoading, isAuthenticated, hasUsers, adminOnly, adminRedirectTo, user, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  if (adminOnly && user?.role !== "admin") return null;

  return <>{children}</>;
}
