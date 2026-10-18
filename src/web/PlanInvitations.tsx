import { useEffect, useState, type FormEvent } from "react";
import type { PlanDetail } from "../domain/plans";
import type { Members } from "./Settings";
import { api } from "./api";

export function PlanInvitations({
  detail,
  onSave,
}: {
  detail: PlanDetail;
  onSave: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Members["members"]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void api<Members>("/members")
      .then((r) => setMembers(r.members))
      .catch((e: Error) => setError(e.message));
  }, []);
  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "").trim();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/plans/${detail.plan.id}/invitations`, "POST", {
        expectedVersion: detail.plan.version,
        ...(email ? { email } : { recipient: fields.get("recipient") }),
      });
      form.reset();
      await onSave();
      setNotice(
        "Invitation added. The plan is now available to that member; an inbox update will follow. No email is sent.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="Plan invitations">
      <h3>Invite more people</h3>
      <p>
        {detail.invitees.length} of 20 invitations used. Inviting someone does
        not reserve a place.
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
      <form className="inline-form" onSubmit={(e) => void invite(e)}>
        <label>
          Member to invite
          <select name="recipient" defaultValue="">
            <option value="">Choose someone</option>
            {members
              .filter(
                (m) =>
                  m.id !== detail.plan.organizer_id &&
                  !detail.invitees.includes(m.id),
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
        <button
          className="secondary"
          disabled={busy || Boolean(detail.plan.joining_closed)}
        >
          Add invitation
        </button>
      </form>
      <p className="fine">
        For email invitations, your friend must sign in to RUFree first. Reopen
        joining if it is closed.
      </p>
    </section>
  );
}
