import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";

export function PrimaryButton({ children, ...props }: any) {
  return (
    <Button
      {...props}
      className="w-full h-11 font-bold text-black hover:opacity-90"
      style={{
        background: BRAND.primary,
        boxShadow: "0 0 22px rgba(0,194,255,0.28)",
      }}
    >
      {children}
    </Button>
  );
}
