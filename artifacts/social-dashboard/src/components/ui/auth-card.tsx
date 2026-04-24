import { BRAND } from "@/config/brand";

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl p-6 space-y-4 bg-card"
      style={{
        border: "1px solid rgba(0,194,255,0.22)",
        boxShadow: "0 18px 60px rgba(0,0,0,0.35), 0 0 32px rgba(0,194,255,0.06)",
      }}
    >
      {children}
    </div>
  );
}
