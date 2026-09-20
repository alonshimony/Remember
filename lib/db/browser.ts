import { sessionFetch } from "../auth/browser";
import { queryClient, type Operation, type Result } from "./query";
export type User = { id: string; email: string };
type Session = { user: User; access_token: string };
export const configured =
  Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) ||
  process.env.NEXT_PUBLIC_APP_ENV === "e2e";
const listeners = new Set<(event: string, session: Session | null) => void>();
let session: Session | null = null;
const cacheKey = "remember-owner";
function saveSession(value: Session | null) {
  const changed = session?.user.id !== value?.user.id;
  session = value;
  if (typeof localStorage !== "undefined") {
    if (value) localStorage.setItem(cacheKey, JSON.stringify(value.user));
    else localStorage.removeItem(cacheKey);
  }
  if (changed)
    listeners.forEach((callback) => callback("SESSION_CHANGED", session));
}
async function execute(operation: Operation): Promise<Result> {
  try {
    const response = await sessionFetch("/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation),
    });
    const result = await response.json();
    return response.ok
      ? result
      : { data: null, error: { message: result.error || "Request failed" } };
  } catch {
    return {
      data: null,
      error: {
        message: "Could not reach the server. Your local queue is preserved.",
      },
    };
  }
}
export const db = configured
  ? {
      ...queryClient(execute),
      auth: {
        async getUser() {
          const response = await sessionFetch("/api/auth/session", {
            cache: "no-store",
          });
          const result = await response.json();
          if (!response.ok && response.status !== 401)
            throw new Error(result.error || "Could not load workspace");
          saveSession(
            result.user ? { user: result.user, access_token: "cookie" } : null,
          );
          return { data: { user: session?.user ?? null } };
        },
        async getSession() {
          if (
            !session &&
            typeof navigator !== "undefined" &&
            !navigator.onLine
          ) {
            try {
              const user: User = JSON.parse(
                localStorage.getItem(cacheKey) || "null",
              );
              if (
                user &&
                localStorage.getItem(`remember-trusted:${user.id}`) === "yes"
              )
                session = { user, access_token: "cookie" };
            } catch {
              /* Offline hints never authorize server access. */
            }
          }
          return { data: { session } };
        },
        onAuthStateChange(
          callback: (event: string, session: Session | null) => void,
        ) {
          listeners.add(callback);
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  listeners.delete(callback);
                },
              },
            },
          };
        },
        async signOut() {
          const response = await sessionFetch("/api/auth/session", {
            method: "DELETE",
          });
          if (!response.ok)
            throw new Error("Could not sign out. Reconnect and retry.");
          saveSession(null);
          listeners.forEach((callback) => callback("SIGNED_OUT", null));
          location.reload();
        },
      },
    }
  : null;
