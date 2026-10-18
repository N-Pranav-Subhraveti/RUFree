import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { User } from "../server/auth";
import type { Members } from "./Settings";
type GroupData = {
  groups: { id: string; name: string; owner_id: string }[];
  invitations: {
    id: string;
    group_id: string;
    name: string;
    expires_at: number;
  }[];
  memberships: { group_id: string; user_id: string; name: string }[];
  outgoing: { id: string; group_id: string; recipient_id: string }[];
};
export function Groups({ user }: { user: User }) {
  const [data, setData] = useState<GroupData>({
    groups: [],
    invitations: [],
    memberships: [],
    outgoing: [],
  });
  const [people, setPeople] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const load = async () => {
    try {
      const [g, m] = await Promise.all([
        api<GroupData>("/groups"),
        api<Members>("/members"),
      ]);
      setData(g);
      setPeople(m.members);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const create = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    setBusy(true);
    try {
      await api("/groups", "POST", { name });
      await load();
      setNotice("Group created.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const invite = async (e: FormEvent<HTMLFormElement>, group: string) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fields = new FormData(e.currentTarget);
      const email = String(fields.get("email") ?? "").trim();
      const r = await api<{ link: string }>(
        "/groups/" + group + "/invitations",
        "POST",
        email ? { email } : { recipient: fields.get("recipient") },
      );
      setLink(r.link);
      setNotice(
        "Invitation created for that account. Share the link or ask them to open their group invitations.",
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const command = async (path: string, method: string, input?: unknown) => {
    setError("");
    setBusy(true);
    try {
      await api(path, method, input);
      setLink("");
      setDeleting(null);
      await load();
      setNotice("Group updated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel">
      <h2>A group for your people</h2>
      <p>
        Group membership controls access to group plans. Availability sharing is
        a separate choice. Leaving or removing a member releases their places in
        upcoming group plans, except plans they organize.
      </p>
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
      {link && (
        <label>
          Account-bound invitation link
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <form onSubmit={(e) => void create(e)} className="inline-form">
        <label>
          New group name
          <input
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Weekend friends"
          />
        </label>
        <button className="primary" disabled={busy}>
          Create group
        </button>
      </form>
      {data.invitations.map((i) => (
        <div className="person-row" key={i.id}>
          <div>
            <strong>Invitation to {i.name}</strong>
            <small>Expires {new Date(i.expires_at).toLocaleDateString()}</small>
          </div>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void command("/group-invitations/" + i.id, "POST", {
                action: "accept",
              })
            }
          >
            Accept invitation
          </button>
          <button
            className="text-button"
            disabled={busy}
            onClick={() =>
              void command("/group-invitations/" + i.id, "POST", {
                action: "decline",
              })
            }
          >
            Decline
          </button>
        </div>
      ))}
      {data.groups.map((g) => (
        <article className="group-card" key={g.id}>
          <div className="section-heading">
            <h3>{g.name}</h3>
            <span className="pill">
              {g.owner_id === user.id ? "You own this group" : "Member"}
            </span>
          </div>
          {data.memberships
            .filter((m) => m.group_id === g.id)
            .map((m) => (
              <div className="person-row" key={m.user_id}>
                <span className="avatar">{m.name.slice(0, 1)}</span>
                <div>
                  <strong>{m.name}</strong>
                  <small>
                    {m.user_id === g.owner_id ? "Group owner" : "Member"}
                  </small>
                </div>
                {m.user_id !== g.owner_id &&
                  (user.id === g.owner_id || m.user_id === user.id) && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void command(
                          `/groups/${g.id}/members/${m.user_id}`,
                          "DELETE",
                        )
                      }
                    >
                      {m.user_id === user.id ? "Leave group" : "Remove member"}
                    </button>
                  )}
              </div>
            ))}
          {g.owner_id === user.id && (
            <>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void command(`/groups/${g.id}`, "PATCH", {
                    name: new FormData(e.currentTarget).get("name"),
                  });
                }}
              >
                <label>
                  Group name
                  <input
                    key={g.name}
                    name="name"
                    defaultValue={g.name}
                    required
                    maxLength={80}
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Rename group
                </button>
              </form>
              {deleting === g.id ? (
                <div role="group" aria-label={`Delete ${g.name}`}>
                  <p>
                    Delete {g.name}? This removes all memberships and
                    invitations, cancels unfinished group plans and releases
                    their places. Organizers retain their plan records. Personal
                    availability and direct sharing stay unchanged. This cannot
                    be undone.
                  </p>
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() =>
                      void command(`/groups/${g.id}`, "DELETE", {
                        confirm: true,
                      })
                    }
                  >
                    Confirm delete group
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setDeleting(null)}
                  >
                    Keep group
                  </button>
                </div>
              ) : (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => setDeleting(g.id)}
                >
                  Delete group
                </button>
              )}
              <form
                className="inline-form"
                onSubmit={(e) => void invite(e, g.id)}
              >
                <label>
                  Invite a member
                  <select name="recipient" defaultValue="">
                    <option value="">Choose someone</option>
                    {people
                      .filter(
                        (m) =>
                          m.id !== user.id &&
                          !data.memberships.some(
                            (x) => x.group_id === g.id && x.user_id === m.id,
                          ),
                      )
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Or invite by Google email
                  <input
                    name="email"
                    type="email"
                    maxLength={254}
                    placeholder="friend@gmail.com"
                  />
                </label>
                <button className="secondary" disabled={busy}>
                  Create invitation
                </button>
              </form>
              <p className="fine">
                Ask your friend to sign in to RUFree first, then enter their
                Google email. Invitations appear in the app; no email is sent.
              </p>
              {data.outgoing
                .filter((i) => i.group_id === g.id)
                .map((i) => (
                  <div className="person-row" key={i.id}>
                    <span>
                      Pending:{" "}
                      {people.find((p) => p.id === i.recipient_id)?.name ??
                        "Member"}
                    </span>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() =>
                        void command(
                          `/groups/${g.id}/invitations/${i.id}`,
                          "DELETE",
                        )
                      }
                    >
                      Revoke invitation
                    </button>
                  </div>
                ))}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
