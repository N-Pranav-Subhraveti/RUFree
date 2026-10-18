CREATE TABLE google_identities (
  subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE oauth_transactions (
  state_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  previous_session_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_expiry ON oauth_transactions(expires_at);
CREATE TRIGGER private_member_limit BEFORE INSERT ON google_identities
WHEN (SELECT count(*) FROM google_identities)>=20
BEGIN SELECT RAISE(ABORT,'private_member_limit'); END;
