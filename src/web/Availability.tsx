import { useEffect, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import {
  instant,
  type AvailabilityData,
  type Entry,
  type Segment,
} from "../domain/availability";
import type { User } from "../server/auth";
import { api } from "./api";

export const todayIn = (zone: string) =>
  Temporal.Now.zonedDateTimeISO(zone).toPlainDate();
export const formatTime = (value: number, zone: string) =>
  new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: zone,
  }).format(value);
export const isoLocal = (
  date: string,
  time: string,
  zone: string,
  choice: "reject" | "earlier" | "later" = "reject",
) => new Date(instant(`${date}T${time}`, zone, choice)).toISOString();
export function Availability({ user }: { user: User }) {
  const today = todayIn(user.zone);
  const horizon = today.add({ months: 12 });
  const [date, setDate] = useState(today.toString());
  const [view, setView] = useState("Week");
  const [data, setData] = useState<AvailabilityData>({
    entries: [],
    rules: [],
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<"entry" | "rule" | null>(null);
  const [editing, setEditing] = useState<Entry>();
  const [saving, setSaving] = useState(false);
  const [allDay, setAllDay] = useState(false);
  const [computed, setComputed] = useState<{
    segments: Segment[];
    warnings: string[];
  }>({ segments: [], warnings: [] });
  const [computing, setComputing] = useState(true);
  const selected = Temporal.PlainDate.from(date);
  const start = instant(`${today}T00:00`, user.zone);
  const end = instant(`${horizon}T00:00`, user.zone);
  useEffect(() => {
    let current = true;
    setLoading(true);
    void api<AvailabilityData>(
      `/availability?start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
    )
      .then((d) => {
        if (current) {
          setData(d);
          setError("");
        }
      })
      .catch((e: Error) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [start, end, revision]);
  useEffect(() => {
    setComputing(true);
    const worker = new Worker(
      new URL("./availability.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (
      event: MessageEvent<{
        segments: Segment[];
        warnings: string[];
        error?: string;
      }>,
    ) => {
      if (event.data.error) setError(event.data.error);
      else setComputed(event.data);
      setComputing(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setError("Unable to calculate availability. Please reload.");
      setComputing(false);
      worker.terminate();
    };
    worker.postMessage({ data, start, end });
    return () => worker.terminate();
  }, [data, start, end]);
  const refresh = () => setRevision((n) => n + 1);
  const remove = async (type: string, id: string) => {
    try {
      await api(`/availability/${type}/${id}`, "DELETE");
      setNotice("Removed. Availability updated.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");
    try {
      if (editor === "rule")
        await api("/availability/rules", "POST", {
          weekday: Number(value("weekday")),
          startTime: value("startTime"),
          endTime: value("endTime"),
          effectiveStart: value("effectiveStart"),
          effectiveEnd: value("effectiveEnd"),
          zone: user.zone,
          state: value("state"),
          disambiguation: value("disambiguation"),
        });
      else {
        const choice = value("disambiguation") as
          "reject" | "earlier" | "later";
        const a = `${value("startDate")}T${allDay ? "00:00" : value("startTime")}`;
        const b = `${value("endDate")}T${allDay ? "00:00" : value("endTime")}`;
        // Reject spring gaps even when a fall-fold offset was selected.
        for (const local of [a, b]) {
          const plain = Temporal.PlainDateTime.from(local);
          if (
            !plain
              .toZonedDateTime(user.zone, { disambiguation: "earlier" })
              .toPlainDateTime()
              .equals(plain)
          )
            throw new Error(
              "This local time does not exist because of daylight saving. Choose another time.",
            );
        }
        const entry = {
          start: new Date(instant(a, user.zone, choice)).toISOString(),
          end: new Date(instant(b, user.zone, choice)).toISOString(),
          zone: user.zone,
          state: value("state"),
          label: value("label"),
        };
        await api(
          editing
            ? `/availability/entries/${editing.id}`
            : "/availability/entries",
          editing ? "PUT" : "POST",
          entry,
        );
      }
      setEditor(null);
      setEditing(undefined);
      setNotice("Saved. Your availability is up to date.");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const windowEnd =
    view === "Day"
      ? selected.add({ days: 1 })
      : view === "Week"
        ? selected.add({ days: 7 })
        : selected.add({ months: 1 });
  const days = [];
  for (
    let d = selected;
    Temporal.PlainDate.compare(d, windowEnd) < 0 &&
    Temporal.PlainDate.compare(d, horizon) < 0;
    d = d.add({ days: 1 })
  )
    days.push(d);
  const partsFor = (d: Temporal.PlainDate): Segment[] => {
    const a = instant(`${d}T00:00`, user.zone);
    const b = instant(`${d.add({ days: 1 })}T00:00`, user.zone);
    return computed.segments
      .filter((s) => s.start < b && s.end > a)
      .map((s) => ({
        ...s,
        start: Math.max(s.start, a),
        end: Math.min(s.end, b),
      }));
  };
  const editLocal = (value?: string) =>
    value
      ? Temporal.Instant.from(value).toZonedDateTimeISO(user.zone)
      : undefined;
  const localStart = editLocal(editing?.start);
  const localEnd = editLocal(editing?.end);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A LITTLE SPACE FOR WHAT MATTERS</p>
          <h1>
            My availability<span className="title-dot">.</span>
          </h1>
          <p>Let your people know when there’s room for a plan.</p>
        </div>
        <button
          className="primary"
          onClick={() => {
            setEditor("entry");
            setEditing(undefined);
            setAllDay(false);
          }}
        >
          ＋ Add availability
        </button>
      </div>
      <div className="summary-row">
        <div className="summary-card">
          <span className="summary-icon green">◷</span>
          <div>
            <small>Your rhythm</small>
            <strong>
              {data.rules.length} weekly{" "}
              {data.rules.length === 1 ? "rule" : "rules"}
            </strong>
          </div>
          <button
            className="text-button"
            onClick={() => {
              setEditor("rule");
              setEditing(undefined);
            }}
          >
            Set a routine ↗
          </button>
        </div>
        <div className="summary-card">
          <span className="summary-icon sand">◇</span>
          <div>
            <small>Privacy first</small>
            <strong>You decide who sees your time</strong>
          </div>
          <a href="#settings">Manage sharing ↗</a>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="success">
          {notice}
        </p>
      )}
      {editor && (
        <section className="panel editor" aria-labelledby="editor-title">
          <div className="section-heading">
            <h2 id="editor-title">
              {editor === "rule"
                ? "Set a weekly rhythm"
                : editing
                  ? "Edit availability"
                  : "Make room in your calendar"}
            </h2>
            <button className="secondary" onClick={() => setEditor(null)}>
              Close editor
            </button>
          </div>
          <p>Times use {user.zone}. Uncovered time stays Unknown.</p>
          <form onSubmit={(e) => void submit(e)}>
            <div className="form-grid">
              <label>
                Availability
                <select
                  name="state"
                  defaultValue={editing?.state ?? "Available"}
                >
                  <option>Available</option>
                  <option>Busy</option>
                </select>
              </label>
              {editor === "entry" ? (
                <>
                  <label>
                    Private label
                    <input
                      name="label"
                      maxLength={100}
                      defaultValue={editing?.label}
                      placeholder="e.g. A free evening"
                    />
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={allDay}
                      onChange={(e) => setAllDay(e.target.checked)}
                    />{" "}
                    All-day / multi-day entry
                  </label>
                  <label>
                    Start date
                    <input
                      name="startDate"
                      type="date"
                      required
                      min={today.toString()}
                      max={horizon.toString()}
                      defaultValue={
                        localStart?.toPlainDate().toString() ?? date
                      }
                    />
                  </label>
                  <label>
                    {allDay ? "End date (exclusive)" : "End date"}
                    <input
                      name="endDate"
                      type="date"
                      required
                      min={today.toString()}
                      max={horizon.toString()}
                      defaultValue={
                        localEnd?.toPlainDate().toString() ??
                        (allDay ? selected.add({ days: 1 }).toString() : date)
                      }
                      key={String(allDay)}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Every
                    <select name="weekday" defaultValue="1">
                      {[
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                        "Sunday",
                      ].map((d, i) => (
                        <option key={d} value={i + 1}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Effective from
                    <input
                      type="date"
                      name="effectiveStart"
                      required
                      defaultValue={today.toString()}
                      min={today.toString()}
                      max={horizon.toString()}
                    />
                  </label>
                  <label>
                    Through (inclusive)
                    <input
                      type="date"
                      name="effectiveEnd"
                      required
                      defaultValue={today.add({ months: 3 }).toString()}
                      min={today.toString()}
                      max={horizon.toString()}
                    />
                  </label>
                </>
              )}
              {!allDay || editor === "rule" ? (
                <>
                  <label>
                    Start time
                    <input
                      name="startTime"
                      type="time"
                      required
                      defaultValue={
                        localStart?.toPlainTime().toString().slice(0, 5) ??
                        "18:00"
                      }
                    />
                  </label>
                  <label>
                    End time
                    <input
                      name="endTime"
                      type="time"
                      required
                      defaultValue={
                        localEnd?.toPlainTime().toString().slice(0, 5) ??
                        "21:00"
                      }
                    />
                  </label>
                </>
              ) : null}
              <label>
                Repeated DST times
                <select name="disambiguation" defaultValue="reject">
                  <option value="reject">Ask me to correct them</option>
                  <option value="earlier">Use the earlier occurrence</option>
                  <option value="later">Use the later occurrence</option>
                </select>
              </label>
            </div>
            {editor === "rule" && (
              <p className="fine">
                An end time before the start continues into the next day.
                Spring-forward gaps always need correction.
              </p>
            )}
            <button className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save availability"}
            </button>
          </form>
        </section>
      )}
      <section className="panel calendar-panel">
        <div className="calendar-toolbar">
          <div>
            <h2>
              {selected.toLocaleString("en", {
                month: "long",
                year: "numeric",
              })}
            </h2>
            <span className="fine">Your next twelve months, at your pace</span>
          </div>
          <div className="calendar-actions">
            <label className="sr-only" htmlFor="view-date">
              View from
            </label>
            <input
              id="view-date"
              type="date"
              value={date}
              min={today.toString()}
              max={horizon.subtract({ days: 1 }).toString()}
              onChange={(e) => {
                if (
                  e.target.value >= today.toString() &&
                  e.target.value < horizon.toString()
                )
                  setDate(e.target.value);
              }}
            />
            <div className="segmented" aria-label="Calendar view">
              {["Day", "Week", "Month", "Year"].map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="legend">
          <span>
            <i className="dot available" /> Available
          </span>
          <span>
            <i className="dot busy" /> Busy
          </span>
          <span>
            <i className="dot unknown" /> Unknown
          </span>
          <span className="legend-note">
            Only you can see your private labels
          </span>
        </div>
        {loading || computing ? (
          <p className="empty" role="status">
            Loading your availability…
          </p>
        ) : view === "Year" ? (
          <div className="year-grid">
            {Array.from({ length: 12 }, (_, i) => today.add({ months: i })).map(
              (month) => {
                const a = instant(`${month}T00:00`, user.zone);
                const b = instant(
                  `${month.add({ months: 1 })}T00:00`,
                  user.zone,
                );
                const known = computed.segments
                  .filter(
                    (s) => s.state === "Available" && s.start < b && s.end > a,
                  )
                  .reduce(
                    (sum, s) => sum + Math.min(s.end, b) - Math.max(s.start, a),
                    0,
                  );
                return (
                  <button
                    key={month.toString()}
                    className="month-tile"
                    onClick={() => {
                      setDate(month.toString());
                      setView("Month");
                    }}
                  >
                    <strong>
                      {month.toLocaleString("en", { month: "long" })}
                    </strong>
                    <span>{Math.round(known / 3600000)}h marked Available</span>
                    <span className="fine">Open dates →</span>
                  </button>
                );
              },
            )}
          </div>
        ) : (
          <div className={`day-grid ${view === "Day" ? "single-day" : ""}`}>
            {days.map((day) => (
              <article className="day-column" key={day.toString()}>
                <div className="day-heading">
                  <span>{day.toLocaleString("en", { weekday: "short" })}</span>
                  <strong className={day.equals(today) ? "today" : ""}>
                    {day.day}
                  </strong>
                </div>
                <div className="day-slots">
                  {partsFor(day).map((s) => (
                    <div
                      key={s.start}
                      className={`slot ${s.state.toLowerCase()}`}
                    >
                      <strong>{s.state}</strong>
                      <span>
                        {s.start === instant(`${day}T00:00`, user.zone) &&
                        s.end ===
                          instant(`${day.add({ days: 1 })}T00:00`, user.zone)
                          ? "All day"
                          : `${formatTime(s.start, user.zone)} – ${s.end === instant(`${day.add({ days: 1 })}T00:00`, user.zone) ? "midnight (next day)" : formatTime(s.end, user.zone)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="calendar-foot">
          <span>◌ Blank time is Unknown, never assumed free.</span>
          <button
            className="text-button"
            onClick={() => {
              setEditor("rule");
              setEditing(undefined);
            }}
          >
            ＋ Add weekly rule
          </button>
        </div>
      </section>
      {computed.warnings.length > 0 && (
        <div className="notice" role="status">
          <strong>Some recurring times need correction</strong>
          {computed.warnings.slice(0, 8).map((w) => (
            <p key={w}>{w}</p>
          ))}
          <p>These occurrences were not marked available.</p>
        </div>
      )}
      <div className="bottom-grid">
        <section className="panel">
          <h2>Your dated entries</h2>
          {!data.entries.length ? (
            <p className="empty">
              A little breathing room starts here.
              <br />
              Add your first available or busy interval.
            </p>
          ) : (
            <ul className="entry-list">
              {data.entries.map((e) => (
                <li key={e.id}>
                  <span className={`dot ${e.state.toLowerCase()}`} />
                  <div>
                    <strong>{e.label || e.state}</strong>
                    <small>
                      {new Date(e.start).toLocaleString("en", {
                        timeZone: user.zone,
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}{" "}
                      · {e.state}
                    </small>
                  </div>
                  <button
                    className="text-button"
                    aria-label={`Edit ${e.label || e.state}`}
                    onClick={() => {
                      setEditing(e);
                      setEditor("entry");
                      setAllDay(false);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-button danger"
                    aria-label={`Delete ${e.label || e.state}`}
                    onClick={() => void remove("entries", e.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h2>A rhythm that works for you</h2>
          {!data.rules.length ? (
            <p className="empty">
              Usually free on Tuesday evenings?
              <br />
              Set it once. Keep the rest flexible.
            </p>
          ) : (
            <ul className="entry-list">
              {data.rules.map((r) => (
                <li key={r.id}>
                  <span className={`dot ${r.state.toLowerCase()}`} />
                  <div>
                    <strong>
                      {
                        [
                          "",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                          "Sunday",
                        ][r.weekday]
                      }{" "}
                      · {r.state}
                    </strong>
                    <small>
                      {r.startTime}–{r.endTime} · {r.zone}
                    </small>
                    <small>Through {r.effectiveEnd}</small>
                  </div>
                  <button
                    className="text-button danger"
                    onClick={() => void remove("rules", r.id)}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
