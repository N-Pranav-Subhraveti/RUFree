import { useEffect, useState } from "react";
import { api } from "./api";
type Notice = {
  id: string;
  event: string;
  plan_id: string;
  title: string;
  status: string;
  created_at: number;
  read_at: number | null;
};
const descriptions: Record<string, string> = {
  invited: "You’re invited to this plan. Open it to join or respond.",
  confirmed: "Your place is confirmed.",
  interested: "You have a place while the time is being decided.",
  requested: "Your request is awaiting approval.",
  waitlisted: "You joined the waitlist.",
  offered: "A place is being held for you. Respond before the deadline.",
  reconfirmation: "The plan changed. Please reconfirm your place.",
  left: "You left this plan.",
  removed: "The organizer removed your place.",
  rejected: "Your request was declined.",
  cancelled: "The plan was cancelled.",
  expired: "Your response deadline passed.",
  declined: "You declined your place.",
  "plan:confirmed": "This plan was updated. Open it for the latest details.",
  "plan:cancelled": "The plan was cancelled.",
  "plan:completed": "The plan has ended.",
  "plan:proposed": "A time is being proposed.",
};
export function Inbox({ local = false }: { local?: boolean }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setItems(
        (await api<{ notifications: Notice[] }>("/notifications"))
          .notifications,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const refresh = async () => {
    setBusy(true);
    try {
      for (let i = 0; local && i < 10; i++) {
        const r = await api<{ processed: number }>("/local-jobs", "POST", {});
        if (!r.processed) break;
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const read = async (id: string) => {
    try {
      await api("/notifications/read", "POST", { id });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KEEP EVERYONE IN THE LOOP</p>
          <h1>
            Your inbox<span className="title-dot">.</span>
          </h1>
          <p>
            Plan updates, place offers, and the things that need your attention.
          </p>
        </div>
        <button
          className="primary"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? "Refreshing…" : "Refresh inbox"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <p className="notice">
        Updates are stored for your next visit. This preview does not send email
        or notify a closed browser.{" "}
        {local
          ? "Refresh processes pending local notifications."
          : "Updates appear after background processing; refresh to check for new notices."}
      </p>
      <section className="panel">
        {!items.length ? (
          <div className="empty">
            <h2>You’re all caught up.</h2>
            <p>No current plan updates to show.</p>
          </div>
        ) : (
          items.map((n) => (
            <article className="notification-card" key={n.id}>
              <div>
                <span className="pill">{n.read_at ? "Read" : "New"}</span>
                <h2>
                  <a href={"#plans/" + n.plan_id}>{n.title}</a>
                </h2>
                <p>
                  {descriptions[n.event] ?? "Your plan membership changed."}
                </p>
                <small>{new Date(n.created_at).toLocaleString()}</small>
              </div>
              {!n.read_at && (
                <button className="secondary" onClick={() => void read(n.id)}>
                  Mark read
                </button>
              )}
            </article>
          ))
        )}
      </section>
    </>
  );
}
