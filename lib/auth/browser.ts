type RefreshSession = (fresh: boolean) => Promise<string | null>;
let refreshSession: RefreshSession | undefined;
let ready: (() => void) | undefined;
const sessionReady = new Promise<void>((resolve) => {
  ready = resolve;
});
export function registerSessionRefresh(refresh: RefreshSession) {
  refreshSession = refresh;
  ready?.();
}
// Clerk owns the persistent session. Short-lived bearer tokens stay in memory only.
export async function sessionFetch(path: string, init: RequestInit = {}) {
  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && !refreshSession) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        sessionReady,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Sign-in is still loading. Your text is preserved; please retry.",
                ),
              ),
            15000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  const send = async (fresh: boolean) => {
    const headers = new Headers(init.headers);
    const token = await refreshSession?.(fresh);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };
  const response = await send(false);
  return response.status === 401 && refreshSession ? send(true) : response;
}
