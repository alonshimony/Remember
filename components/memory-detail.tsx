"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/db/browser";
import type { Memory, Space } from "@/lib/domain/schema";
import { copyContext } from "@/lib/domain/provenance";
import { api, download } from "./remember-app";
import type { LocalStore } from "@/lib/offline/store";
export default function MemoryDetail({
  id,
  spaces,
  owner,
  store,
}: {
  id: string;
  spaces: Space[];
  owner: string;
  store: LocalStore | null;
}) {
  const [m, setM] = useState<Memory | null>(null);
  const [revisions, setRevisions] = useState<
    { id: string; number: number; text: string; created_at: string }[]
  >([]);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState("");
  const [attachments, setAttachments] = useState<
    { id: string; name: string; state: string }[]
  >([]);
  const [events, setEvents] = useState<
    { id: string; title: string; state: string; review_status: string }[]
  >([]);
  const [links, setLinks] = useState<{ entity_id: string }[]>([]);
  async function load() {
    const result = await db!
      .from("memory_view")
      .select("*")
      .eq("id", id)
      .single();
    if (result.error) {
      setStatus("This memory is not available to your account.");
      return;
    }
    setM(result.data);
    setText(result.data.text);
    const [r, a, e, l] = await Promise.all([
      db!
        .from("revisions")
        .select("id,number,text,created_at")
        .eq("capture_id", id)
        .order("number", { ascending: false }),
      db!.from("attachments").select("id,name,state").eq("capture_id", id),
      db!
        .from("events")
        .select("id,title,state,review_status")
        .eq("capture_id", id),
      db!.from("entity_links").select("entity_id").eq("capture_id", id),
    ]);
    setRevisions(r.data || []);
    setAttachments(a.data || []);
    setEvents(e.data || []);
    setLinks(l.data || []);
  }
  useEffect(() => {
    void load(); /* This component is keyed by the route ID. */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  async function mutate(args: Record<string, unknown>) {
    if (!m) return;
    const { error } = await db!.rpc("mutate_capture", {
      cid: id,
      expected: m.current_revision,
      ...args,
    });
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Changes synced");
    if (store) {
      await store.memories.delete(id);
      await store.operations.delete(id);
    }
    setEditing(false);
    await load();
  }
  return (
    <>
      {status && (
        <p role="status" className="notice">
          {status}
        </p>
      )}
      {m && (
        <>
          <p className="eyebrow">
            {spaces.find((s) => s.id === m.space_id)?.name} · User recap
          </p>
          <h1>Your memory</h1>
          <div className="memory-meta">
            <span>Recorded {new Date(m.captured_at).toLocaleString()}</span>
            <span>{m.timezone}</span>
            <span>
              {m.occurred_on
                ? `Occurred ${m.occurred_on}`
                : "Occurrence unknown"}
            </span>
          </div>
          {m.deleted_at && (
            <div className="notice">
              In Trash. Integrations and AI cannot retrieve this memory.
            </div>
          )}
          <section className="card" style={{ marginTop: 25 }}>
            {editing ? (
              <label>
                Correct the original
                <textarea
                  dir="auto"
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
            ) : (
              <p className="original" dir="auto">
                {m.text}
              </p>
            )}
            <div className="row" style={{ marginTop: 20 }}>
              {editing ? (
                <>
                  <button
                    className="primary"
                    onClick={() => void mutate({ new_text: text })}
                  >
                    Save new revision
                  </button>
                  <button onClick={() => setEditing(false)}>Cancel</button>
                </>
              ) : (
                <button onClick={() => setEditing(true)}>Correct note</button>
              )}
              <button
                onClick={() => {
                  navigator.clipboard.writeText(copyContext([m]));
                  setStatus(
                    m.no_ai
                      ? "Excluded from AI context by this note’s policy."
                      : "Source context copied",
                  );
                }}
              >
                Copy for AI
              </button>
              <button
                onClick={() =>
                  download(
                    `memory-${id}.md`,
                    new Blob(
                      [
                        `# Remember\nSource: ${id}\nRecorded: ${m.captured_at}\nNo external AI: ${m.no_ai}\n\n${m.text}`,
                      ],
                      { type: "text/markdown" },
                    ),
                  )
                }
              >
                Download Markdown
              </button>
            </div>
          </section>
          <div className="row">
            <label>
              Destination
              <select
                value={m.space_id}
                onChange={async (e) => {
                  const result = await db!.rpc("move_capture", {
                    cid: id,
                    destination: e.target.value,
                  });
                  setStatus(
                    result.error?.message ||
                      "Memory moved; integration access has been recalculated.",
                  );
                  await load();
                }}
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
                checked={m.no_ai}
                onChange={(e) => void mutate({ policy: e.target.checked })}
              />
              No external AI
            </label>
            <button
              className="danger"
              onClick={() => void mutate({ trash: !m.deleted_at })}
            >
              {m.deleted_at ? "Restore from Trash" : "Move to Trash"}
            </button>
          </div>
          <p className="hint">
            {m.processing_status}. Changing privacy stops future processing; it
            cannot recall data already transmitted.
          </p>
          {m.deleted_at && (
            <details>
              <summary className="danger">
                Permanently delete this memory
              </summary>
              <p>
                This removes original text, revisions and attachments from the
                active database. Previously exported copies and provider backups
                cannot be recalled.
              </p>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const password = String(
                    new FormData(e.currentTarget).get("password"),
                  );
                  try {
                    await api(`/api/memories/${id}/purge`, {
                      method: "POST",
                      body: JSON.stringify({ password }),
                    });
                    setM(null);
                    setStatus(
                      "Memory permanently deleted from the active database.",
                    );
                  } catch (err) {
                    setStatus(
                      err instanceof Error ? err.message : "Deletion failed",
                    );
                  }
                }}
              >
                <label>
                  Re-enter your account password
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button className="danger">Confirm permanent deletion</button>
              </form>
            </details>
          )}
          <section className="card">
            <h2>Structured details</h2>
            {!m.no_ai && (
              <button
                onClick={async () => {
                  const result = await db!.rpc("retry_processing", { cid: id });
                  setStatus(
                    result.error?.message ||
                      "Processing queued. A configured worker is required.",
                  );
                }}
              >
                Retry organization
              </button>
            )}
            {events.length ? (
              events.map((e) => (
                <div key={e.id}>
                  {e.title} · {e.state} · {e.review_status}
                  <details>
                    <summary>Review or correct event</summary>
                    <form
                      className="stack"
                      onSubmit={async (formEvent) => {
                        formEvent.preventDefault();
                        const data = new FormData(formEvent.currentTarget);
                        const result = await db!.rpc("review_event", {
                          event_id: e.id,
                          new_title: data.get("title"),
                          new_date: data.get("date") || null,
                          new_state: data.get("state"),
                        });
                        setStatus(
                          result.error?.message ||
                            "Event corrected. Stale AI jobs cannot overwrite this correction.",
                        );
                        await load();
                      }}
                    >
                      <label>
                        Title
                        <input
                          name="title"
                          defaultValue={e.title}
                          required
                          maxLength={160}
                        />
                      </label>
                      <label>
                        Occurrence date
                        <input name="date" type="date" />
                      </label>
                      <label>
                        State
                        <select name="state" defaultValue={e.state}>
                          <option value="happened">Happened</option>
                          <option value="planned">Planned</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                      </label>
                      <button>Save correction</button>
                    </form>
                  </details>
                </div>
              ))
            ) : (
              <p className="muted">
                No extracted events. Your original note is preserved.
              </p>
            )}
            {links.map((l) => (
              <a
                key={l.entity_id}
                className="button"
                href={`/entities/${l.entity_id}`}
              >
                Linked entity →
              </a>
            ))}
            <details>
              <summary>Add a source-linked commitment</summary>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const result = await db!.from("commitments").insert({
                    owner_id: owner,
                    space_id: m.space_id,
                    capture_id: id,
                    description: form.get("description"),
                    direction: form.get("direction"),
                    due_on: form.get("due_on") || null,
                    status: "open",
                  });
                  setStatus(
                    result.error?.message ||
                      "Commitment saved. Find it in Upcoming.",
                  );
                  if (!result.error) e.currentTarget?.reset();
                }}
              >
                <label>
                  Description
                  <input name="description" required maxLength={1000} />
                </label>
                <label>
                  Direction
                  <select name="direction">
                    <option value="i_owe">I owe</option>
                    <option value="waiting_for">Waiting for someone</option>
                    <option value="idea">Possible idea</option>
                  </select>
                </label>
                <label>
                  Due date (optional, no implied time)
                  <input type="date" name="due_on" />
                </label>
                <button className="primary">Add commitment</button>
              </form>
            </details>
          </section>
          <section className="card">
            <h2>Attachments</h2>
            <p className="muted">
              Private files · 10 MB each · up to 10 files. PDFs are stored, not
              analyzed.
            </p>
            {attachments.map((a) => (
              <div className="row" key={a.id}>
                <span>
                  {a.name} · {a.state}
                </span>
                {a.state === "uploaded" && (
                  <button
                    onClick={async () => {
                      try {
                        const result = await api(`/api/attachments/${a.id}`);
                        window.open(
                          result.url,
                          "_blank",
                          "noopener,noreferrer",
                        );
                      } catch (e) {
                        setStatus(String(e));
                      }
                    }}
                  >
                    Download
                  </button>
                )}
              </div>
            ))}
            <label>
              Add an attachment
              <input
                className="file-input"
                type="file"
                accept="image/png,image/jpeg,application/pdf,text/plain,text/markdown"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setStatus("Uploading attachment… text is already synced.");
                  const body = new FormData();
                  body.set("file", file);
                  body.set("capture_id", id);
                  try {
                    await api("/api/attachments", { method: "POST", body });
                    setStatus("Attachment uploaded");
                    await load();
                  } catch (err) {
                    setStatus(
                      `${err instanceof Error ? err.message : "Upload failed"}. Keep your original file and retry.`,
                    );
                  }
                }}
              />
            </label>
          </section>
          <details>
            <summary>Revision history ({revisions.length})</summary>
            {revisions.map((r) => (
              <article className="card" id={`revision-${r.number}`} key={r.id}>
                <h3>
                  Revision {r.number} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                </h3>
                <p className="original" dir="auto">
                  {r.text}
                </p>
              </article>
            ))}
          </details>
        </>
      )}
    </>
  );
}
