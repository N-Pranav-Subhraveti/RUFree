PRAGMA foreign_keys = ON;
CREATE TABLE users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  zone TEXT NOT NULL DEFAULT 'Asia/Seoul', status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, authenticated_at INTEGER NOT NULL
);
CREATE INDEX session_expiry ON sessions(expires_at);
CREATE TABLE availability_entries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start TEXT NOT NULL, end TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('Available','Busy')),
  zone TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', CHECK(end > start)
);
CREATE INDEX availability_window ON availability_entries(user_id, start, end);
CREATE TABLE availability_rules (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 1 AND 7), start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  effective_start TEXT NOT NULL, effective_end TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('Available','Busy')), zone TEXT NOT NULL,
  disambiguation TEXT NOT NULL DEFAULT 'reject' CHECK(disambiguation IN ('reject','earlier','later'))
);
CREATE INDEX rules_owner ON availability_rules(user_id, effective_start, effective_end);
CREATE TABLE availability_versions (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, version INTEGER NOT NULL DEFAULT 0);
CREATE TRIGGER entry_insert AFTER INSERT ON availability_entries BEGIN
  INSERT INTO availability_versions VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER entry_delete AFTER DELETE ON availability_entries BEGIN
  UPDATE availability_versions SET version=version+1 WHERE user_id=OLD.user_id;
END;
CREATE TRIGGER entry_update AFTER UPDATE ON availability_entries BEGIN
  UPDATE availability_versions SET version=version+1 WHERE user_id=NEW.user_id;
END;
CREATE TRIGGER rule_insert AFTER INSERT ON availability_rules BEGIN
  INSERT INTO availability_versions VALUES(NEW.user_id,1) ON CONFLICT(user_id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER rule_delete AFTER DELETE ON availability_rules BEGIN
  UPDATE availability_versions SET version=version+1 WHERE user_id=OLD.user_id;
END;
CREATE TRIGGER rule_update AFTER UPDATE ON availability_rules BEGIN
  UPDATE availability_versions SET version=version+1 WHERE user_id=NEW.user_id;
END;
CREATE TABLE sharing_grants (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY(owner_id, viewer_id), CHECK(owner_id != viewer_id)
);
