import { useEffect, useState, type FormEvent } from "react";
import { Temporal } from "@js-temporal/polyfill";
import { instant } from "../domain/availability";
import type { Candidate, DraftInput, Plan, PlanDetail } from "../domain/plans";
import type { User } from "../server/auth";
import type { Members } from "./Settings";
import { api } from "./api";
import { TimeZoneField } from "./TimeZoneField";
import { PlanInvitations } from "./PlanInvitations";

const statusLabel: Record<string, string> = {
  draft: "Draft",
  proposed: "Time proposed",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  completed: "Completed",
  requested: "Approval requested",
  interested: "Interested",
  waitlisted: "Waitlisted",
  offered: "Place offered",
  reconfirmation: "Reconfirmation required",
  left: "Left",
  removed: "Removed",
  rejected: "Request declined",
  declined: "Declined",
  expired: "Expired",
};
export function planDate(value: number | null, zone: string) {
  return value === null
    ? "Time to be decided"
    : new Date(value).toLocaleString("en", {
        timeZone: zone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}
const localDate = (value: number, zone: string) =>
  Temporal.Instant.fromEpochMilliseconds(value)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString()
    .slice(0, 16);
type Group = { id: string; name: string; owner_id: string };
function suggestion() {
  const params = new URLSearchParams(location.hash.split("?")[1]);
  const start = Number(params.get("start"));
  const end = Number(params.get("end"));
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start <= Date.now() ||
    start > Date.now() + 367 * 86400000 ||
    end <= start ||
    end - start > 14 * 86400000
  )
    return undefined;
  return {
    start,
    end,
    people: (params.get("people") ?? "")
      .split(",")
      .filter((id) => /^[\w:-]{1,100}$/.test(id))
      .slice(0, 20),
  };
}
function PlanEditor({
  user,
  detail,
  onClose,
  onSave,
}: {
  user: User;
  detail?: PlanDetail;
  onClose: () => void;
  onSave: (id: string) => void;
}) {
  const p = detail?.plan;
  const [seed] = useState(() => (p ? undefined : suggestion()));
  const [members, setMembers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [mode, setMode] = useState(
    p?.status === "proposed" || (p && p.start_ms === null)
      ? "candidates"
      : "fixed",
  );
  const [visibility, setVisibility] = useState(p?.visibility ?? "invite");
  const [invitees, setInvitees] = useState(
    detail?.invitees ?? seed?.people ?? [],
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const zone = p?.zone ?? user.zone;
  const locked = Boolean(p && p.status !== "draft");
  useEffect(() => {
    void Promise.all([
      api<Members>("/members"),
      api<{ groups: Group[] }>("/groups"),
    ])
      .then(([m, g]) => {
        setMembers(m.members);
        setGroups(g.groups);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const f = new FormData(event.currentTarget);
    const value = (key: string) => String(f.get(key) ?? "");
    const selectedZone = value("zone");
    const convert = (key: string) =>
      new Date(instant(value(key), selectedZone)).toISOString();
    try {
      const input: DraftInput = {
        title: value("title"),
        description: value("description"),
        category: value("category"),
        venue: value("venue"),
        zone: selectedZone,
        visibility: locked ? p!.visibility : visibility,
        groupId:
          visibility === "group"
            ? locked
              ? p!.group_id
              : value("group")
            : null,
        invitees,
        joinPolicy: value("joinPolicy") as "immediate" | "approval",
        capacity: Number(value("capacity")),
        organizerAttends: locked
          ? Boolean(p!.organizer_attends)
          : f.get("attends") === "on",
        time:
          mode === "fixed"
            ? { start: convert("start"), end: convert("end") }
            : null,
        candidates:
          mode === "candidates"
            ? [0, 1].map((i) => ({
                start: convert(`candidateStart${i}`),
                end: convert(`candidateEnd${i}`),
              }))
            : [],
        joinDeadline: value("deadline") ? convert("deadline") : null,
      };
      if (p) {
        await api("/plans/" + p.id, "PUT", {
          expectedVersion: p.version,
          draft: input,
          acknowledge: f.get("acknowledge") === "on",
        });
        onSave(p.id);
      } else {
        const result = await api<{ id: string }>("/plans", "POST", input);
        onSave(result.id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const initial = (offset: number) => Date.now() + offset * 86400000;
  return (
    <section className="panel editor">
      <div className="section-heading">
        <h2>{p ? "Edit your plan" : "Make something happen"}</h2>
        <button className="secondary" onClick={onClose}>
          Close editor
        </button>
      </div>
      <p>
        {locked
          ? "Update your plan and save changes. You can also select additional members to invite."
          : "Save a private draft first. Publish when you’re ready to invite people."}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-grid">
          <label>
            Plan title
            <input
              name="title"
              required
              maxLength={120}
              defaultValue={p?.title}
              placeholder="Dinner, a walk, a weekend away…"
            />
          </label>
          <label>
            Category
            <input
              name="category"
              required
              maxLength={40}
              defaultValue={p?.category ?? "Social"}
            />
          </label>
          <label>
            Private venue or meeting link
            <input name="venue" maxLength={500} defaultValue={p?.venue} />
          </label>
          <TimeZoneField label="Plan time zone" defaultValue={zone} />
          <label>
            Description
            <textarea
              name="description"
              rows={3}
              maxLength={3000}
              defaultValue={p?.description}
            />
          </label>
          <label>
            Who can see it?
            <select
              value={visibility}
              disabled={locked}
              onChange={(e) =>
                setVisibility(e.target.value as "invite" | "group")
              }
            >
              <option value="invite">Invited members only</option>
              <option value="group">A private group</option>
            </select>
          </label>
          {visibility === "group" ? (
            <label>
              Group
              <select
                name="group"
                required
                defaultValue={p?.group_id ?? ""}
                disabled={locked}
              >
                <option value="">Select a group</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <fieldset className="invite-list">
              <legend>Invite these members</legend>
              {members
                .filter((m) => m.id !== user.id)
                .map((m) => (
                  <label className="check" key={m.id}>
                    <input
                      type="checkbox"
                      disabled={
                        locked && Boolean(detail?.invitees.includes(m.id))
                      }
                      checked={invitees.includes(m.id)}
                      onChange={(e) =>
                        setInvitees((ids) =>
                          e.target.checked
                            ? [...ids, m.id]
                            : ids.filter((id) => id !== m.id),
                        )
                      }
                    />
                    {m.name}
                  </label>
                ))}
              <small>
                {locked
                  ? "Select additional members and save changes to invite them. Existing invitations are kept."
                  : "Join a group to find people to invite. After publishing, you can also invite by Google email."}
              </small>
            </fieldset>
          )}
          <label>
            Joining
            <select
              name="joinPolicy"
              defaultValue={p?.join_policy ?? "immediate"}
            >
              <option value="immediate">Anyone eligible can join</option>
              <option value="approval">Organizer approval required</option>
            </select>
          </label>
          <label>
            Total places
            <input
              type="number"
              name="capacity"
              min={1}
              max={20}
              required
              defaultValue={p?.capacity ?? 8}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="attends"
              defaultChecked={p ? Boolean(p.organizer_attends) : true}
              disabled={locked}
            />{" "}
            I’m attending (uses one place)
          </label>
          <label>
            Joining deadline (optional)
            <input
              type="datetime-local"
              name="deadline"
              defaultValue={
                p?.join_deadline ? localDate(p.join_deadline, zone) : ""
              }
            />
          </label>
          <label>
            Timing
            <select
              value={mode}
              disabled={locked}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="fixed">One confirmed time</option>
              <option value="candidates">Vote on two candidates</option>
            </select>
          </label>
          {mode === "fixed" ? (
            <>
              <label>
                Starts
                <input
                  name="start"
                  type="datetime-local"
                  required
                  defaultValue={localDate(
                    p?.start_ms ?? seed?.start ?? initial(2),
                    zone,
                  )}
                />
              </label>
              <label>
                Ends
                <input
                  name="end"
                  type="datetime-local"
                  required
                  defaultValue={localDate(
                    p?.end_ms ?? seed?.end ?? initial(2) + 3600000,
                    zone,
                  )}
                />
              </label>
            </>
          ) : (
            [0, 1].map((i) => (
              <div className="candidate-editor" key={i}>
                <label>
                  Candidate {i + 1} starts
                  <input
                    name={`candidateStart${i}`}
                    type="datetime-local"
                    required
                    defaultValue={localDate(
                      detail?.candidates[i]?.start_ms ?? initial(i + 2),
                      zone,
                    )}
                  />
                </label>
                <label>
                  Candidate {i + 1} ends
                  <input
                    name={`candidateEnd${i}`}
                    type="datetime-local"
                    required
                    defaultValue={localDate(
                      detail?.candidates[i]?.end_ms ?? initial(i + 2) + 3600000,
                      zone,
                    )}
                  />
                </label>
              </div>
            ))
          )}
        </div>
        {locked && (
          <label className="check">
            <input type="checkbox" name="acknowledge" /> I acknowledge Busy or
            Unknown participant availability. Material changes require
            reconfirmation.
          </label>
        )}
        <p className="fine">
          Ambiguous or nonexistent daylight-saving times require correction.
          Plan confirmation does not reserve external calendars.
        </p>
        <button className="primary" disabled={saving}>
          {saving ? "Saving…" : p ? "Save changes" : "Save draft"}
        </button>
      </form>
    </section>
  );
}

export function Plans({ user, planId }: { user: User; planId?: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [detail, setDetail] = useState<PlanDetail>();
  const [editing, setEditing] = useState(
    () => !planId && Boolean(suggestion()),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [acknowledge, setAcknowledge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const load = async () => {
    try {
      setError("");
      if (planId) setDetail(await api<PlanDetail>("/plans/" + planId));
      else setPlans((await api<{ plans: Plan[] }>("/plans")).plans);
    } catch (e) {
      setDetail(undefined);
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, [planId]);
  const save = (id: string) => {
    setEditing(false);
    setNotice("Plan saved.");
    if (id === planId) void load();
    else location.hash = "plans/" + id;
  };
  const command = async (
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!detail) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/plans/${detail.plan.id}/${action}`, "POST", {
        expectedVersion: detail.plan.version,
        acknowledge,
        ...extra,
      });
      setNotice("Plan updated.");
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!detail) return;
    try {
      await api("/plans/" + detail.plan.id, "DELETE", {
        expectedVersion: detail.plan.version,
      });
      location.hash = "plans";
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const p = detail?.plan;
  const own = p?.organizer_id === user.id;
  const mine = detail?.participants.find((m) => m.user_id === user.id);
  const active = p && ["proposed", "confirmed"].includes(p.status);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SOMETHING TO LOOK FORWARD TO</p>
          <h1>
            {planId ? "The plan" : "Make a plan"}
            <span className="title-dot">.</span>
          </h1>
          <p>
            {planId
              ? "A shared moment, with everyone on the same page."
              : "Turn a little free time into something good."}
          </p>
        </div>
        {planId ? (
          <a className="secondary" href="#plans">
            ← All plans
          </a>
        ) : (
          <button className="primary" onClick={() => setEditing(true)}>
            ＋ Create a plan
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      {editing && (
        <PlanEditor
          user={user}
          detail={detail}
          onClose={() => setEditing(false)}
          onSave={save}
        />
      )}
      {!planId && (
        <>
          <label className="plan-filter">
            Find a plan
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search title or category"
            />
          </label>
          <div className="plan-grid">
            {plans
              .filter((p) =>
                `${p.title} ${p.category}`
                  .toLowerCase()
                  .includes(filter.toLowerCase()),
              )
              .map((p) => (
                <a
                  className="panel plan-card"
                  href={"#plans/" + p.id}
                  key={p.id}
                >
                  <div className="section-heading">
                    <span className="pill">{statusLabel[p.status]}</span>
                    <small>
                      {p.visibility === "group" ? "Group-only" : "Invite-only"}
                    </small>
                  </div>
                  <h2>{p.title}</h2>
                  <p>{planDate(p.start_ms, user.zone)}</p>
                  <div className="plan-card-footer">
                    <span>
                      {p.held}/{p.capacity} places held
                    </span>
                    <span>{p.category} ↗</span>
                  </div>
                </a>
              ))}
          </div>
          {!plans.length && (
            <section className="panel empty">
              <h2>Good plans start somewhere.</h2>
              <p>Create a draft and invite your people.</p>
            </section>
          )}
        </>
      )}
      {detail && p && (
        <>
          <section className="panel">
            <div className="section-heading">
              <span className="pill">{statusLabel[p.status]}</span>
              <span className="fine">
                Version {p.version} ·{" "}
                {p.visibility === "group" ? "Group-only" : "Invite-only"}
              </span>
            </div>
            <h2 className="plan-title">{p.title}</h2>
            <p className="plan-description">
              {p.description || "A little time together."}
            </p>
            <div className="plan-facts">
              <div>
                <small>When</small>
                <strong>{planDate(p.start_ms, user.zone)}</strong>
                {p.end_ms && (
                  <small>Until {planDate(p.end_ms, user.zone)}</small>
                )}
                <small>Reference zone: {p.zone}</small>
              </div>
              <div>
                <small>Where</small>
                <strong>{p.venue || "To be arranged"}</strong>
              </div>
              <div>
                <small>Places</small>
                <strong>
                  {p.held} held / {p.capacity} total
                </strong>
                <small>
                  {p.join_policy === "approval"
                    ? "Organizer approval"
                    : "Immediate joining"}
                  {p.joining_closed ? " · Closed" : ""}
                </small>
              </div>
            </div>
            <div className="notice">
              Calendar export is not available in this local preview. Joining
              here does not create an external event.
            </div>
            {active || p.status === "draft" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                />{" "}
                I acknowledge Busy or Unknown availability when proceeding.
              </label>
            ) : null}
            {own && active && p.visibility === "invite" && (
              <PlanInvitations key={p.id} detail={detail} onSave={load} />
            )}
            {own && active && p.visibility === "group" && (
              <p>
                To invite more people to this group-only plan, add them to the
                group under People & settings.{" "}
                <a href="#settings">Manage group members</a>.
              </p>
            )}
            <div className="action-row">
              {own && p.status === "draft" && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void command("publish")}
                  >
                    Publish plan
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setEditing(true)}
                  >
                    Edit draft
                  </button>
                  <button
                    className="text-button danger"
                    onClick={() => void remove()}
                  >
                    Delete draft
                  </button>
                </>
              )}
              {own && active && (
                <>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void command("joining", { closed: !p.joining_closed })
                    }
                  >
                    {p.joining_closed ? "Reopen joining" : "Close joining"}
                  </button>
                  {p.status === "confirmed" && (
                    <button
                      className="secondary"
                      onClick={() => setEditing(true)}
                    >
                      Edit plan
                    </button>
                  )}
                  <button
                    className="secondary danger"
                    disabled={busy}
                    onClick={() => void command("cancel")}
                  >
                    Cancel plan
                  </button>
                </>
              )}
              {active &&
                (!mine ||
                  ["left", "declined", "expired"].includes(mine.status)) &&
                !p.joining_closed && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void command("participation", {
                        action: "join",
                        waitlist: p.held >= p.capacity,
                      })
                    }
                  >
                    {p.held >= p.capacity
                      ? "Join waitlist"
                      : p.join_policy === "approval"
                        ? "Request a place"
                        : "Join plan"}
                  </button>
                )}
              {mine && (
                <span className="pill">
                  Your status: {statusLabel[mine.status] ?? mine.status}
                </span>
              )}
              {mine && ["offered", "reconfirmation"].includes(mine.status) && (
                <>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void command("participation", { action: "accept" })
                    }
                  >
                    {mine.status === "offered" ? "Accept place" : "Reconfirm"}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void command("participation", { action: "decline" })
                    }
                  >
                    Decline
                  </button>
                </>
              )}
              {mine &&
                ["confirmed", "interested", "waitlisted", "requested"].includes(
                  mine.status,
                ) &&
                active && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void command("participation", { action: "leave" })
                    }
                  >
                    Leave plan
                  </button>
                )}
            </div>
            {mine?.expires_at && (
              <p className="fine">
                Respond by {planDate(mine.expires_at, user.zone)}. Until then,
                your place is held.
              </p>
            )}
          </section>
          {detail.candidates.length > 0 && (
            <section className="panel">
              <h2>Find the best fit</h2>
              <div className="candidate-grid">
                {detail.candidates.map((c) => (
                  <CandidateCard
                    key={c.id}
                    candidate={c}
                    zone={user.zone}
                    disabled={busy || p.status !== "proposed"}
                    own={Boolean(own)}
                    vote={(response) =>
                      void command("votes", { candidateId: c.id, response })
                    }
                    confirm={() =>
                      void command("confirm", { candidateId: c.id })
                    }
                  />
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <h2>The people</h2>
            {!detail.participants.length && (
              <p>No participants yet. Votes alone do not hold a place.</p>
            )}
            {detail.participants.map((m) => (
              <div className="person-row" key={m.user_id}>
                <span className="avatar">{m.name.slice(0, 1)}</span>
                <div>
                  <strong>
                    {m.name}
                    {m.user_id === p.organizer_id ? " · Organizer" : ""}
                  </strong>
                  <small>{statusLabel[m.status] ?? m.status}</small>
                </div>
                {own && active && m.status === "requested" && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void command("participation", {
                          action: "approve",
                          target: m.user_id,
                        })
                      }
                    >
                      Approve {m.name}
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void command("participation", {
                          action: "reject",
                          target: m.user_id,
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
                {own &&
                  active &&
                  m.user_id !== user.id &&
                  [
                    "confirmed",
                    "interested",
                    "offered",
                    "reconfirmation",
                    "waitlisted",
                  ].includes(m.status) && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void command("participation", {
                          action: "remove",
                          target: m.user_id,
                        })
                      }
                    >
                      Remove {m.name}
                    </button>
                  )}
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
function CandidateCard({
  candidate: c,
  zone,
  disabled,
  own,
  vote,
  confirm,
}: {
  candidate: Candidate;
  zone: string;
  disabled: boolean;
  own: boolean;
  vote: (response: string) => void;
  confirm: () => void;
}) {
  return (
    <article className="candidate-card">
      <h3>{planDate(c.start_ms, zone)}</h3>
      <p>Until {planDate(c.end_ms, zone)}</p>
      <div className="action-row">
        {["Available", "Unavailable", "Maybe"].map((response) => (
          <button
            key={response}
            className="secondary"
            disabled={disabled}
            onClick={() => vote(response)}
          >
            {response} ({c.votes.filter((v) => v.response === response).length})
          </button>
        ))}
      </div>
      {own && (
        <button className="primary" disabled={disabled} onClick={confirm}>
          Confirm this time
        </button>
      )}
    </article>
  );
}
