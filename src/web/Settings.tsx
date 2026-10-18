import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { User } from "../server/auth";
import { Groups } from "./Groups";
import { TimeZoneField } from "./TimeZoneField";
export type Members = {
  members: User[];
  grants: { owner_id: string; viewer_id: string }[];
};
export function Settings({
  user,
  refresh,
}: {
  user: User;
  refresh: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Members>({ members: [], grants: [] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setMembers(await api<Members>("/members"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/profile", "PUT", {
        name: form.get("name"),
        zone: form.get("zone"),
      });
      await refresh();
      setNotice("Profile saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const share = async (viewer: string, enabled: boolean) => {
    setBusy(true);
    setError("");
    try {
      await api("/sharing", enabled ? "POST" : "DELETE", { viewer });
      await load();
      setNotice(
        enabled
          ? "Availability shared. Private labels stay private."
          : "Sharing revoked. Future requests will be denied.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A SPACE THAT FEELS LIKE YOU</p>
          <h1>
            People & settings<span className="title-dot">.</span>
          </h1>
          <p>Your profile, your privacy, your choice.</p>
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
      <div className="bottom-grid">
        <section className="panel">
          <h2>Your profile</h2>
          <form onSubmit={(e) => void save(e)}>
            <label>
              Display name
              <input
                name="name"
                required
                maxLength={80}
                defaultValue={user.name}
              />
            </label>
            <TimeZoneField label="IANA time zone" defaultValue={user.zone} />
            <p className="fine">
              Your browser suggests{" "}
              {Intl.DateTimeFormat().resolvedOptions().timeZone}. Choose and
              save your preferred zone; existing rules keep their original zone.
            </p>
            <button className="primary" disabled={busy}>
              Save profile
            </button>
          </form>
        </section>
        <section className="panel">
          <h2>Share a little, plan a lot</h2>
          <p>
            Your availability is private by default. Give another member access
            to Available / Busy / Unknown states. Private labels are never
            shared.
          </p>
          {members.members
            .filter((m) => m.id !== user.id)
            .map((m) => {
              const shared = members.grants.some(
                (g) => g.owner_id === user.id && g.viewer_id === m.id,
              );
              return (
                <div className="person-row" key={m.id}>
                  <span className="avatar">{m.name.slice(0, 1)}</span>
                  <div>
                    <strong>{m.name}</strong>
                    <small>
                      {shared
                        ? "Can view your availability"
                        : "No access to your availability"}
                    </small>
                  </div>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void share(m.id, !shared)}
                  >
                    {shared ? "Revoke" : "Share"}
                  </button>
                </div>
              );
            })}
          {members.members.length <= 1 && (
            <p className="notice">
              Join a group to find people here. Availability sharing is always
              your choice.
            </p>
          )}
        </section>
      </div>
      <Groups user={user} />
      <section className="panel provider-panel">
        <h2>Bring your calendars together</h2>
        <p>
          Calendar connections will be optional, with separate permission for
          reading availability and writing activities.
        </p>
        <div className="provider-grid">
          <div>
            <span className="provider-icon">G</span>
            <strong>Google Calendar</strong>
            <span className="pill">Coming later</span>
          </div>
          <div>
            <span className="provider-icon microsoft">▦</span>
            <strong>Microsoft Calendar</strong>
            <span className="pill">Coming later</span>
          </div>
        </div>
        <p className="fine">
          Calendar sync is not included in this preview. Google sign-in does not
          grant access to your calendar.
        </p>
      </section>
    </>
  );
}
