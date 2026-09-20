"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { registerSessionRefresh } from "@/lib/auth/browser";
import { db } from "@/lib/db/browser";
export default function ClerkSession() {
  const { isLoaded, userId, getToken } = useAuth();
  useEffect(() => {
    if (!isLoaded) return;
    registerSessionRefresh((fresh) => getToken({ skipCache: fresh }));
    const refresh = () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      void db?.auth
        .getUser()
        .catch((error) =>
          window.dispatchEvent(
            new CustomEvent("remember-auth-error", { detail: error.message }),
          ),
        );
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [isLoaded, userId, getToken]);
  return null;
}
