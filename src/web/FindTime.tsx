import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AvailabilityData } from "../domain/availability";
import type { Match } from "../domain/matching";
import type { SearchInput } from "./matching.worker";
import type { User } from "../server/auth";
import type { Members } from "./Settings";
import { api } from "./api";
import { formatTime, isoLocal, todayIn } from "./Availability";

export function FindTime({ user }: { user: User }) {
  const [members, setMembers] = useState<Members>({ members: [], grants: [] });
  const [selected, setSelected] = useState([user.id]);
  const [results, setResults] = useState<Match[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [searchOwners, setSearchOwners] = useState<string[]>([]);
  const [searchBuffer, setSearchBuffer] = useState(0);
  const [searched, setSearched] = useState(false);
  const worker = useRef<Worker | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    void api<Members>("/members")
      .then(setMembers)
      .catch((e: Error) => setError(e.message));
    return () => {
      generation.current++;
      worker.current?.terminate();
    };
  }, []);
  const cancel = () => {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setNotice("Search cancelled.");
  };
  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    worker.current?.terminate();
    const current = ++generation.current;
    setError("");
    setNotice("");
    setResults([]);
    setSearched(false);
    setProgress(0);
    const form = new FormData(event.currentTarget);
    try {
      const start = Math.max(
        Date.now(),
        Date.parse(isoLocal(String(form.get("start")), "00:00", user.zone)),
      );
      const end = Date.parse(
        isoLocal(String(form.get("end")), "00:00", user.zone),
      );
      if (end <= start || end - start > 366 * 86400000)
        throw new Error("Choose a positive search range within twelve months.");
      if (!selected.length) throw new Error("Choose at least one person.");
      const duration = Number(form.get("duration"));
      const buffer = Number(form.get("buffer"));
      const windowStart = String(form.get("windowStart"));
      const windowEnd = String(form.get("windowEnd"));
      if (windowEnd <= windowStart)
        throw new Error("The permitted window must end after it starts.");
      const input: SearchInput = {
        participants: [],
        start,
        end,
        duration,
        buffer,
        zone: user.zone,
        windowStart,
        windowEnd,
      };
      for (const id of selected) {
        const data = await api<AvailabilityData>(
          `/availability?owner=${encodeURIComponent(id)}&start=${encodeURIComponent(new Date(start).toISOString())}&end=${encodeURIComponent(new Date(end).toISOString())}`,
        );
        if (current !== generation.current) return;
        input.participants.push({ id, data });
      }
      setSearchOwners([...selected]);
      setSearchBuffer(buffer);
      const instance = new Worker(
        new URL("./matching.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = instance;
      instance.onmessage = (
        message: MessageEvent<{
          progress?: number;
          results?: Match[];
          warnings?: string[];
        }>,
      ) => {
        if (current !== generation.current) return;
        if (message.data.warnings?.length)
          setNotice(
            `${message.data.warnings.length} recurring occurrences need DST correction and were left Unknown.`,
          );
        if (message.data.results) {
          setResults(message.data.results);
          setSearched(true);
          setProgress(null);
          instance.terminate();
          worker.current = null;
        } else setProgress(message.data.progress ?? 0);
      };
      instance.onerror = () => {
        setError("The search could not finish. Try a shorter range.");
        setProgress(null);
        instance.terminate();
      };
      instance.postMessage(input);
    } catch (e) {
      if (current === generation.current) {
        setError((e as Error).message);
        setProgress(null);
      }
    }
  };
  const recheck = async (result: Match) => {
    try {
      const value = await api<{ requiresAcknowledgement: boolean }>(
        "/availability/recheck",
        "POST",
        {
          owners: searchOwners,
          start: new Date(result.start - searchBuffer * 60000).toISOString(),
          end: new Date(result.end + searchBuffer * 60000).toISOString(),
        },
      );
      setNotice(
        value.requiresAcknowledgement
          ? "Current data includes Busy or Unknown time. Resolve or acknowledge this before confirming a future plan."
          : "Rechecked: everyone is currently marked Available, including the selected buffer. This does not reserve external calendars.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const today = todayIn(user.zone);
  const eligible = members.members.filter(
    (m) =>
      m.id === user.id ||
      members.grants.some(
        (g) => g.owner_id === m.id && g.viewer_id === user.id,
      ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">FIND YOUR NEXT GOOD MOMENT</p>
          <h1>
            A time for everyone<span className="title-dot">.</span>
          </h1>
          <p>Bring a few people together. We’ll look for the overlap.</p>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <div className="matching-layout">
        <section className="panel">
          <h2>Who’s coming?</h2>
          <form onSubmit={(e) => void search(e)}>
            <fieldset>
              <legend>Required people</legend>
              {eligible.map((m) => (
                <label className="check person-check" key={m.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(m.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, m.id]
                          : s.filter((id) => id !== m.id),
                      )
                    }
                  />
                  <span className="avatar small">{m.name.slice(0, 1)}</span>
                  {m.name}
                  {m.id === user.id ? " (you)" : ""}
                </label>
              ))}
            </fieldset>
            <p className="fine">
              Only people who share availability with you appear here.
            </p>
            <div className="form-grid">
              <label>
                From
                <input
                  type="date"
                  name="start"
                  defaultValue={today.toString()}
                  min={today.toString()}
                  max={today.add({ months: 12 }).toString()}
                  required
                />
              </label>
              <label>
                Until (exclusive)
                <input
                  type="date"
                  name="end"
                  defaultValue={today.add({ days: 7 }).toString()}
                  min={today.toString()}
                  max={today.add({ months: 12 }).toString()}
                  required
                />
              </label>
              <label>
                Duration (minutes)
                <input
                  type="number"
                  min="15"
                  max="1440"
                  step="15"
                  name="duration"
                  defaultValue="90"
                  required
                />
              </label>
              <label>
                Buffer each side (minutes)
                <input
                  type="number"
                  min="0"
                  max="180"
                  step="5"
                  name="buffer"
                  defaultValue="0"
                  required
                />
              </label>
              <label>
                Not before
                <input
                  type="time"
                  name="windowStart"
                  defaultValue="09:00"
                  required
                />
              </label>
              <label>
                Finish by
                <input
                  type="time"
                  name="windowEnd"
                  defaultValue="22:00"
                  required
                />
              </label>
            </div>
            <p className="fine">
              Local window in {user.zone}. Suggestions start every 15 minutes.
            </p>
            <button className="primary wide" disabled={progress !== null}>
              Find a time →
            </button>
            {progress !== null && (
              <>
                <progress
                  aria-label="Search progress"
                  max="1"
                  value={progress}
                />
                <button
                  className="secondary wide"
                  type="button"
                  onClick={cancel}
                >
                  Cancel search
                </button>
              </>
            )}
          </form>
        </section>
        <section className="panel results">
          <div className="section-heading">
            <h2>Room for a plan</h2>
            <span className="pill">{results.length} suggestions</span>
          </div>
          <p>
            Complete matches first, then the most available people, then the
            earliest time.
          </p>
          {!results.length && (
            <div className="results-empty">
              <span aria-hidden="true">◷</span>
              <h3>
                {searched ? "No slots fit this window" : "Good times are ahead"}
              </h3>
              <p>
                {searched
                  ? "Try a longer date range or a wider daily window."
                  : "Choose your people and a date range to find your next moment together."}
              </p>
            </div>
          )}
          {results.map((r) => (
            <article className="match-card" key={r.start}>
              <div>
                <span className={`pill ${r.complete ? "match-complete" : ""}`}>
                  {r.complete ? "Everyone available" : "Partial match"}
                </span>
                <h3>
                  {new Date(r.start).toLocaleDateString("en", {
                    timeZone: user.zone,
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <strong>
                  {formatTime(r.start, user.zone)} –{" "}
                  {formatTime(r.end, user.zone)}
                </strong>
                <p>
                  {r.available} Available · {r.busy} Busy · {r.unknown} Unknown
                </p>
              </div>
              <div className="actions">
                <button className="secondary" onClick={() => void recheck(r)}>
                  Recheck time
                </button>
                <a
                  className="primary"
                  href={`#plans?${new URLSearchParams({ start: String(r.start), end: String(r.end), people: searchOwners.filter((id) => id !== user.id).join(",") })}`}
                >
                  Make a plan
                </a>
              </div>
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
