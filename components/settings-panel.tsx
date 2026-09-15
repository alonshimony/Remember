"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db/browser";
import type { Profile, Space } from "@/lib/domain/schema";
import type { LocalStore } from "@/lib/offline/store";
import { api, download } from "./remember-app";
export default function SettingsPanel({
  path,
  profile,
  spaces,
  onProfile,
  store,
  enableOffline,
  logout,
}: {
  path: string;
  profile: Profile;
  spaces: Space[];
  onProfile: (p: Profile) => void;
  store: LocalStore | null;
  enableOffline: () => void;
  logout: () => void;
}) {
  const [status, setStatus] = useState("");
  return (
    <>
      <h1>Settings</h1>
      <nav className="settings-nav">
        <Link href="/settings">Preferences</Link>
        <Link href="/settings/integrations">Connections</Link>
        <Link href="/settings/data">Your data</Link>
        <Link href="/settings/health">Health</Link>
      </nav>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      {path === "/settings" && (
        <>
          <form
            className="card stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const timezone = String(form.get("timezone"));
              try {
                new Intl.DateTimeFormat("en", { timeZone: timezone });
              } catch {
                setStatus("Enter a valid IANA timezone.");
                return;
              }
              const patch = {
                display_name: String(form.get("display_name")),
                timezone,
                default_space_id: String(form.get("space")),
                ai_consent: form.get("consent") === "on",
                no_ai_default: form.get("no_ai") === "on",
              };
              const result = await db!
                .from("profiles")
                .update(patch)
                .eq("owner_id", profile.owner_id);
              if (result.error) {
                setStatus(result.error.message);
                return;
              }
              onProfile({ ...profile, ...patch });
              setStatus("Preferences saved");
            }}
          >
            <h2>Make yourself at home</h2>
            <label>
              Display name
              <input
                name="display_name"
                defaultValue={profile.display_name}
                maxLength={100}
              />
            </label>
            <label>
              Timezone
              <input name="timezone" defaultValue={profile.timezone} />
            </label>
            <label>
              Default capture destination
              <select
                name="space"
                defaultValue={profile.default_space_id || spaces[0].id}
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="no_ai"
                defaultChecked={profile.no_ai_default}
              />
              Default new notes to No external AI
            </label>
            <div className="notice">
              Optional cloud AI sends permitted note text to the configured
              model provider for organization and answers. Synced notes remain
              stored in the hosted database even with no AI. Provider retention
              rules still apply; <code>store: false</code> is not a guarantee of
              zero retention.
            </div>
            <label className="check">
              <input
                type="checkbox"
                name="consent"
                defaultChecked={profile.ai_consent}
              />
              I consent to external AI processing of notes whose policy permits
              it.
            </label>
            <button className="primary">Save preferences</button>
          </form>
          <section className="card">
            <h2>This device</h2>
            <p>
              {store
                ? "Trusted-device storage enabled. Plaintext notes may be accessible to someone using this unlocked browser."
                : "Offline storage is not enabled."}
            </p>
            {!store && (
              <button onClick={enableOffline}>
                Enable trusted-device storage
              </button>
            )}
            <p className="hint">
              Browser storage can be cleared or evicted. It is not a backup.
            </p>
            <button onClick={logout}>Sign out</button>
          </section>
          <section className="card">
            <h2>Install on iPhone</h2>
            <p>
              Open your HTTPS app address in Safari, use Share → Add to Home
              Screen, then open Remember from its icon. Initialize your account
              and enable trusted-device storage while online. Use the keyboard’s
              dictation button when entering a note.
            </p>
          </section>
          <PushSettings owner={profile.owner_id} />
        </>
      )}
      {path === "/settings/integrations" && <Integrations spaces={spaces} />}{" "}
      {path === "/settings/data" && <DataSettings />}
      {path === "/settings/health" && <Health />}
    </>
  );
}
function Integrations({ spaces }: { spaces: Space[] }) {
  const [selected, setSelected] = useState<string[]>(
    spaces.filter((s) => s.name === "Work").map((s) => s.id),
  );
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [tokens, setTokens] = useState<
    {
      id: string;
      prefix: string;
      expires_at: string;
      revoked_at: string | null;
    }[]
  >([]);
  async function load() {
    const result = await db!
      .from("integration_tokens")
      .select("id,prefix,expires_at,revoked_at");
    setTokens(result.data || []);
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <section className="card stack">
        <h2>Connect your second brain</h2>
        <p>
          Read-only tokens expose only the selected spaces. Notes marked No
          external AI are excluded. Private Inbox is excluded unless you
          explicitly select it.
        </p>
        {spaces.map((s) => (
          <label className="check" key={s.id}>
            <input
              type="checkbox"
              checked={selected.includes(s.id)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, s.id]
                    : selected.filter((id) => id !== s.id),
                )
              }
            />
            {s.name}
          </label>
        ))}
        <button
          disabled={!selected.length}
          onClick={async () => {
            try {
              const result = await api("/api/integrations", {
                method: "POST",
                body: JSON.stringify({ spaces: selected, days: 90 }),
              });
              setToken(result.token);
              await load();
            } catch (e) {
              setStatus(String(e));
            }
          }}
        >
          Create read-only token · 90 days
        </button>
        {token && (
          <div className="notice">
            <p>
              Shown once. Store this token securely; it will not be included in
              backups.
            </p>
            <code style={{ overflowWrap: "anywhere" }}>{token}</code>
            <button onClick={() => navigator.clipboard.writeText(token)}>
              Copy token
            </button>
            <button onClick={() => setToken("")}>Hide</button>
          </div>
        )}
        {status && <p role="alert">{status}</p>}
      </section>
      {tokens.map((t) => (
        <div key={t.id} className="card row">
          <span>
            {t.prefix}… ·{" "}
            {t.revoked_at ? "Revoked" : `Expires ${t.expires_at.slice(0, 10)}`}
          </span>
          {!t.revoked_at && (
            <button
              onClick={async () => {
                await db!.rpc("revoke_integration", { token_id: t.id });
                await load();
              }}
            >
              Revoke
            </button>
          )}
        </div>
      ))}
      <section className="card">
        <h2>Folder sync & local MCP</h2>
        <p>
          Use the repository’s{" "}
          <code>npm run sync -- --folder PATH --dry-run</code> utility or{" "}
          <code>npm run mcp</code> bridge. Set <code>REMEMBER_URL</code> and{" "}
          <code>REMEMBER_TOKEN</code> in your local environment. See
          docs/INTEGRATIONS.md.
        </p>
        <p className="muted">
          No connection is active until your client is configured.
        </p>
      </section>
    </>
  );
}
function DataSettings() {
  const [status, setStatus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState(false);
  const [trash, setTrash] = useState<
    { id: string; text: string; current_revision: number }[]
  >([]);
  useEffect(() => {
    db!
      .from("memory_view")
      .select("id,text,current_revision")
      .not("deleted_at", "is", null)
      .limit(100)
      .then((r) => setTrash(r.data || []));
  }, []);
  async function restore(confirm = false) {
    if (!file) return;
    setBusy(true);
    const body = new FormData();
    body.set("file", file);
    if (confirm) body.set("confirm", "restore");
    try {
      const result = await api("/api/archive", { method: "POST", body });
      if (confirm) {
        setStatus("Archive restored. Old reminders are pending review.");
        setPreview(null);
      } else setPreview(result.preview);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="card">
        <h2>Take your memories with you</h2>
        <p>
          A private ZIP archive contains canonical JSON, readable Markdown,
          revision history, and attachment bytes. It includes No-external-AI
          notes: keep it somewhere private, and don’t automatically upload it to
          an AI service.
        </p>
        <button
          disabled={busy}
          className="primary"
          onClick={async () => {
            setBusy(true);
            try {
              const session = (await db!.auth.getSession()).data.session;
              const response = await fetch("/api/archive", {
                headers:
                  session?.access_token && session.access_token !== "cookie"
                    ? { Authorization: `Bearer ${session.access_token}` }
                    : {},
              });
              if (!response.ok) throw new Error((await response.json()).error);
              download("remember-backup.zip", await response.blob());
              setStatus(
                "Archive downloaded. Inspect manifest completeness before relying on it.",
              );
            } catch (e) {
              setStatus(String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Download private archive
        </button>
        <p className="hint">
          Interactive limit: 1,000 records per table and 3 MB attachment bytes;
          4 MB ZIP upload/download. Larger exports are reported as unsupported,
          never silently truncated.
        </p>
      </section>
      <section className="card stack">
        <h2>Restore an archive</h2>
        <p>
          Preview first. Restore is currently restricted to the same owner and
          refuses incompatible ID collisions.
        </p>
        <label>
          Remember ZIP archive
          <input
            type="file"
            accept=".zip"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <button disabled={!file || busy} onClick={() => void restore()}>
          Inspect archive
        </button>
        {preview && (
          <>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void restore(true)}
            >
              Confirm restore · reminders inactive
            </button>
          </>
        )}
      </section>
      {status && (
        <div className="notice" role="status">
          {status}
        </div>
      )}
      <section className="card">
        <h2>Trash</h2>
        <p className="muted">
          Deleted memories are excluded from active retrieval and integrations.
        </p>
        {trash.map((m) => (
          <p key={m.id}>
            <Link href={`/memories/${m.id}`}>{m.text.slice(0, 100)} →</Link>
          </p>
        ))}
      </section>
    </>
  );
}
function Health() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api("/api/health")
      .then(setData)
      .catch((e) => setData({ error: String(e) }));
  }, []);
  return (
    <section className="card">
      <h2>System health</h2>
      {data ? (
        Object.entries(data).map(([k, v]) => (
          <p key={k}>
            <strong>{k.replaceAll("_", " ")}:</strong> {String(v)}
          </p>
        ))
      ) : (
        <p role="status">Checking services…</p>
      )}
    </section>
  );
}
function PushSettings({ owner }: { owner: string }) {
  const [status, setStatus] = useState("");
  return (
    <section className="card">
      <h2>Push notifications</h2>
      <p>
        Opt in on this device after installation. Lock-screen notifications
        contain no memory text. Delivery acceptance does not prove that a
        notification was seen.
      </p>
      <button
        onClick={async () => {
          try {
            const settings = await api("/api/push");
            if (!settings.publicKey)
              throw new Error("Push is not configured by the administrator");
            if (!("PushManager" in window))
              throw new Error(
                "This browser does not support push. On iPhone, open the installed home-screen app.",
              );
            const permission = await Notification.requestPermission();
            if (permission !== "granted")
              throw new Error("Notification permission was not granted");
            const registration = await navigator.serviceWorker.ready;
            const sub = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: settings.publicKey,
            });
            const result = await db!
              .from("push_subscriptions")
              .insert({ owner_id: owner, subscription: sub.toJSON() });
            if (result.error) throw result.error;
            setStatus(
              "Subscription saved. A configured server scheduler is required for delivery.",
            );
          } catch (e) {
            setStatus(e instanceof Error ? e.message : "Push setup failed");
          }
        }}
      >
        Enable notifications on this device
      </button>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
