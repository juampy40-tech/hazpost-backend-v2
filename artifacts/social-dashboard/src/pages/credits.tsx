import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Credits() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/billing");
  }, [setLocation]);
  return null;
}
