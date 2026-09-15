"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { liveQuery } from "dexie";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Check,
  Clock3,
  Feather,
  Lock,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  LogOut,
  RefreshCw,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { db, configured } from "@/lib/db/browser";
import { LocalStore, syncQueue } from "@/lib/offline/store";
import {
  captureInput,
  type Memory,
  type Profile,
  type Space,
} from "@/lib/domain/schema";
import { copyContext } from "@/lib/domain/provenance";
import MemoryDetail from "./memory-detail";
import SettingsPanel from "./settings-panel";
import Upcoming from "./upcoming";

export async function api(path: string, init: RequestInit = {}) {
  const session = (await db!.auth.getSession()).data.session;
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session?.access_token}`,
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
    },
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "Request failed");
  return value;
}
function Brand() {
  return (
    <Link href="/capture" className="brand">
      <span className="brand-mark">r</span>Remember
    </Link>
  );
}
const navigation = [
  { href: "/capture", label: "Capture", icon: Feather },
  { href: "/timeline", label: "Timeline", icon: BookOpen },
  { href: "/ask", label: "Ask", icon: Sparkles },
  { href: "/upcoming", label: "Upcoming", icon: Clock3 },
];
export default function RememberApp() {
  const path = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState("");
  const [store, setStore] = useState<LocalStore | null>(null);
  const [pending, setPending] = useState(0);
  const [tick, setTick] = useState(0);
  const [logout, setLogout] = useState(false);
  const [offline, setOffline] = useState(false);
  const syncing = useRef(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(
    null,
  );
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!db) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        if (navigator.onLine) {
          const { data } = await db!.auth.getUser();
          setUser(data.user);
        } else {
          const { data } = await db!.auth.getSession();
          const cached = data.session?.user;
          if (
            cached &&
            localStorage.getItem(`remember-trusted:${cached.id}`) === "yes"
          )
            setUser(cached);
          else setError("First-time offline use needs online account setup.");
        }
      } finally {
        setLoading(false);
      }
    })();
    const { data } = db.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    setStore(null);
    setProfile(null);
    setSpaces([]);
    if (!user || !db) return;
    let cancelled = false;
    const trusted =
      localStorage.getItem(`remember-trusted:${user.id}`) === "yes";
    if (trusted) {
      const context = localStorage.getItem(`remember-context:${user.id}`);
      if (context) {
        try {
          const cached = JSON.parse(context);
          if (cached.profile.owner_id === user.id) {
            setProfile(cached.profile);
            setSpaces(cached.spaces);
          }
        } catch {
          setError(
            "Device context could not be read. Reconnect to load settings.",
          );
        }
      }
    }
    if (navigator.onLine)
      Promise.all([
        db.from("profiles").select("*").single(),
        db.from("spaces").select("id,name").order("name"),
      ]).then(([p, s]) => {
        if (cancelled) return;
        if (p.error || s.error) {
          setError(
            p.error?.message || s.error?.message || "Unable to load settings",
          );
          return;
        }
        setProfile(p.data);
        setSpaces(s.data || []);
        if (trusted)
          localStorage.setItem(
            `remember-context:${user.id}`,
            JSON.stringify({ profile: p.data, spaces: s.data || [] }),
          );
      });
    if (trusted) {
      const local = new LocalStore(
        user.id,
        process.env.NEXT_PUBLIC_APP_ENV || "development",
      );
      setStore(local);
      return () => {
        cancelled = true;
        local.close();
      };
    }
    return () => {
      cancelled = true;
    };
  }, [user]);
  const sync = useCallback(
    async (force = false) => {
      if (!store || !user || !db || syncing.current) return;
      syncing.current = true;
      try {
        setPending(
          await store.operations.where("state").anyOf("queued", "undo").count(),
        );
        if (!navigator.onLine) return;
        await syncQueue(
          store,
          user.id,
          {
            owner: async () => (await db!.auth.getUser()).data.user?.id ?? null,
            save: async (payload) => {
              const { error } = await db!.rpc("save_capture", { payload });
              if (error) throw new Error(error.message);
            },
            remove: async (payload) => {
              const { data, error } = await db!
                .from("captures")
                .select("current_revision")
                .eq("id", payload.id)
                .single();
              if (error) throw error;
              const res = await db!.rpc("mutate_capture", {
                cid: payload.id,
                expected: data.current_revision,
                trash: true,
              });
              if (res.error) throw res.error;
            },
          },
          force,
        );
        setPending(
          await store.operations.where("state").anyOf("queued", "undo").count(),
        );
        const cachedIds = [
          ...new Set([
            ...(await store.memories.toArray()).map((m) => m.id),
            ...(
              await store.operations.where("state").equals("synced").toArray()
            ).map((m) => m.id),
          ]),
        ];
        for (let offset = 0; offset < cachedIds.length; offset += 100) {
          const ids = cachedIds.slice(offset, offset + 100);
          const result = await db!
            .from("memory_view")
            .select("*")
            .in("id", ids)
            .is("deleted_at", null);
          if (result.error) break;
          const active = new Set((result.data || []).map((m) => m.id));
          await store.memories.bulkPut(result.data || []);
          for (const id of ids)
            if (!active.has(id)) {
              await store.memories.delete(id);
              const operation = await store.operations.get(id);
              if (operation?.state === "synced")
                await store.operations.delete(id);
            }
        }
        refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sync unavailable");
      } finally {
        syncing.current = false;
      }
    },
    [store, user, refresh],
  );
  useEffect(() => {
    if (!store) return;
    const update = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) void sync();
    };
    update();
    const foreground = () => {
      if (document.visibilityState === "visible") update();
    };
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    document.addEventListener("visibilitychange", foreground);
    const retry = setInterval(update, 30000);
    return () => {
      clearInterval(retry);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [store, sync]);
  useEffect(() => {
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          if (registration.waiting) setWaitingWorker(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setWaitingWorker(worker);
            });
          });
        })
        .catch(() =>
          setError(
            "Offline app shell could not be installed. Online capture remains available.",
          ),
        );
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const offset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      document.documentElement.style.setProperty(
        "--keyboard-offset",
        `${offset}px`,
      );
      document.body.classList.toggle("keyboard-open", offset > 100);
    };
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  async function enableOffline() {
    if (!user) return;
    try {
      const local = new LocalStore(
        user.id,
        process.env.NEXT_PUBLIC_APP_ENV || "development",
      );
      await local.open();
      localStorage.setItem(`remember-trusted:${user.id}`, "yes");
      localStorage.setItem(
        `remember-context:${user.id}`,
        JSON.stringify({ profile, spaces }),
      );
      setStore(local);
      await navigator.storage?.persist?.();
    } catch {
      setError(
        "Device storage unavailable. Your text will stay in the editor until server confirmation.",
      );
    }
  }
  async function finishLogout(discard = false) {
    if (!db) return;
    const count =
      (store
        ? await store.operations.where("state").anyOf("queued", "undo").count()
        : 0) +
      (store && (await store.drafts.get("capture"))?.text.trim() ? 1 : 0);
    setPending(count);
    if (count && !discard) {
      setLogout(true);
      return;
    }
    if (store) {
      await store.delete();
      setStore(null);
    }
    if (user) {
      localStorage.removeItem(`remember-trusted:${user.id}`);
      localStorage.removeItem(`remember-context:${user.id}`);
    }
    await db.auth.signOut();
    setProfile(null);
    setSpaces([]);
    setLogout(false);
  }
  if (loading)
    return (
      <div className="auth">
        <Brand />
        <p role="status">Opening your memories…</p>
      </div>
    );
  if (!configured)
    return (
      <div className="auth">
        <Brand />
        <h1>A place for what matters.</h1>
        <p className="muted">
          Your private memory timeline is ready to connect.
        </p>
        <div className="notice">
          <strong>Database setup needed</strong>
          <p>
            Configure the Supabase URL and public key in <code>.env.local</code>
            , apply the migrations, and provision an invited owner. The README
            has the exact steps.
          </p>
          No external AI is required.
        </div>
        <p className="hint">
          <ShieldCheck size={18} /> No notes have been saved or sent anywhere.
        </p>
      </div>
    );
  if (!user)
    return (
      <>
        <Login />
        {error && (
          <p className="auth notice" role="alert">
            {error}
          </p>
        )}
      </>
    );
  const active = path === "/" ? "/capture" : path;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Main navigation">
          {navigation.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={active === n.href ? "active" : ""}
            >
              <n.icon size={19} />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>
            <Lock size={13} style={{ display: "inline" }} /> Your space. Your
            memories.
          </p>
          <nav className="nav">
            <Link href="/settings">
              <Settings size={18} />
              Settings
            </Link>
            <button className="quiet" onClick={() => void finishLogout()}>
              <LogOut size={17} /> Sign out
            </button>
          </nav>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            <span className="status-dot" />
            {offline
              ? "Offline · device storage"
              : pending
                ? `${pending} waiting to sync`
                : "Your private workspace"}
          </span>
          <Link href="/settings" aria-label="Settings" className="row">
            <span className="desktop-label">
              {profile?.display_name || "Remember"}
            </span>
            <Settings size={18} />
          </Link>
        </header>
        {error && (
          <div role="alert" className="notice error">
            {error}
            <button className="quiet" onClick={() => setError("")}>
              Dismiss
            </button>
          </div>
        )}
        {pending > 0 && (
          <div className="notice row">
            {pending} notes waiting to sync
            <button onClick={() => void sync(true)}>
              <RefreshCw size={14} />
              Retry sync
            </button>
          </div>
        )}
        {waitingWorker && (
          <div className="notice row">
            <span>An app update is ready.</span>
            <button
              onClick={async () => {
                const unsaved = (
                  document.querySelector(
                    ".editor",
                  ) as HTMLTextAreaElement | null
                )?.value.trim();
                const queued = store
                  ? await store.operations
                      .where("state")
                      .anyOf("queued", "undo")
                      .count()
                  : 0;
                if (unsaved || queued) {
                  setError(
                    "Save your draft and sync queued notes before applying the update.",
                  );
                  return;
                }
                navigator.serviceWorker.addEventListener(
                  "controllerchange",
                  () => location.reload(),
                  { once: true },
                );
                waitingWorker.postMessage("APPLY_UPDATE");
              }}
            >
              Apply update
            </button>
          </div>
        )}
        {profile && spaces.length > 0 ? (
          <>
            {active === "/capture" && (
              <Capture
                profile={profile}
                spaces={spaces}
                store={store}
                enableOffline={enableOffline}
                onSaved={() => {
                  refresh();
                  void sync();
                }}
              />
            )}
            {active === "/timeline" && (
              <Timeline spaces={spaces} tick={tick} store={store} />
            )}{" "}
            {active === "/ask" && <Ask />}
            {active === "/upcoming" && (
              <Upcoming
                owner={user.id}
                timezone={profile.timezone}
                spaces={spaces}
              />
            )}{" "}
            {active.startsWith("/memories/") && (
              <MemoryDetail
                id={active.split("/")[2]}
                spaces={spaces}
                owner={user.id}
                store={store}
              />
            )}{" "}
            {active.startsWith("/entities/") && (
              <EntityPage id={active.split("/")[2]} />
            )}{" "}
            {active.startsWith("/settings") && (
              <SettingsPanel
                path={active}
                profile={profile}
                spaces={spaces}
                onProfile={setProfile}
                store={store}
                enableOffline={enableOffline}
                logout={() => void finishLogout()}
              />
            )}
          </>
        ) : (
          <p role="status">Loading your private workspace…</p>
        )}
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {navigation.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={active === n.href ? "active" : ""}
          >
            <n.icon size={21} />
            {n.label}
          </Link>
        ))}
      </nav>
      {logout && (
        <dialog open aria-label="Unsynced notes">
          <h2>{pending} notes are only on this device</h2>
          <p>
            Sync or export them before signing out, or explicitly discard the
            local copies.
          </p>
          <div className="row">
            <button onClick={() => void sync(true)}>Sync now</button>
            <button
              onClick={async () => {
                download(
                  "remember-pending.json",
                  JSON.stringify(await store?.operations.toArray(), null, 2),
                );
              }}
            >
              Export local notes
            </button>
            <button className="danger" onClick={() => void finishLogout(true)}>
              Discard and sign out
            </button>
            <button onClick={() => setLogout(false)}>Stay signed in</button>
          </div>
        </dialog>
      )}
    </div>
  );
}
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="auth">
      <Brand />
      <p className="eyebrow">A little less to hold in your head</p>
      <h1>Welcome back.</h1>
      <p className="muted">
        Your notes, conversations, and things to remember. All in one quiet
        place.
      </p>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const result = await db!.auth.signInWithPassword({ email, password });
          setError(result.error?.message || "");
          setBusy(false);
        }}
      >
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
      <p className="hint">
        <Lock size={16} /> Invitation only. Account access is provisioned by
        your administrator.
      </p>
    </main>
  );
}
function Capture({
  profile,
  spaces,
  store,
  enableOffline,
  onSaved,
}: {
  profile: Profile;
  spaces: Space[];
  store: LocalStore | null;
  enableOffline: () => void;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [space, setSpace] = useState(profile.default_space_id || spaces[0].id);
  const [date, setDate] = useState("");
  const [noAI, setNoAI] = useState(profile.no_ai_default);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const [savedPayload, setSavedPayload] = useState<ReturnType<
    typeof captureInput.parse
  > | null>(null);
  const [draftReady, setDraftReady] = useState(!store);
  const lock = useRef(false);
  const operation = useRef<{ text: string; id: string } | null>(null);
  useEffect(() => {
    if (!store || !last) return;
    const subscription = liveQuery(() => store.operations.get(last)).subscribe(
      (row) => {
        if (row?.state === "synced" && !text) setStatus("Synced");
        if (row?.error && !text)
          setStatus(`Saved on this device — ${row.error}`);
      },
    );
    return () => subscription.unsubscribe();
  }, [store, last, text]);
  useEffect(() => {
    if (store)
      store.drafts
        .get("capture")
        .then((d) => {
          if (d) setText(d.text);
          setDraftReady(true);
        })
        .catch(() => setStatus("Draft storage could not be read."));
  }, [store]);
  useEffect(() => {
    if (!store || !draftReady) return;
    const timer = setTimeout(() => {
      void store
        .draft(text)
        .then(() => {
          if (text) setStatus("Draft on this device");
        })
        .catch(() =>
          setStatus("Device storage failed. Keep this text or copy it."),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [text, store, draftReady]);
  async function save() {
    if (lock.current || !text.trim()) return;
    lock.current = true;
    setBusy(true);
    try {
      if (!operation.current || operation.current.text !== text)
        operation.current = { text, id: crypto.randomUUID() };
      const payload = captureInput.parse({
        id: operation.current.id,
        space_id: space,
        text,
        captured_at:
          savedPayload?.id === operation.current.id
            ? savedPayload.captured_at
            : new Date().toISOString(),
        timezone: profile.timezone,
        occurred_on: date || null,
        no_ai: noAI,
      });
      setSavedPayload(payload);
      if (store) {
        await store.save(payload);
        setStatus("Saved on this device — waiting to sync");
      } else {
        if (!navigator.onLine)
          throw new Error(
            "Offline capture needs trusted-device setup. Your text is still here.",
          );
        const { error } = await db!.rpc("save_capture", { payload });
        if (error) throw new Error(error.message);
        setStatus("Synced");
      }
      setLast(payload.id);
      setText("");
      operation.current = null;
      onSaved();
    } catch (e) {
      setStatus(
        e instanceof Error
          ? e.message
          : "Save failed. Your text is still here.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Make room for the moment</p>
        <h1>What would you like to remember?</h1>
        <p>A conversation, a thought, a promise. Start wherever you are.</p>
      </section>
      <section className="capture-card">
        <div className="capture-top">
          <select
            aria-label="Capture destination"
            className="chip"
            value={space}
            onChange={(e) => setSpace(e.target.value)}
          >
            {spaces.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="muted row" style={{ fontSize: 12 }}>
            <Lock size={13} />
            Only you
          </span>
        </div>
        <textarea
          aria-label="What happened, or what do you need to remember?"
          dir="auto"
          className="editor"
          placeholder="What happened, or what do you need to remember?"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus("Editing…");
          }}
        />
        <div className="capture-options">
          <label className="check">
            <input
              type="checkbox"
              checked={noAI}
              onChange={(e) => setNoAI(e.target.checked)}
            />
            No external AI
          </label>
          <label className="row muted" style={{ fontSize: 12 }}>
            Occurrence date
            <input
              type="date"
              aria-label="Occurrence date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ fontSize: 13 }}
            />
          </label>
        </div>
        <div className="capture-footer">
          <small>
            {text.length
              ? `${text.length.toLocaleString()} characters`
              : "No need to get the words just right."}
          </small>
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={() => void save()}
          >
            {busy ? (
              "Saving…"
            ) : (
              <>
                <Check size={17} />
                Save
              </>
            )}
          </button>
        </div>
      </section>
      {!store && (
        <div className="device-setup">
          <button className="quiet" onClick={enableOffline}>
            Enable on this device
          </button>
          <small>
            Autosaved drafts & offline capture. Stores plaintext on this trusted
            device.
          </small>
        </div>
      )}
      <p className="hint">
        <ShieldCheck size={16} />
        {noAI
          ? "This note won’t be sent to an external AI. Synced notes are stored in your private database."
          : "AI processing requires account consent and a configured provider."}
      </p>
      <div role="status" aria-live="polite">
        {status && (
          <div className="notice row">
            <span>{status}</span>
            {last && (
              <>
                <Link className="button quiet" href={`/memories/${last}`}>
                  Open <ArrowUpRight size={14} />
                </Link>
                <button
                  className="quiet"
                  onClick={async () => {
                    if (store) {
                      await store.operations.update(last, {
                        state: "undo",
                        nextAttempt: 0,
                      });
                      onSaved();
                    } else {
                      const { data } = await db!
                        .from("captures")
                        .select("current_revision")
                        .eq("id", last)
                        .single();
                      const { error } = await db!.rpc("mutate_capture", {
                        cid: last,
                        expected: data?.current_revision,
                        trash: true,
                      });
                      if (error) {
                        setStatus(error.message);
                        return;
                      }
                    }
                    setLast(null);
                    setStatus("Undo requested");
                  }}
                >
                  Undo
                </button>
              </>
            )}
            {text && (
              <button
                className="quiet"
                onClick={() => navigator.clipboard.writeText(text)}
              >
                Copy text
              </button>
            )}
          </div>
        )}
      </div>
      <section className="recent">
        <div className="section-title">
          <h2>A moment to come back to</h2>
          <Link href="/timeline">View timeline →</Link>
        </div>
        <div className="empty">
          <BookOpen size={22} style={{ margin: "0 auto 12px" }} />
          <p>Your memories will be here when you need them.</p>
          <small>Capture now. Connect the dots later.</small>
        </div>
      </section>
    </>
  );
}
export function MemoryCard({
  memory,
  spaces = [],
}: {
  memory: Memory;
  spaces?: Space[];
}) {
  return (
    <Link href={`/memories/${memory.id}`} className="card memory">
      <div className="memory-meta">
        <span>
          {memory.occurred_on ||
            new Date(memory.captured_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          {!memory.occurred_on ? " · recorded" : ""}
        </span>
        <span>{spaces.find((s) => s.id === memory.space_id)?.name}</span>
        <span>
          {memory.no_ai ? "Not sent to AI" : memory.processing_status}
        </span>
      </div>
      <p className="preview" dir="auto">
        {memory.text}
      </p>
    </Link>
  );
}
function Timeline({
  spaces,
  tick,
  store,
}: {
  spaces: Space[];
  tick: number;
  store: LocalStore | null;
}) {
  const [rows, setRows] = useState<Memory[]>([]);
  const [q, setQ] = useState("");
  const [space, setSpace] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(Memory | null)[]>([null]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const cursor = page === 0 ? null : cursors[page];
      const { data, error } = await db!.rpc("timeline_page", {
        before_time: cursor?.captured_at || null,
        before_id: cursor?.id || null,
        before_day: cursor
          ? cursor.occurred_on ||
            new Intl.DateTimeFormat("en-CA", {
              timeZone: cursor.timezone,
            }).format(new Date(cursor.captured_at))
          : null,
        filter_space: space || null,
        query_text: q,
        date_from: from || null,
        date_to: to || null,
      });
      if (cancelled) return;
      if (error) {
        setError(
          "Could not load synced memories. Showing this device’s saved captures.",
        );
        if (store) {
          const local = await store.operations.toArray();
          const cached = await store.memories.toArray();
          const pendingLocal = local
            .filter((x) => x.state !== "undo")
            .map((x) => ({
              ...x.payload,
              owner_id: "",
              current_revision: 1,
              received_at: x.payload.captured_at,
              deleted_at: null,
              processing_status:
                x.state === "synced" ? "Synced" : "Waiting to sync",
            }));
          const combined = new Map(
            [...pendingLocal, ...cached].map((m) => [m.id, m]),
          );
          setRows(
            [...combined.values()]
              .filter(
                (m) =>
                  (!space || m.space_id === space) &&
                  (!q ||
                    m.text.toLocaleLowerCase().includes(q.toLocaleLowerCase())),
              )
              .slice(0, 30),
          );
        }
      } else {
        setRows(data || []);
        if (store && data?.length) await store.memories.bulkPut(data);
        setMore(data?.length === 30);
        setError("");
      }
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, space, from, to, page, tick, store, cursors]);
  return (
    <>
      <div className="intro">
        <p className="eyebrow">Your life, remembered</p>
        <h1>Timeline</h1>
        <p>The moments and details you chose to keep.</p>
      </div>
      <div className="filters">
        <input
          aria-label="Search memories"
          placeholder="Search your memories…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
        />
        <select
          aria-label="Filter by space"
          value={space}
          onChange={(e) => {
            setSpace(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All spaces</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Recorded from"
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(0);
          }}
        />
        <input
          aria-label="Recorded until"
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(0);
          }}
        />
      </div>
      <p className="hint">
        Keyword search · occurrence dates, with recorded date as fallback
      </p>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">Loading memories…</p>
      ) : rows.length ? (
        rows.map((m) => <MemoryCard key={m.id} memory={m} spaces={spaces} />)
      ) : (
        <div className="empty">
          <Search size={24} style={{ margin: "auto" }} />
          <p>No memories found.</p>
          <Link className="button primary" href="/capture">
            Capture a memory
          </Link>
        </div>
      )}
      <div className="row">
        {page > 0 && (
          <button onClick={() => setPage((p) => p - 1)}>Previous</button>
        )}
        {more && (
          <button
            onClick={() => {
              setCursors((c) => [...c.slice(0, page + 1), rows.at(-1) || null]);
              setPage((p) => p + 1);
            }}
          >
            Next page
          </button>
        )}
        {rows.length > 0 && (
          <button
            onClick={() => navigator.clipboard.writeText(copyContext(rows))}
          >
            Copy this page for AI
          </button>
        )}
      </div>
    </>
  );
}
function Ask() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{
    mode: string;
    message: string;
    sources: Memory[];
    statements?: { text: string; source_id: string; quote: string }[];
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className="intro">
        <p className="eyebrow">Connect the dots</p>
        <h1>Ask your memories.</h1>
        <p>Start with a person, a promise, or something on your mind.</p>
      </section>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setResult(
              await api("/api/ask", {
                method: "POST",
                body: JSON.stringify({ question: q }),
              }),
            );
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Unable to retrieve memories",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your question
          <textarea
            dir="auto"
            placeholder="What did I promise Maya?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            required
            maxLength={2000}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Looking through your memories…" : "Find in my memories"}
        </button>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section style={{ marginTop: 30 }}>
          <div className="notice">{result.message}</div>
          {result.statements?.map((s, i) => (
            <div key={i} className="card">
              <p dir="auto">{s.text}</p>
              <Link href={`/memories/${s.source_id}`}>
                Source: <bdi>{s.quote}</bdi> →
              </Link>
            </div>
          ))}
          {result.sources.map((m) => (
            <MemoryCard key={m.id} memory={m} />
          ))}
        </section>
      )}
      <p className="hint">
        <Lock size={15} />
        Answers use your permitted sources. No-external-AI notes are never sent
        to the model.
      </p>
    </>
  );
}
function EntityPage({ id }: { id: string }) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Memory[]>([]);
  useEffect(() => {
    void (async () => {
      const entity = await db!
        .from("entities")
        .select("name")
        .eq("id", id)
        .single();
      setName(entity.data?.name || "Entity unavailable");
      const links = await db!
        .from("entity_links")
        .select("capture_id")
        .eq("entity_id", id);
      if (links.data?.length) {
        const result = await db!
          .from("memory_view")
          .select("*")
          .in(
            "id",
            links.data.map((x) => x.capture_id),
          )
          .is("deleted_at", null)
          .limit(50);
        setRows(result.data || []);
      }
    })();
  }, [id]);
  return (
    <>
      <h1>{name}</h1>
      <p className="muted">Source-linked history · up to 50 memories</p>
      <button onClick={() => navigator.clipboard.writeText(copyContext(rows))}>
        Copy briefing for AI
      </button>
      <div style={{ marginTop: 20 }}>
        {rows.map((m) => (
          <MemoryCard key={m.id} memory={m} />
        ))}
      </div>
    </>
  );
}
export function download(name: string, body: string | Blob) {
  const url = URL.createObjectURL(
    typeof body === "string"
      ? new Blob([body], { type: "application/json" })
      : body,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
