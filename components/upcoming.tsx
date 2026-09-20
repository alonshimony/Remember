"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { db } from "@/lib/db/browser";
import { localInstant } from "@/lib/domain/dates";
import type { Space } from "@/lib/domain/schema";
type Commitment = {
  id: string;
  capture_id: string;
  description: string;
  direction: string;
  due_on: string | null;
  status: string;
};
type Reminder = {
  id: string;
  capture_id: string;
  run_at: string;
  status: string;
  schedule_revision: number;
};
export default function Upcoming({
  owner,
  timezone,
  spaces,
}: {
  owner: string;
  timezone: string;
  spaces: Space[];
}) {
  const [items, setItems] = useState<Commitment[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  const [occasions, setOccasions] = useState<
    {
      id: string;
      name: string;
      month: number;
      day: number;
      leap_policy: string;
    }[]
  >([]);
  async function load() {
    const [cs, rs, os] = await Promise.all([
      db!
        .from("commitments")
        .select("*")
        .in("status", ["open", "proposed"])
        .order("due_on"),
      db!.from("reminders").select("*").order("run_at").limit(100),
      db!.from("occasions").select("*"),
    ]);
    setItems(cs.data || []);
    setReminders(rs.data || []);
    setOccasions(os.data || []);
    if (cs.error || rs.error) setStatus("Could not load upcoming items.");
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <section className="intro">
        <p className="eyebrow">A little ahead of time</p>
        <h1>Upcoming</h1>
        <p>
          Promises to keep. People to follow up with. Moments to prepare for.
        </p>
      </section>
      {status && (
        <p className="notice" role="status">
          {status}
        </p>
      )}
      <div className="filters">
        <select
          aria-label="Commitment direction"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All commitments</option>
          <option value="i_owe">I owe</option>
          <option value="waiting_for">Waiting for someone</option>
          <option value="idea">Possible ideas</option>
        </select>
      </div>
      {items
        .filter((i) => filter === "all" || i.direction === filter)
        .map((i) => (
          <article className="card" key={i.id}>
            <div className="memory-meta">
              {i.direction.replaceAll("_", " ")} · {i.status}{" "}
              {i.due_on && `· Due ${i.due_on}`}
            </div>
            <p dir="auto">{i.description}</p>
            <div className="row">
              <Link className="button quiet" href={`/memories/${i.capture_id}`}>
                Source memory
              </Link>
              <button
                onClick={async () => {
                  const result = await db!
                    .from("commitments")
                    .update({
                      status: i.status === "proposed" ? "open" : "done",
                    })
                    .eq("id", i.id);
                  setStatus(result.error?.message || "Status saved");
                  await load();
                }}
              >
                {i.status === "proposed" ? "Confirm" : "Mark done"}
              </button>
              {i.status === "open" && (
                <button
                  onClick={async () => {
                    const result = await db!
                      .from("commitments")
                      .update({ status: "open" })
                      .eq("id", i.id);
                    setStatus(
                      result.error?.message ||
                        "Confirmed still relevant for the next 7 days. Past due dates must be updated before this task appears in current answers.",
                    );
                    await load();
                  }}
                >
                  Still relevant
                </button>
              )}
              <button
                onClick={async () => {
                  await db!
                    .from("commitments")
                    .update({ status: "cancelled" })
                    .eq("id", i.id);
                  await load();
                }}
              >
                Cancel
              </button>
            </div>
            <details>
              <summary>Set an explicit reminder</summary>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  try {
                    const run_at = localInstant(
                      String(form.get("date")),
                      String(form.get("time")),
                      timezone,
                    );
                    if (new Date(run_at) <= new Date())
                      throw new Error(
                        "Choose a future time. Past reminders are not rolled forward.",
                      );
                    const result = await db!.from("reminders").insert({
                      owner_id: owner,
                      capture_id: i.capture_id,
                      commitment_id: i.id,
                      run_at,
                      timezone,
                    });
                    if (result.error) throw result.error;
                    setStatus(
                      `Reminder saved for ${form.get("date")} at ${form.get("time")} (${timezone}). Push requires a configured scheduler and subscription.`,
                    );
                    await load();
                  } catch (e) {
                    setStatus(
                      e instanceof Error
                        ? e.message
                        : "Reminder could not be saved",
                    );
                  }
                }}
              >
                <div className="row">
                  <label>
                    Date
                    <input required name="date" type="date" />
                  </label>
                  <label>
                    Time ({timezone})<input required name="time" type="time" />
                  </label>
                </div>
                <small>
                  This exact time takes precedence over quiet hours. It does not
                  change the commitment due date.
                </small>
                <button className="primary">Schedule reminder</button>
              </form>
            </details>
          </article>
        ))}
      {!items.length && (
        <div className="empty">
          <p>Nothing asking for your attention yet.</p>
          <small>Add a commitment from any saved memory.</small>
        </div>
      )}
      <h2 style={{ marginTop: 30 }}>Reminders</h2>
      {reminders.map((r) => (
        <div className="card" key={r.id}>
          <p>
            {new Date(r.run_at).toLocaleString()} ·{" "}
            {r.status === "accepted"
              ? "Accepted by notification service (not confirmed seen)"
              : r.status}
          </p>
          <div className="row">
            <Link href={`/memories/${r.capture_id}`}>Open source →</Link>
            {r.status === "scheduled" && (
              <>
                <button
                  onClick={async () => {
                    await db!
                      .from("reminders")
                      .update({
                        status: "cancelled",
                        schedule_revision: r.schedule_revision + 1,
                      })
                      .eq("id", r.id);
                    await load();
                  }}
                >
                  Cancel reminder
                </button>
                <button
                  onClick={async () => {
                    await db!
                      .from("reminders")
                      .update({
                        run_at: new Date(Date.now() + 3600000).toISOString(),
                        schedule_revision: r.schedule_revision + 1,
                      })
                      .eq("id", r.id);
                    await load();
                  }}
                >
                  Snooze 1 hour
                </button>
              </>
            )}
          </div>
        </div>
      ))}
      <section className="card">
        <h2>Birthdays & occasions</h2>
        <details>
          <summary>Approve reminder defaults</summary>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const result = await db!
                .from("profiles")
                .update({
                  reminder_defaults_approved: true,
                  reminder_time: form.get("time"),
                  quiet_start: form.get("quiet_start"),
                  quiet_end: form.get("quiet_end"),
                })
                .eq("owner_id", owner);
              setStatus(
                result.error?.message ||
                  "Reminder defaults approved. Exact selected times override quiet hours.",
              );
            }}
          >
            <label>
              Date-only reminder time ({timezone})
              <input type="time" required name="time" defaultValue="09:00" />
            </label>
            <label>
              Quiet hours start
              <input
                type="time"
                name="quiet_start"
                defaultValue="22:00"
                required
              />
            </label>
            <label>
              Quiet hours end
              <input
                type="time"
                name="quiet_end"
                defaultValue="08:00"
                required
              />
            </label>
            <button>Approve defaults</button>
          </form>
        </details>
        {occasions.map((o) => (
          <div key={o.id}>
            {o.name} · {o.month}/{o.day} each year · leap-day policy:{" "}
            {o.leap_policy}
            <button
              onClick={async () => {
                const result = await db!.rpc("schedule_birthday", {
                  occasion_id: o.id,
                  for_year: new Date().getFullYear(),
                  preparation_days: [30, 7, 1],
                });
                setStatus(
                  result.error?.message ||
                    "Annual 30/7/1-day preparation approved. Past reminders require review; future years remain independent.",
                );
                await load();
              }}
            >
              Approve annual preparation · 30/7/1 days
            </button>
          </div>
        ))}
        <details>
          <summary>Add an annual birthday</summary>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const result = await db!.from("occasions").insert({
                owner_id: owner,
                space_id: form.get("space"),
                name: form.get("name"),
                month: Number(form.get("month")),
                day: Number(form.get("day")),
                leap_policy: form.get("leap"),
              });
              setStatus(
                result.error?.message ||
                  "Birthday saved without an assumed birth year.",
              );
              await load();
            }}
          >
            <label>
              Name
              <input name="name" required />
            </label>
            <div className="row">
              <label>
                Month
                <input name="month" type="number" min={1} max={12} required />
              </label>
              <label>
                Day
                <input name="day" type="number" min={1} max={31} required />
              </label>
            </div>
            <label>
              February 29 in non-leap years
              <select name="leap">
                <option value="feb28">February 28</option>
                <option value="mar1">March 1</option>
              </select>
            </label>
            <label>
              Space
              <select name="space">
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button>Save birthday</button>
          </form>
        </details>
      </section>
    </>
  );
}
