import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api } from "./api";
import { Availability } from "./Availability";
import { FindTime } from "./FindTime";
import { Settings } from "./Settings";
import { Plans } from "./Plans";
import { Inbox } from "./Inbox";
import type { User } from "../server/auth";
import "./styles.css";
import "./plans.css";

type Session = { user: User | null; local: boolean; providersReady: boolean };
function App() {
  const [session, setSession] = useState<Session>();
  const [page, setPage] = useState(location.hash.slice(1) || "availability");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [member, setMember] = useState("local-alex");
  const googleSignIn = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ authorizationUrl: string }>(
        "/auth/google/start",
        "POST",
        {},
      );
      location.assign(result.authorizationUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const refresh = async () => {
    try {
      const [current, health] = await Promise.all([
        api<Session>("/session"),
        api<{ status: string }>("/health"),
      ]);
      if (health.status !== "ok")
        throw new Error("The local service is unavailable.");
      setSession(current);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const change = () => setPage(location.hash.slice(1) || "availability");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const signIn = async (member: string) => {
    setBusy(true);
    setError("");
    try {
      await api("/local-session", "POST", { member });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const signOut = async () => {
    try {
      await api("/session", "DELETE");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (page === "privacy" || page === "terms")
    return (
      <main className="policy">
        <a href="#availability">← Back to RUFree</a>
        <p className="eyebrow">RUFREE / PRIVATE PLANNING</p>
        <h1>
          {page === "privacy"
            ? "Your time stays yours."
            : "A little clarity before we plan."}
        </h1>
        <p>
          RUFree stores your profile, manual availability, plans, group
          membership, and sharing choices. Availability is private until its
          owner shares it. Shared entries reveal availability states, never
          private labels.
        </p>
        <p>
          {session?.local
            ? "This local workspace stores data on this computer and supports synthetic test profiles."
            : "This beta uses Google to verify identities and Cloudflare to host application data. It stores your Google account identifier and verified email; Google access tokens are not retained for sign-in."}{" "}
          Calendar sync and Microsoft integration are not available. Account
          data remains until the operator removes it; automatic account deletion
          and retention controls are not implemented in this preview.
        </p>
        <p>
          In-app planning does not reserve external calendars. Unknown
          availability is not a promise that someone is free.
        </p>
      </main>
    );
  if (!session?.user)
    return (
      <div className="landing">
        <header className="landing-header">
          <a className="brand" href="#availability">
            <span className="brand-symbol">r</span> RUFree
            <span className="brand-dot">●</span>
          </a>
          <span className="pill">A little more together</span>
        </header>
        <main className="welcome">
          <div>
            <p className="eyebrow">LESS COORDINATING. MORE CONNECTING.</p>
            <h1>
              Good things
              <br />
              start with
              <br />
              <em>finding time.</em>
            </h1>
            <p className="intro">
              A quiet place to share your availability and find a moment that
              works for your people.
            </p>
            <div className="welcome-note">
              <span>↗</span>
              <p>
                Weeknight dinners. Weekend walks.
                <br />
                The plans you’ve been meaning to make.
              </p>
            </div>
          </div>
          <section className="signin-card">
            <p className="eyebrow">WELCOME TO RUFREE</p>
            <h2>Make room for your people.</h2>
            <p>Keep your schedule private. Share only when you choose.</p>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            {new URLSearchParams(location.search).has("signin") && (
              <p role="alert" className="error">
                {new URLSearchParams(location.search).get("signin") ===
                "not-allowed"
                  ? "This Google account could not be admitted. A verified email is required."
                  : "Sign-in could not be completed. Please try again."}
              </p>
            )}
            {session?.providersReady && (
              <button
                className="primary wide"
                disabled={busy}
                onClick={() => void googleSignIn()}
              >
                Continue with Google
              </button>
            )}
            {!session ? (
              <p role="status">Connecting to RUFree…</p>
            ) : session.local ? (
              <>
                <div className="notice">
                  <strong>Local development workspace</strong>
                  <p>
                    These are synthetic test profiles for local development.
                  </p>
                </div>
                <label htmlFor="member">Try the app as</label>
                <select
                  id="member"
                  disabled={busy}
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                >
                  <option value="local-alex">Alex</option>
                  <option value="local-jamie">Jamie</option>
                  <option value="local-sam">Sam</option>
                </select>
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => void signIn(member)}
                >
                  {busy ? "Opening…" : "Open local workspace →"}
                </button>
              </>
            ) : !session.providersReady ? (
              <div className="notice">
                <strong>Private sign-in is not ready yet.</strong>
                <p>
                  Provider setup and verification are required before members
                  can sign in.
                </p>
              </div>
            ) : (
              <p className="fine">
                Anyone with a Google account can join the beta.
              </p>
            )}
            <p className="fine">
              No calendar connection required for manual availability.
            </p>
          </section>
        </main>
        <footer>
          <span>More time for what matters.</span>
          <div>
            <a href="#privacy">Privacy</a>
            <a href="#terms">Terms</a>
          </div>
        </footer>
      </div>
    );
  const user = session.user;
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="#availability">
          <span className="brand-symbol">r</span> RUFree
          <span className="brand-dot">●</span>
        </a>
        <p className="nav-caption">YOUR WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            ["availability", "▦", "My availability"],
            ["find-time", "◷", "Find a time"],
            ["plans", "◇", "Plans"],
            ["inbox", "▤", "Inbox"],
            ["settings", "⚙", "People & settings"],
          ].map(([id, icon, label]) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={page.split(/[/?]/)[0] === id ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span className="status-dot" />{" "}
            {session.local ? "Local development" : "Public beta"}
          </div>
          <p>
            Manual planning is ready to try.
            <br />
            Calendar sync is coming later.
          </p>
          <a href="#privacy">Privacy & data</a>
          <button className="profile-button" onClick={() => void signOut()}>
            <span className="avatar">{user.name.slice(0, 1)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Sign out</small>
            </span>
            <span>↗</span>
          </button>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <span>YOUR TIME, YOUR TERMS</span>
          <span>
            {user.zone.replaceAll("_", " ")} <span aria-hidden="true">◷</span>
          </span>
        </header>
        <main id="main" key={`${page}-${user.id}`}>
          <div className="development-banner">
            {session.local ? "LOCAL PREVIEW" : "PRIVATE PREVIEW"}{" "}
            <span>
              {session.local
                ? "Local workspace · calendars not connected · data stays on this machine"
                : "Open Google registration · manual planning · calendars not connected"}
            </span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {page === "find-time" ? (
            <FindTime user={user} />
          ) : page.startsWith("plans") ? (
            <Plans user={user} planId={page.split("/")[1]} />
          ) : page === "inbox" ? (
            <Inbox local={session.local} />
          ) : page.startsWith("settings") ? (
            <Settings user={user} refresh={refresh} />
          ) : (
            <Availability user={user} />
          )}
        </main>
        <footer>
          <span>Make time for the good stuff.</span>
          <a href="#terms">About this preview</a>
        </footer>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
