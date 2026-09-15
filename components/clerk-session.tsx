"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { db } from "@/lib/db/browser";
export default function ClerkSession() {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (!isLoaded || !navigator.onLine) return;
    void db?.auth
      .getUser()
      .catch((error) =>
        window.dispatchEvent(
          new CustomEvent("remember-auth-error", { detail: error.message }),
        ),
      );
  }, [isLoaded, userId]);
  return null;
}
